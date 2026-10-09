-- GENERATED FILE — do not edit. Rebuild with:
--   node database/scripts/build-sql-editor-bundle.mjs
--
-- Upgrade for projects installed from the SQL Editor bundle: applies
-- 029_case_clinical_findings.sql once and records it in public.schema_migrations
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
  execute $q$select status from public.schema_migrations where version = '028'$q$ into v_previous;
  execute $q$select status from public.schema_migrations where version = '029'$q$ into v_this;
  if v_this = 'applied' then
    raise exception using errcode = '55000',
      message = 'Already applied: 029_case_clinical_findings.sql. Nothing to do.';
  end if;
  if v_this is not null then
    raise exception using errcode = '55000',
      message = 'A previous run of 029_case_clinical_findings.sql stopped part-way. Ask for help before retrying.';
  end if;
  if v_previous is distinct from 'applied' then
    raise exception using errcode = '55000',
      message = 'Apply 028_patient_phone_accounts.sql first.';
  end if;
end
$preflight$;

insert into public.schema_migrations (version, filename, checksum, status)
values ('029', '029_case_clinical_findings.sql', 'acbab910a3db6a88a6f7665a9791056f0eef4025c1caaaedf479374d47c93f00', 'applying');

-- PhysioAI — Migration 029: structured clinical findings (run after 028).
--
-- Clinicians record structured history answers (yes/no per region question),
-- irritability, examination test results (positive/negative/equivocal) and
-- short examination notes for a case. The app ranks provisional hypotheses
-- from these findings and passes them to the audited AI draft as context.
--
-- Findings are append-only versions: each save names the version it
-- supersedes (stale-write safe), is attributed to auth.uid() by the
-- database, and is readable only by clinicians who may manage the patient's
-- clinical record. Patients, clinic staff and platform admins get no access.

begin;

