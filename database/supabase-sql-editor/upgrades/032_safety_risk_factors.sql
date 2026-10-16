-- GENERATED FILE — do not edit. Rebuild with:
--   node database/scripts/build-sql-editor-bundle.mjs
--
-- Upgrade for projects installed from the SQL Editor bundle: applies
-- 032_safety_risk_factors.sql once and records it in public.schema_migrations
-- (same checksum as migrate.mjs). Paste the whole file and press Run.

do $preflight$
declare
  v_previous text;
  v_this text;
begin
  if to_regclass('public.schema_migrations') is null then
    raise exception using errcode = '55000',
      message = 'No migration ledger. Install with 02_all_migrations.sql instead.';
  end if;
  execute $q$select status from public.schema_migrations where version = '031'$q$ into v_previous;
  execute $q$select status from public.schema_migrations where version = '032'$q$ into v_this;
  if v_this = 'applied' then
    raise exception using errcode = '55000',
      message = 'Already applied: 032_safety_risk_factors.sql. Nothing to do.';
  end if;
  if v_this is not null then
    raise exception using errcode = '55000',
      message = 'A previous run of 032_safety_risk_factors.sql stopped part-way. Ask for help before retrying.';
  end if;
  if v_previous is distinct from 'applied' then
    raise exception using errcode = '55000',
      message = 'Apply 031_exercise_library_expansion.sql first.';
  end if;
end
$preflight$;

insert into public.schema_migrations (version, filename, checksum, status)
values ('032', '032_safety_risk_factors.sql', '83a5fb9abaced507a3da002d1a40a0de22a26a63dba4be52d27a57001a044e10', 'applying');

-- Safety screen: separate risk factors from warning signs.
-- Run after 031_exercise_library_expansion.sql.
--
-- The IFOMPT international framework (Finucane et al., 2020) distinguishes
-- risk factors (history items that raise the index of suspicion, such as a
-- past malignancy, recent surgery or long-term corticosteroids) from warning
-- signs (current presentations that need medical assessment). Before this
-- migration a risk factor on its own produced a "medical-review" disposition
-- and locked treatment, so a patient who honestly reported recent surgery
-- could not receive a post-operative program.
--
-- After this migration:
--   * warning signs stay in safety_red_flag_catalog / red_flag_ids and keep
--     blocking treatment exactly as before;
--   * risk factors are recorded in a separate risk_factor_ids array, are
--     validated against a server-owned catalog, are kept in the append-only
--     screen history, and do not change the disposition;
--   * new warning signs: history of cancer with new spinal pain, cervical
--     arterial dysfunction (5 D's / 3 N's), upper motor neuron signs,
--     possible abdominal aortic aneurysm and possible giant cell arteritis.
--
-- Existing screens are not rewritten. A case screened under the old rules
-- keeps its stored disposition until a clinician records a new screen.

begin;

-- --------------------------------------------------------------------------
-- 1) Catalogs
-- --------------------------------------------------------------------------

create table if not exists public.safety_risk_factor_catalog (
  id text primary key,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (char_length(id) between 3 and 100)
);

insert into public.safety_risk_factor_catalog (id)
values
  ('rf_cancer'),
  ('rf_steroids'),
  ('rf_immuno'),
  ('rf_dvt_risk'),
  ('rf_age_over50')
on conflict (id) do update set active = true;

alter table public.safety_risk_factor_catalog enable row level security;
revoke all on table public.safety_risk_factor_catalog
  from public, anon, authenticated, service_role;
grant select on table public.safety_risk_factor_catalog to authenticated;
drop policy if exists "authenticated risk factor catalog read"
  on public.safety_risk_factor_catalog;
create policy "authenticated risk factor catalog read"
  on public.safety_risk_factor_catalog for select to authenticated
  using (active);

-- Risk factors are no longer accepted as warning signs.
update public.safety_red_flag_catalog
set active = false
where id in ('rf_cancer', 'rf_steroids', 'rf_immuno', 'rf_dvt_risk');

