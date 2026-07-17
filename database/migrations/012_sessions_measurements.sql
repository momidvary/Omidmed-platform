-- PhysioAI — Migration 012: treatment sessions (full model), metric
-- definitions, and enriched clinical measurements. Run AFTER 011.

-- ── sessions: full documentation model ───────────────────────────
alter table sessions
  add column if not exists clinic_id uuid references clinics (id) on delete cascade,
  add column if not exists patient_id uuid references patients (id) on delete cascade,
  add column if not exists session_number int,
  add column if not exists session_date date,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists subjective_report text,
  add column if not exists pain_at_rest int check (pain_at_rest between 0 and 10),
  add column if not exists pain_during_activity int check (pain_during_activity between 0 and 10),
  add column if not exists night_pain boolean,
  add column if not exists medication_changes text,
  add column if not exists functional_complaints text,
  add column if not exists exercise_adherence text,
  add column if not exists objective_findings text,
  add column if not exists interventions text,
  add column if not exists patient_response text,
  add column if not exists adverse_reactions text,
  add column if not exists home_exercise_updates text,
  add column if not exists next_session_plan text,
  add column if not exists patient_visible_summary text,
  add column if not exists therapist_private_notes text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references profiles (id),
  add column if not exists updated_by uuid references profiles (id),
  add column if not exists finalised_at timestamptz;

-- Rename legacy column reference: keep episode_id name (001) but expose
-- care_episode_id as the canonical name going forward via a rename.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'sessions' and column_name = 'episode_id')
     and not exists (select 1 from information_schema.columns
             where table_name = 'sessions' and column_name = 'care_episode_id') then
    alter table sessions rename column episode_id to care_episode_id;
  end if;
end $$;

-- Backfill clinic/patient from the episode; map legacy statuses.
update sessions s set
    clinic_id = e.clinic_id,
    patient_id = e.patient_id
  from care_episodes e
  where e.id = s.care_episode_id and s.clinic_id is null;
update sessions set status = 'scheduled' where status = 'planned';
update sessions set status = 'completed' where status = 'done';
alter table sessions alter column clinic_id set not null;
alter table sessions alter column patient_id set not null;

alter table sessions drop constraint if exists sessions_status_check;
alter table sessions add constraint sessions_status_check
  check (status in ('draft', 'scheduled', 'in_progress', 'completed',
                    'cancelled', 'no_show', 'rescheduled'));

create index if not exists sessions_episode on sessions (care_episode_id);
create index if not exists sessions_patient on sessions (patient_id);

drop trigger if exists sessions_touch on sessions;
create trigger sessions_touch
  before update on sessions
  for each row execute function public.touch_updated_at();

-- Reliable session numbering: assigned on insert as max+1 over the
-- episode's non-cancelled sessions — numbers survive deletions and are
-- never reused (spec 10.11/10.12).
create or replace function public.assign_session_number()
returns trigger language plpgsql as $$
begin
  if new.session_number is null then
    select coalesce(max(session_number), 0) + 1 into new.session_number
      from sessions
      where care_episode_id = new.care_episode_id and status <> 'cancelled';
  end if;
  return new;
end $$;

drop trigger if exists sessions_number on sessions;
create trigger sessions_number
  before insert on sessions
  for each row execute function public.assign_session_number();

-- Audit: creation, finalisation, edits after finalisation.
create or replace function public.audit_sessions()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('session.created', 'session', new.id,
      new.clinic_id, new.patient_id, new.care_episode_id,
      jsonb_build_object('session_number', new.session_number));
  elsif tg_op = 'UPDATE' then
    if new.status = 'completed' and old.status <> 'completed' then
      new.finalised_at := now();
      perform public.write_audit('session.finalised', 'session', new.id,
        new.clinic_id, new.patient_id, new.care_episode_id,
        jsonb_build_object('session_number', new.session_number));
    elsif old.finalised_at is not null then
      perform public.write_audit('session.edited_after_finalise', 'session', new.id,
        new.clinic_id, new.patient_id, new.care_episode_id, null);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists sessions_audit on sessions;
create trigger sessions_audit
  before insert or update on sessions
  for each row execute function public.audit_sessions();