-- Mirrors ClinicalFindingsSchema in apps/web/lib/clinical/reasoning/findings.ts.
create or replace function private.is_valid_case_findings_payload(p_findings jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_intake jsonb;
  v_exam jsonb;
  v_answers jsonb;
  v_tests jsonb;
  v_notes jsonb;
begin
  if p_findings is null
     or jsonb_typeof(p_findings) is distinct from 'object'
     or octet_length(p_findings::text) > 32768 then
    return false;
  end if;
  if exists (
       select 1 from jsonb_object_keys(p_findings) as key
       where key not in ('intake', 'exam')
     ) then
    return false;
  end if;

  v_intake := p_findings -> 'intake';
  v_exam := p_findings -> 'exam';
  if jsonb_typeof(v_intake) is distinct from 'object'
     or jsonb_typeof(v_exam) is distinct from 'object' then
    return false;
  end if;

  if exists (
       select 1 from jsonb_object_keys(v_intake) as key
       where key not in ('answers', 'irritability')
     )
     or not (v_intake ? 'answers')
     or not (v_intake ? 'irritability') then
    return false;
  end if;
  if jsonb_typeof(v_intake -> 'irritability') = 'null' then
    null;
  elsif jsonb_typeof(v_intake -> 'irritability') is distinct from 'string'
     or (v_intake ->> 'irritability') not in ('low', 'moderate', 'high') then
    return false;
  end if;

  v_answers := v_intake -> 'answers';
  if jsonb_typeof(v_answers) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(v_answers)) > 80
     or exists (
       select 1 from jsonb_each(v_answers) as entry
       where entry.key !~ '^[a-z][a-z0-9_]{0,63}$'
          or jsonb_typeof(entry.value) is distinct from 'string'
          or (entry.value #>> '{}') not in ('yes', 'no', 'unknown')
     ) then
    return false;
  end if;

  if exists (
       select 1 from jsonb_object_keys(v_exam) as key
       where key not in ('tests', 'notes')
     )
     or not (v_exam ? 'tests')
     or not (v_exam ? 'notes') then
    return false;
  end if;

  v_tests := v_exam -> 'tests';
  if jsonb_typeof(v_tests) is distinct from 'object'
     or (select count(*) from jsonb_object_keys(v_tests)) > 80
     or exists (
       select 1 from jsonb_each(v_tests) as entry
       where entry.key !~ '^[a-z][a-z0-9_]{0,63}$'
          or jsonb_typeof(entry.value) is distinct from 'string'
          or (entry.value #>> '{}') not in ('positive', 'negative', 'equivocal')
     ) then
    return false;
  end if;

  v_notes := v_exam -> 'notes';
  if jsonb_typeof(v_notes) is distinct from 'object'
     or exists (
       select 1 from jsonb_each(v_notes) as entry
       where entry.key not in (
               'observation', 'rom', 'strength', 'neuro', 'palpation',
               'functional', 'other'
             )
          or jsonb_typeof(entry.value) is distinct from 'string'
          or char_length(entry.value #>> '{}') > 2000
     ) then
    return false;
  end if;

  return true;
end;
$$;
revoke all on function private.is_valid_case_findings_payload(jsonb)
  from public, anon, authenticated, service_role;

create table if not exists public.case_clinical_findings (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.cases (id) on delete restrict,
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  patient_id uuid not null references public.patients (id) on delete restrict,
  episode_id uuid not null references public.care_episodes (id) on delete restrict,
  version integer not null check (version between 1 and 1000000),
  region text not null check (
    region in (
      'neck', 'shoulder', 'low-back', 'hip', 'knee', 'ankle-foot',
      'post-op', 'neuro', 'sports'
    )
  ),
  knowledge_version text not null
    check (knowledge_version ~ '^[a-z0-9][a-z0-9.-]{0,39}$'),
  findings jsonb not null,
  authored_by uuid not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default clock_timestamp(),
  supersedes_id uuid
    references public.case_clinical_findings (id) on delete restrict,
  unique (case_id, version),
  check (
    (version = 1 and supersedes_id is null)
    or (version > 1 and supersedes_id is not null)
  )
);

create unique index if not exists case_clinical_findings_one_successor_idx
  on public.case_clinical_findings (supersedes_id)
  where supersedes_id is not null;
create index if not exists case_clinical_findings_case_current_idx
  on public.case_clinical_findings (case_id, version desc);

alter table public.case_clinical_findings enable row level security;
revoke all on table public.case_clinical_findings
  from public, anon, authenticated, service_role;
grant select on table public.case_clinical_findings to authenticated;

drop policy if exists "case findings clinician read"
  on public.case_clinical_findings;
create policy "case findings clinician read"
  on public.case_clinical_findings for select to authenticated
  using (private.can_manage_clinical_record(patient_id));

create or replace function private.reject_case_findings_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = 'Clinical findings history is append-only; record a new version';
end;
$$;
revoke all on function private.reject_case_findings_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists case_clinical_findings_immutable
  on public.case_clinical_findings;
create trigger case_clinical_findings_immutable
before update or delete on public.case_clinical_findings
for each row execute function private.reject_case_findings_mutation();
drop trigger if exists case_clinical_findings_no_truncate
  on public.case_clinical_findings;
create trigger case_clinical_findings_no_truncate
before truncate on public.case_clinical_findings
for each statement execute function private.reject_case_findings_mutation();

-- Tenant identity, payload shape and a single linear chain, even for
-- trusted SQL that bypasses the RPC.
create or replace function private.validate_case_findings_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case public.cases%rowtype;
  v_parent public.case_clinical_findings%rowtype;
begin
  select patient_case.* into v_case
  from public.cases patient_case
  where patient_case.id = new.case_id
  for key share;
  if not found
     or new.clinic_id is distinct from v_case.clinic_id
     or new.patient_id is distinct from v_case.patient_id
     or new.episode_id is distinct from v_case.episode_id
     or new.region is distinct from v_case.region then
    raise exception using
      errcode = '23514', message = 'Findings identity does not match its case';
  end if;
  if not private.is_valid_case_findings_payload(new.findings) then
    raise exception using
      errcode = '22023', message = 'Findings payload is invalid';
  end if;

  if new.version = 1 then
    if exists (
      select 1 from public.case_clinical_findings existing
      where existing.case_id = new.case_id
    ) then
      raise exception using
        errcode = '23514', message = 'Initial findings version already exists';
    end if;
  else
    select parent.* into v_parent
    from public.case_clinical_findings parent
    where parent.id = new.supersedes_id
    for key share;
    if not found
       or v_parent.case_id <> new.case_id
       or new.version <> v_parent.version + 1
       or exists (
         select 1 from public.case_clinical_findings successor
         where successor.supersedes_id = v_parent.id
       ) then
      raise exception using
        errcode = '23514', message = 'Findings version chain is invalid';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.validate_case_findings_version()
  from public, anon, authenticated, service_role;
drop trigger if exists case_clinical_findings_validate
  on public.case_clinical_findings;
create trigger case_clinical_findings_validate
before insert on public.case_clinical_findings
for each row execute function private.validate_case_findings_version();

drop trigger if exists audit_row_change on public.case_clinical_findings;
create trigger audit_row_change
after insert on public.case_clinical_findings
for each row execute function private.write_audit_log();

create or replace function public.record_case_clinical_findings(
  p_case_id uuid,
  p_supersedes_id uuid,
  p_knowledge_version text,
  p_findings jsonb
)
returns table (
  findings_version_id uuid,
  findings_version integer,
  authored_by uuid,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_case public.cases%rowtype;
  v_current public.case_clinical_findings%rowtype;
  v_new public.case_clinical_findings%rowtype;
begin
  if v_actor is null or private.is_platform_admin() then
    raise exception using
      errcode = '42501', message = 'Clinician authentication is required';
  end if;
  if p_case_id is null
     or p_knowledge_version is null
     or p_knowledge_version !~ '^[a-z0-9][a-z0-9.-]{0,39}$'
     or not private.is_valid_case_findings_payload(p_findings) then
    raise exception using
      errcode = '22023', message = 'Clinical findings input is invalid';
  end if;

  select patient_case.* into v_case
  from public.cases patient_case
  where patient_case.id = p_case_id
  for update;
  if not found
     or v_case.patient_id is null
     or v_case.episode_id is null
     or not private.clinician_can_access_ai_case(
       v_actor, v_case.id, v_case.clinic_id
     ) then
    raise exception using
      errcode = '42501', message = 'Case access is not permitted';
  end if;
  if v_case.region is null then
    raise exception using
      errcode = '22023', message = 'Set the case body region before recording findings';
  end if;

  select findings.* into v_current
  from public.case_clinical_findings findings
  where findings.case_id = v_case.id
  order by findings.version desc
  limit 1
  for update;
  if (found and v_current.id is distinct from p_supersedes_id)
     or (not found and p_supersedes_id is not null) then
    raise exception using
      errcode = '23514',
      message = 'Findings changed after they were loaded; refresh before saving';
  end if;
  if found
     and v_current.findings = p_findings
     and v_current.region = v_case.region
     and v_current.knowledge_version = p_knowledge_version then
    raise exception using
      errcode = '22023', message = 'Findings are unchanged';
  end if;

  insert into public.case_clinical_findings (
    case_id, clinic_id, patient_id, episode_id, version, region,
    knowledge_version, findings, authored_by, supersedes_id
  ) values (
    v_case.id, v_case.clinic_id, v_case.patient_id, v_case.episode_id,
    coalesce(v_current.version, 0) + 1, v_case.region,
    p_knowledge_version, p_findings, v_actor, v_current.id
  ) returning * into v_new;

  return query
    select v_new.id, v_new.version, v_new.authored_by, v_new.created_at;
end;
$$;

revoke all on function public.record_case_clinical_findings(
  uuid, uuid, text, jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.record_case_clinical_findings(
  uuid, uuid, text, jsonb
) to authenticated;

comment on table public.case_clinical_findings is
  'Append-only structured history answers and examination findings per case; clinician-attributed, stale-write safe.';
comment on function public.record_case_clinical_findings(
  uuid, uuid, text, jsonb
) is
  'Owner/assigned-therapist workflow that appends a validated findings version naming its current parent.';

commit;

update public.schema_migrations
set status = 'applied', applied_at = clock_timestamp()
where version = '029' and status = 'applying';

select '029_case_clinical_findings.sql applied' as result;