insert into public.safety_red_flag_catalog (id, disposition, severity_rank)
values
  ('rf_cancer_spinal', 'urgent', 2),
  ('rf_cad', 'emergency', 3),
  ('rf_umn', 'urgent', 2),
  ('rf_aaa', 'emergency', 3),
  ('rf_gca', 'urgent', 2)
on conflict (id) do update
set disposition = excluded.disposition,
    severity_rank = excluded.severity_rank,
    active = true;

-- --------------------------------------------------------------------------
-- 2) Storage
-- --------------------------------------------------------------------------

alter table public.cases
  add column if not exists risk_factor_ids text[] not null default '{}'::text[];
alter table public.case_safety_screens
  add column if not exists risk_factor_ids text[] not null default '{}'::text[];

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cases'::regclass
      and conname = 'cases_risk_factor_ids_check'
  ) then
    alter table public.cases
      add constraint cases_risk_factor_ids_check
      check (
        cardinality(risk_factor_ids) <= 50
        and array_position(risk_factor_ids, null) is null
        and (safety_disposition <> 'not-screened' or cardinality(risk_factor_ids) = 0)
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.case_safety_screens'::regclass
      and conname = 'case_safety_screens_risk_factor_ids_check'
  ) then
    alter table public.case_safety_screens
      add constraint case_safety_screens_risk_factor_ids_check
      check (
        cardinality(risk_factor_ids) <= 50
        and array_position(risk_factor_ids, null) is null
      );
  end if;
end $$;

comment on column public.cases.risk_factor_ids is
  'Recorded safety risk factors (heightened vigilance). They do not change safety_disposition.';

-- --------------------------------------------------------------------------
-- 3) The screen RPC accepts risk factors separately
-- --------------------------------------------------------------------------

drop function if exists public.record_case_safety_screen(uuid, text[], text, text);