-- ── progress metric definitions ──────────────────────────────────
create table if not exists progress_metric_definitions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  name_key text not null,          -- stable key, e.g. 'knee_flexion_rom'
  custom_name text,                -- clinic-specific label override
  body_region text,
  diagnosis_tags text[],
  data_type text not null default 'numeric'
    check (data_type in ('numeric', 'boolean', 'categorical', 'duration',
                         'distance', 'repetition', 'text')),
  unit text,
  minimum_value numeric,
  maximum_value numeric,
  direction text not null default 'clinician_interpretation'
    check (direction in ('higher_is_better', 'lower_is_better',
                         'target_range', 'neutral', 'clinician_interpretation')),
  target_value numeric,
  required boolean not null default false,
  patient_visible boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles (id),
  unique (clinic_id, name_key)
);
alter table progress_metric_definitions enable row level security;

drop trigger if exists metric_defs_touch on progress_metric_definitions;
create trigger metric_defs_touch
  before update on progress_metric_definitions
  for each row execute function public.touch_updated_at();

-- ── clinical_measurements: typed values bound to definitions ─────
alter table clinical_measurements
  add column if not exists clinic_id uuid references clinics (id) on delete cascade,
  add column if not exists patient_id uuid references patients (id) on delete cascade,
  add column if not exists session_id uuid references sessions (id) on delete set null,
  add column if not exists metric_definition_id uuid
    references progress_metric_definitions (id) on delete restrict,
  add column if not exists numeric_value numeric,
  add column if not exists text_value text,
  add column if not exists boolean_value boolean,
  add column if not exists categorical_value text,
  add column if not exists unit text,
  add column if not exists note text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references profiles (id);

-- Legacy free-form columns become optional.
alter table clinical_measurements alter column kind drop not null;
alter table clinical_measurements alter column value drop not null;

-- Rename episode column for consistency.
do $$ begin
  if exists (select 1 from information_schema.columns
             where table_name = 'clinical_measurements' and column_name = 'episode_id')
     and not exists (select 1 from information_schema.columns
             where table_name = 'clinical_measurements' and column_name = 'care_episode_id') then
    alter table clinical_measurements rename column episode_id to care_episode_id;
  end if;
end $$;

update clinical_measurements m set
    clinic_id = e.clinic_id, patient_id = e.patient_id
  from care_episodes e
  where e.id = m.care_episode_id and m.clinic_id is null;

create index if not exists measurements_metric
  on clinical_measurements (care_episode_id, metric_definition_id, measured_at);

drop trigger if exists measurements_touch on clinical_measurements;
create trigger measurements_touch
  before update on clinical_measurements
  for each row execute function public.touch_updated_at();

-- Value/type consistency guard (spec 14.8): the stored value column must
-- match the metric definition's data_type.
create or replace function public.guard_measurement_type()
returns trigger language plpgsql security definer set search_path = public as $$
declare dt text;
begin
  if new.metric_definition_id is null then return new; end if;
  select data_type into dt from progress_metric_definitions
    where id = new.metric_definition_id;
  if dt in ('numeric', 'duration', 'distance', 'repetition') and new.numeric_value is null then
    raise exception 'This metric requires a numeric value';
  elsif dt = 'boolean' and new.boolean_value is null then
    raise exception 'This metric requires a boolean value';
  elsif dt = 'categorical' and coalesce(new.categorical_value, '') = '' then
    raise exception 'This metric requires a categorical value';
  elsif dt = 'text' and coalesce(new.text_value, '') = '' then
    raise exception 'This metric requires a text value';
  end if;
  return new;
end $$;

drop trigger if exists measurements_type_guard on clinical_measurements;
create trigger measurements_type_guard
  before insert or update on clinical_measurements
  for each row execute function public.guard_measurement_type();

-- Audit measurement writes and deletes.
create or replace function public.audit_measurements()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('measurement.created', 'clinical_measurement', new.id,
      new.clinic_id, new.patient_id, new.care_episode_id, null);
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.write_audit('measurement.updated', 'clinical_measurement', new.id,
      new.clinic_id, new.patient_id, new.care_episode_id, null);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.write_audit('measurement.deleted', 'clinical_measurement', old.id,
      old.clinic_id, old.patient_id, old.care_episode_id, null);
    return old;
  end if;
  return new;
end $$;

drop trigger if exists measurements_audit on clinical_measurements;
create trigger measurements_audit
  after insert or update or delete on clinical_measurements
  for each row execute function public.audit_measurements();
