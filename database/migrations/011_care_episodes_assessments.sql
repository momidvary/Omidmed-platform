-- PhysioAI — Migration 011: care episodes (full model) + assessments
-- Run AFTER 010.

-- ── care_episodes: full clinical episode model ───────────────────
alter table care_episodes
  add column if not exists clinic_id uuid references clinics (id) on delete cascade,
  add column if not exists title text,
  add column if not exists referral_diagnosis text,
  add column if not exists therapist_diagnosis text,
  add column if not exists body_region text,
  add column if not exists side text
    check (side in ('right', 'left', 'bilateral', 'central', 'not_applicable')),
  add column if not exists injury_date date,
  add column if not exists surgery_date date,
  add column if not exists referral_date date,
  add column if not exists first_session_date date,
  add column if not exists referring_physician text,
  add column if not exists primary_therapist_id uuid references profiles (id),
  add column if not exists planned_session_count int,
  add column if not exists short_term_goals text,
  add column if not exists long_term_goals text,
  add column if not exists precautions text,
  add column if not exists discharge_date date,
  add column if not exists discharge_reason text,
  add column if not exists reopen_note text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_by uuid references profiles (id),
  add column if not exists updated_by uuid references profiles (id),
  add column if not exists archived_at timestamptz;

-- Backfill clinic_id + title from existing rows.
update care_episodes e set clinic_id = p.clinic_id
  from patients p where p.id = e.patient_id and e.clinic_id is null;
update care_episodes set title = title_fa where title is null;
alter table care_episodes alter column clinic_id set not null;

-- Expand the status set (supersedes 001's three states).
alter table care_episodes drop constraint if exists care_episodes_status_check;
alter table care_episodes add constraint care_episodes_status_check
  check (status in ('draft', 'active', 'paused', 'completed', 'discharged', 'referred', 'archived'));

create index if not exists care_episodes_clinic on care_episodes (clinic_id);

drop trigger if exists care_episodes_touch on care_episodes;
create trigger care_episodes_touch
  before update on care_episodes
  for each row execute function public.touch_updated_at();

-- Reopen guard: a finalised episode cannot silently return to work.
create or replace function public.guard_episode_reopen()
returns trigger language plpgsql as $$
begin
  if old.status in ('completed', 'discharged')
     and new.status in ('active', 'paused')
     and coalesce(trim(new.reopen_note), '') = '' then
    raise exception 'Reopening a finished episode requires reopen_note';
  end if;
  return new;
end $$;

drop trigger if exists care_episodes_reopen_guard on care_episodes;
create trigger care_episodes_reopen_guard
  before update on care_episodes
  for each row execute function public.guard_episode_reopen();

-- Audit: creation + status changes.
create or replace function public.audit_episodes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit('episode.created', 'care_episode', new.id,
      new.clinic_id, new.patient_id, new.id, null);
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform public.write_audit('episode.status_changed', 'care_episode', new.id,
      new.clinic_id, new.patient_id, new.id,
      jsonb_build_object('from', old.status, 'to', new.status,
                         'reopen_note', new.reopen_note));
  end if;
  return new;
end $$;

drop trigger if exists care_episodes_audit on care_episodes;
create trigger care_episodes_audit
  after insert or update on care_episodes
  for each row execute function public.audit_episodes();

-- ── assessments (initial + reassessments) ────────────────────────
-- Section content is structured jsonb driven by in-code templates
-- (apps/web/lib/data/assessmentTemplates.ts); template changes never
-- rewrite existing assessments because each row stores its own data.
create table if not exists assessments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references clinics (id) on delete cascade,
  patient_id uuid not null references patients (id) on delete cascade,
  care_episode_id uuid not null references care_episodes (id) on delete cascade,
  kind text not null default 'initial' check (kind in ('initial', 'reassessment')),
  template_key text not null default 'general',
  subjective jsonb not null default '{}'::jsonb,
  safety jsonb not null default '{}'::jsonb,
  objective jsonb not null default '{}'::jsonb,
  clinical_summary jsonb not null default '{}'::jsonb,
  planned_reassessment_date date,
  status text not null default 'draft' check (status in ('draft', 'finalised')),
  finalised_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references profiles (id),
  updated_by uuid references profiles (id)
);
create index if not exists assessments_episode on assessments (care_episode_id);
alter table assessments enable row level security;

drop trigger if exists assessments_touch on assessments;
create trigger assessments_touch
  before update on assessments
  for each row execute function public.touch_updated_at();

-- Audit finalisation and any edit AFTER finalisation.
create or replace function public.audit_assessments()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.status = 'finalised' and old.status = 'draft' then
      new.finalised_at := now();
      perform public.write_audit('assessment.finalised', 'assessment', new.id,
        new.clinic_id, new.patient_id, new.care_episode_id, null);
    elsif old.status = 'finalised' then
      perform public.write_audit('assessment.edited_after_finalise', 'assessment', new.id,
        new.clinic_id, new.patient_id, new.care_episode_id, null);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists assessments_audit on assessments;
create trigger assessments_audit
  before update on assessments
  for each row execute function public.audit_assessments();