create or replace function public.record_case_safety_screen(
  p_case_id uuid,
  p_red_flag_ids text[],
  p_notes text default null,
  p_action_taken text default null,
  p_risk_factor_ids text[] default '{}'::text[]
)
returns table (
  screen_id uuid,
  case_id uuid,
  disposition text,
  red_flag_ids text[],
  notes text,
  action_taken text,
  screened_by uuid,
  screened_at timestamptz,
  risk_factor_ids text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_case public.cases%rowtype;
  v_flags text[];
  v_risks text[];
  v_disposition text;
  v_notes text := nullif(btrim(p_notes), '');
  v_action text := nullif(btrim(p_action_taken), '');
  v_screen public.case_safety_screens%rowtype;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using
      errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if p_case_id is null
     or (v_notes is not null and char_length(v_notes) > 10000)
     or (v_action is not null and char_length(v_action) > 4000) then
    raise exception using errcode = '22023', message = 'Safety-screen input is invalid';
  end if;

  select coalesce(array_agg(flag_id order by flag_id), '{}'::text[])
    into v_flags
  from (
    select distinct btrim(value) as flag_id
    from unnest(coalesce(p_red_flag_ids, '{}'::text[])) as flags(value)
    where btrim(value) <> ''
  ) normalized;

  select coalesce(array_agg(risk_id order by risk_id), '{}'::text[])
    into v_risks
  from (
    select distinct btrim(value) as risk_id
    from unnest(coalesce(p_risk_factor_ids, '{}'::text[])) as risks(value)
    where btrim(value) <> ''
  ) normalized;

  if cardinality(v_flags) > 100
     or exists (
       select 1
       from unnest(v_flags) flag_id
       left join public.safety_red_flag_catalog catalog
         on catalog.id = flag_id and catalog.active
       where catalog.id is null
     ) then
    raise exception using errcode = '22023', message = 'Safety-screen flags are invalid';
  end if;

  if cardinality(v_risks) > 50
     or exists (
       select 1
       from unnest(v_risks) risk_id
       left join public.safety_risk_factor_catalog catalog
         on catalog.id = risk_id and catalog.active
       where catalog.id is null
     ) then
    raise exception using errcode = '22023', message = 'Safety-screen risk factors are invalid';
  end if;

  if cardinality(v_flags) = 0 then
    v_disposition := 'clear';
    -- A note on how risk factors will be monitored is kept, but it is not an
    -- escalation action.
    v_action := null;
  else
    select catalog.disposition into v_disposition
    from public.safety_red_flag_catalog catalog
    where catalog.id = any(v_flags)
    order by catalog.severity_rank desc
    limit 1;
    if v_action is null or char_length(v_action) < 3 then
      raise exception using
        errcode = '22023',
        message = 'Documented escalation or referral action is required';
    end if;
  end if;

  select patient_case.* into v_case
  from public.cases patient_case
  where patient_case.id = p_case_id
  for update;
  if not found or v_case.patient_id is null or v_case.episode_id is null then
    raise exception using errcode = '22023', message = 'A linked case is required';
  end if;
  if not private.clinician_can_access_ai_case(
    v_actor, v_case.id, v_case.clinic_id
  ) then
    raise exception using errcode = '42501', message = 'Case access is not permitted';
  end if;

  update public.cases patient_case
  set red_flag_ids = v_flags,
      risk_factor_ids = v_risks,
      safety_disposition = v_disposition,
      safety_notes = v_notes,
      safety_action_taken = v_action,
      safety_screened_at = clock_timestamp()
  where patient_case.id = v_case.id
  returning patient_case.* into v_case;

  select history.* into v_screen
  from public.case_safety_screens history
  where history.case_id = v_case.id
    and history.screened_at = v_case.safety_screened_at;
  if not found then
    raise exception using errcode = '55000', message = 'Safety history was not recorded';
  end if;

  return query select
    v_screen.id, v_screen.case_id, v_screen.disposition,
    v_screen.red_flag_ids, v_screen.notes, v_screen.action_taken,
    v_screen.screened_by, v_screen.screened_at, v_screen.risk_factor_ids;
end;
$$;

revoke all on function public.record_case_safety_screen(
  uuid, text[], text, text, text[]
) from public, anon, service_role;
grant execute on function public.record_case_safety_screen(
  uuid, text[], text, text, text[]
) to authenticated;

-- --------------------------------------------------------------------------
-- 4) Triggers: stamp, validate and record risk factors
-- --------------------------------------------------------------------------

create or replace function private.stamp_case_safety_screen()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_changed boolean := false;
  v_rpc_owner text;
