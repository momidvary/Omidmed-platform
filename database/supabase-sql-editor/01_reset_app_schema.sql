-- PhysioAI — reset the app schema before a clean install (SQL Editor).
--
-- Use ONLY on a project whose app tables hold no real data, e.g. one that
-- was set up from an older branch (migrations 001–003, phone-OTP 004, …)
-- and must move to the current 001–025 line, or after a failed install.
--
-- What it removes: every table, view, function, type and sequence in the
-- `public` schema (except extension-owned objects), the `private` schema,
-- and the app trigger on auth.users.
-- What it keeps: Supabase Auth users (auth.*), storage, extensions.
--
-- Guard: it refuses to run if any patient record exists.

do $guard$
begin
  if to_regclass('public.patients') is not null then
    if exists (select 1 from public.patients) then
      raise exception using
        errcode = '55000',
        message = 'Refusing to reset: public.patients contains records. Back up and migrate this database instead.';
    end if;
  end if;
end
$guard$;

drop trigger if exists on_auth_user_created on auth.users;

do $reset$
declare
  item record;
begin
  -- Views first (they may depend on tables).
  for item in
    select c.relname, c.relkind
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v', 'm')
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
      )
  loop
    if item.relkind = 'm' then
      execute format('drop materialized view if exists public.%I cascade', item.relname);
    else
      execute format('drop view if exists public.%I cascade', item.relname);
    end if;
  end loop;

  for item in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
      )
  loop
    execute format('drop table if exists public.%I cascade', item.relname);
  end loop;

  for item in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e'
      )
  loop
    execute format('drop sequence if exists public.%I cascade', item.relname);
  end loop;

  for item in
    select p.oid::regprocedure as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
      )
  loop
    execute format('drop routine if exists %s cascade', item.signature);
  end loop;

  for item in
    select t.typname
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typtype in ('e', 'd', 'c')
      and (t.typrelid = 0 or (select relkind from pg_class where oid = t.typrelid) = 'c')
      and not exists (
        select 1 from pg_depend d
        where d.classid = 'pg_type'::regclass and d.objid = t.oid and d.deptype = 'e'
      )
  loop
    execute format('drop type if exists public.%I cascade', item.typname);
  end loop;
end
$reset$;

drop schema if exists private cascade;

select 'App schema reset. Now run 02_all_migrations.sql.' as result;
