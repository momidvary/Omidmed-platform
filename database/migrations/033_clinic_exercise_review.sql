-- Clinic-level clinical review of library exercises.
--
-- The 56 library exercises added in migration 031 are inactive catalog
-- rows: reference content that cannot be prescribed. This migration lets a
-- clinic owner (a physiotherapist accountable for the clinic) review that
-- patient-facing content and approve it for their own clinic only. The
-- global `active` flag is unchanged, so one clinic's approval never makes
-- an exercise prescribable in another clinic.
--
-- * public.clinic_exercise_reviews is append-only; the latest row per
--   (clinic, exercise) is the current decision.
-- * Only public.review_clinic_exercise writes it, and only for the caller's
--   own clinic as clinic owner. The actor and time come from the database.
-- * The prescription snapshot trigger now accepts a globally active catalog
--   row or the catalog version the prescription's clinic approved, and still
--   copies that version's content into the item, so a published program
--   never changes when a review is later revoked.
--
-- Run after 032_safety_risk_factors.sql.

begin;

create table if not exists public.clinic_exercise_reviews (
  seq bigint generated always as identity primary key,
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  exercise_id text not null,
  catalog_version integer not null,
  decision text not null check (decision in ('approved', 'revoked')),
  note text check (note is null or char_length(note) <= 1000),
  reviewed_by uuid not null references public.profiles (id) on delete restrict,
  reviewed_at timestamptz not null default clock_timestamp(),
  foreign key (exercise_id, catalog_version)
    references public.exercise_catalog_versions (exercise_id, version)
    on delete restrict
);

create index if not exists clinic_exercise_reviews_latest_idx
  on public.clinic_exercise_reviews (clinic_id, exercise_id, seq desc);

alter table public.clinic_exercise_reviews enable row level security;
revoke all on table public.clinic_exercise_reviews
  from public, anon, authenticated, service_role;
grant select on table public.clinic_exercise_reviews to authenticated;

drop policy if exists "clinic exercise reviews member read"
  on public.clinic_exercise_reviews;
create policy "clinic exercise reviews member read"
  on public.clinic_exercise_reviews
  for select to authenticated
  using (private.is_member_of(clinic_id));

create or replace function private.reject_clinic_exercise_review_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '42501',
    message = 'Exercise reviews are append-only';
end;
$$;

drop trigger if exists clinic_exercise_reviews_append_only
  on public.clinic_exercise_reviews;
create trigger clinic_exercise_reviews_append_only
before update or delete on public.clinic_exercise_reviews
for each row execute function private.reject_clinic_exercise_review_mutation();

-- The catalog row a clinic may prescribe: the globally active version, or
-- the version the clinic's latest review approved. NULL fields when none.
create or replace function private.clinic_exercise_catalog(
  p_exercise_id text,
  p_clinic_id uuid
)
returns public.exercise_catalog_versions
language sql
stable
security definer
set search_path = ''
as $$
  select candidate.exercise_id, candidate.version, candidate.patient_content,
         candidate.content_hash, candidate.active, candidate.created_at
  from (
    select catalog.*, 0 as preference
    from public.exercise_catalog_versions catalog
    where catalog.exercise_id = p_exercise_id
      and catalog.active
    union all
    select catalog.*, 1 as preference
    from (
      select review.catalog_version, review.decision
      from public.clinic_exercise_reviews review
      where review.clinic_id = p_clinic_id
        and review.exercise_id = p_exercise_id
      order by review.seq desc
      limit 1
    ) latest
    join public.exercise_catalog_versions catalog
      on catalog.exercise_id = p_exercise_id
     and catalog.version = latest.catalog_version
    where latest.decision = 'approved'
  ) candidate
  order by candidate.preference
  limit 1;
$$;

revoke all on function private.clinic_exercise_catalog(text, uuid)
  from public, anon, authenticated, service_role;

create or replace function private.stamp_prescription_item_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clinic uuid;
  v_catalog public.exercise_catalog_versions%rowtype;
begin
  select prescription.clinic_id into v_clinic
  from public.exercise_prescriptions prescription
  where prescription.id = new.prescription_id;

  select * into v_catalog
  from private.clinic_exercise_catalog(new.exercise_id, v_clinic);
  if v_catalog.exercise_id is null then
    raise exception using
      errcode = '22023',
      message = 'Exercise is not in the active patient-ready catalog';
  end if;
  new.exercise_version := v_catalog.version;
  new.content_snapshot := v_catalog.patient_content;
  return new;
end;
$$;

revoke all on function private.stamp_prescription_item_snapshot()
  from public, anon, authenticated, service_role;

create or replace function public.review_clinic_exercise(
  p_clinic_id uuid,
  p_exercise_id text,
  p_decision text,
  p_note text default null
)
returns table (
  exercise_id text,
  catalog_version integer,
  decision text,
  reviewed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_decision text := lower(btrim(coalesce(p_decision, '')));
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_version integer;
  v_row public.clinic_exercise_reviews%rowtype;
begin
  if v_actor is null or p_clinic_id is null
     or not private.is_owner_of(p_clinic_id) then
    raise exception using
      errcode = '42501',
      message = 'Only the clinic owner may review exercises for the clinic';
  end if;
  if v_decision not in ('approved', 'revoked')
     or (v_note is not null and char_length(v_note) > 1000) then
    raise exception using
      errcode = '22023',
      message = 'Invalid exercise review';
  end if;

  select max(catalog.version) into v_version
  from public.exercise_catalog_versions catalog
  where catalog.exercise_id = p_exercise_id;
  if v_version is null then
    raise exception using
      errcode = '22023',
      message = 'Unknown exercise';
  end if;

  insert into public.clinic_exercise_reviews (
    clinic_id, exercise_id, catalog_version, decision, note, reviewed_by
  ) values (
    p_clinic_id, p_exercise_id, v_version, v_decision, v_note, v_actor
  )
  returning * into v_row;

  return query
  select v_row.exercise_id, v_row.catalog_version, v_row.decision, v_row.reviewed_at;
end;
$$;

revoke all on function public.review_clinic_exercise(uuid, text, text, text)
  from public, anon;
grant execute on function public.review_clinic_exercise(uuid, text, text, text)
  to authenticated;

comment on table public.clinic_exercise_reviews is
  'Append-only clinic-owner reviews of library exercises; the latest approved row makes that catalog version prescribable in that clinic only.';

commit;