begin
  if tg_op = 'INSERT' then
    v_changed := true;
  else
    v_changed := new.safety_disposition is distinct from old.safety_disposition
      or new.red_flag_ids is distinct from old.red_flag_ids
      or new.risk_factor_ids is distinct from old.risk_factor_ids
      or new.safety_notes is distinct from old.safety_notes
      or new.safety_action_taken is distinct from old.safety_action_taken
      or new.safety_screened_by is distinct from old.safety_screened_by
      or new.safety_screened_at is distinct from old.safety_screened_at;
  end if;
  if not v_changed then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    select pg_catalog.pg_get_userbyid(proc.proowner)
      into v_rpc_owner
    from pg_catalog.pg_proc proc
    where proc.oid =
      'public.record_case_safety_screen(uuid,text[],text,text,text[])'::regprocedure;
    if current_user::text is distinct from v_rpc_owner then
      raise exception using
        errcode = '42501',
        message = 'Use record_case_safety_screen to change safety state';
    end if;
  end if;

  new.red_flag_ids := coalesce(new.red_flag_ids, '{}'::text[]);
  new.risk_factor_ids := coalesce(new.risk_factor_ids, '{}'::text[]);

  if tg_op = 'INSERT' and new.safety_disposition <> 'not-screened' then
    -- An intake may carry its first screen. Accept only catalog items and
    -- derive the disposition on the server instead of trusting the browser.
    if exists (
         select 1
         from unnest(new.red_flag_ids) flag_id
         left join public.safety_red_flag_catalog catalog
           on catalog.id = flag_id and catalog.active
         where catalog.id is null
       )
       or exists (
         select 1
         from unnest(new.risk_factor_ids) risk_id
         left join public.safety_risk_factor_catalog catalog
           on catalog.id = risk_id and catalog.active
         where catalog.id is null
       ) then
      raise exception using errcode = '22023', message = 'Safety-screen items are invalid';
    end if;
    if cardinality(new.red_flag_ids) = 0 then
      new.safety_disposition := 'clear';
    else
      select catalog.disposition into new.safety_disposition
      from public.safety_red_flag_catalog catalog
      where catalog.id = any(new.red_flag_ids)
      order by catalog.severity_rank desc
      limit 1;
    end if;
  end if;

  if new.safety_disposition = 'not-screened' then
    new.red_flag_ids := '{}'::text[];
    new.risk_factor_ids := '{}'::text[];
    new.safety_notes := null;
    new.safety_action_taken := null;
    new.safety_screened_by := null;
    new.safety_screened_at := null;
  elsif auth.uid() is null then
    raise exception using
      errcode = '23514',
      message = 'A completed safety screen requires an authenticated reviewer';
  else
    new.safety_screened_by := auth.uid();
    new.safety_screened_at := clock_timestamp();
  end if;
  return new;
end;
$$;

drop trigger if exists cases_stamp_safety_screen on public.cases;
create trigger cases_stamp_safety_screen
before insert or update of safety_disposition, red_flag_ids, risk_factor_ids,
  safety_notes, safety_action_taken, safety_screened_by, safety_screened_at
on public.cases
for each row execute function private.stamp_case_safety_screen();

create or replace function private.persist_case_safety_effects()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.safety_screened_at is not null
     and not (
       tg_op = 'UPDATE'
       and new.safety_screened_at is not distinct from old.safety_screened_at
     ) then
    insert into public.case_safety_screens (
      case_id, clinic_id, patient_id, disposition, red_flag_ids,
      risk_factor_ids, notes, action_taken, screened_by, screened_at
    ) values (
      new.id, new.clinic_id, new.patient_id, new.safety_disposition,
      new.red_flag_ids, new.risk_factor_ids, new.safety_notes,
      new.safety_action_taken, new.safety_screened_by, new.safety_screened_at
    ) on conflict (case_id, screened_at) do nothing;
  end if;

  if new.safety_disposition <> 'clear' then
    update public.exercise_prescriptions prescription
    set status = 'revoked',
        revoked_by = new.safety_screened_by,
        revoked_at = clock_timestamp()
    where prescription.case_id = new.id
      and prescription.status in ('published', 'suspended');

    update public.treatment_plans plan
    set status = 'superseded',
        superseded_by = new.safety_screened_by,
        superseded_at = clock_timestamp(),
        supersede_reason = 'Invalidated by a non-clear safety re-screen'
    where plan.episode_id = new.episode_id
      and plan.status = 'approved';
  end if;
  return new;
end;
$$;

revoke all on function private.persist_case_safety_effects()
  from public, anon, authenticated, service_role;
drop trigger if exists cases_persist_safety_effects on public.cases;
create trigger cases_persist_safety_effects
after insert or update of safety_disposition, red_flag_ids, risk_factor_ids,
  safety_notes, safety_action_taken, safety_screened_by, safety_screened_at
on public.cases
for each row execute function private.persist_case_safety_effects();

comment on function public.record_case_safety_screen(uuid, text[], text, text, text[]) is
  'Records a clinician safety screen. Warning signs set the disposition; risk factors are recorded for vigilance only.';

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '032' and status = 'applying';

select '032_safety_risk_factors.sql applied' as result;
