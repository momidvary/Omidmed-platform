-- Bind every new clinician intake case to a real patient and care episode.
-- Run after 005_ai_governance.sql.
--
-- Existing detached rows are preserved for an explicit remediation pass. The
-- NOT VALID constraints protect every new/updated row immediately and can be
-- validated after legacy cases have been linked or archived.

begin;

alter table public.cases
  add column if not exists episode_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cases'::regclass
      and conname = 'cases_episode_id_fkey'
  ) then
    alter table public.cases
      add constraint cases_episode_id_fkey
      foreign key (episode_id)
      references public.care_episodes (id)
      on delete restrict
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.cases'::regclass
      and conname = 'cases_patient_episode_required_check'
  ) then
    alter table public.cases
      add constraint cases_patient_episode_required_check
      check (patient_id is not null and episode_id is not null)
      not valid;
  end if;
end $$;

create index if not exists cases_episode_id_idx
  on public.cases (episode_id);

create or replace function private.validate_case_episode_linkage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_episode_patient uuid;
  v_episode_clinic uuid;
begin
  if new.patient_id is null or new.episode_id is null then
    raise exception using
      errcode = '23514',
      message = 'A case must be linked to both a patient and a care episode';
  end if;

  select e.patient_id, p.clinic_id
    into v_episode_patient, v_episode_clinic
  from public.care_episodes e
  join public.patients p on p.id = e.patient_id
  where e.id = new.episode_id;

  if not found then
    raise exception using
      errcode = '23503',
      message = 'The selected care episode does not exist';
  end if;
  if v_episode_patient is distinct from new.patient_id then
    raise exception using
      errcode = '23514',
      message = 'The selected care episode belongs to a different patient';
  end if;
  if v_episode_clinic is distinct from new.clinic_id then
    raise exception using
      errcode = '23514',
      message = 'The selected care episode belongs to a different clinic';
  end if;

  return new;
end;
$$;

revoke all on function private.validate_case_episode_linkage() from public;

drop trigger if exists validate_case_episode_linkage on public.cases;
create trigger validate_case_episode_linkage
before insert or update of patient_id, episode_id, clinic_id
on public.cases
for each row execute function private.validate_case_episode_linkage();

-- 004 made patient_id immutable. Replace only the cases trigger so a legacy
-- row may be linked exactly once; an established patient/episode link remains
-- immutable afterwards.
create or replace function private.enforce_case_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.id is distinct from new.id
     or old.clinic_id is distinct from new.clinic_id
     or old.created_by is distinct from new.created_by
     or old.created_at is distinct from new.created_at then
    raise exception using
      errcode = '23514',
      message = 'Case identity, tenant, author, and creation time are immutable';
  end if;

  if old.patient_id is not null
     and old.patient_id is distinct from new.patient_id then
    raise exception using
      errcode = '23514',
      message = 'An established case patient link is immutable';
  end if;
  if old.episode_id is not null
     and old.episode_id is distinct from new.episode_id then
    raise exception using
      errcode = '23514',
      message = 'An established case episode link is immutable';
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_case_identity() from public;

drop trigger if exists immutable_identity_fields on public.cases;
create trigger immutable_identity_fields
before update on public.cases
for each row execute function private.enforce_case_identity();

comment on column public.cases.episode_id is
  'Care episode selected at intake; must belong to cases.patient_id and clinic_id.';

commit;
