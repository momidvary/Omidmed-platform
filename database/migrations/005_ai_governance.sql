-- AI governance and append-only review trail.
-- Run after 004_security_hardening.sql. The clinical AI route remains disabled
-- unless server configuration and data-processing approval are explicit.

begin;

create table if not exists public.ai_generation_audits (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  clinic_id uuid not null references public.clinics (id) on delete restrict,
  case_id uuid references public.cases (id) on delete set null,
  requested_by uuid not null references public.profiles (id) on delete restrict,
  provider text not null check (provider in ('openai')),
  model text not null check (char_length(model) between 1 and 100),
  provider_response_id text,
  prompt_version text not null check (char_length(prompt_version) between 1 and 100),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  context_snapshot jsonb not null,
  output jsonb,
  usage jsonb,
  status text not null check (status in ('generated', 'refused', 'error')),
  safety_signal_ids text[] not null default '{}',
  error_code text,
  created_at timestamptz not null default now(),
  unique (requested_by, request_id),
  check (pg_column_size(context_snapshot) <= 65536),
  check (output is null or pg_column_size(output) <= 131072),
  check ((status = 'generated' and output is not null) or status <> 'generated')
);

create index if not exists ai_generation_audits_rate_limit_idx
  on public.ai_generation_audits (requested_by, created_at desc);
create index if not exists ai_generation_audits_case_idx
  on public.ai_generation_audits (case_id, created_at desc);

create table if not exists public.ai_generation_reviews (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.ai_generation_audits (id) on delete restrict,
  reviewer_id uuid not null references public.profiles (id) on delete restrict,
  decision text not null check (decision in ('accepted', 'edited', 'rejected')),
  edited_output jsonb,
  notes text check (notes is null or char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  unique (audit_id, reviewer_id),
  check ((decision = 'edited' and edited_output is not null) or decision <> 'edited'),
  check (edited_output is null or pg_column_size(edited_output) <= 131072)
);

create index if not exists ai_generation_reviews_audit_idx
  on public.ai_generation_reviews (audit_id, created_at desc);

alter table public.ai_generation_audits enable row level security;
alter table public.ai_generation_reviews enable row level security;

revoke all on public.ai_generation_audits from anon, authenticated;
revoke all on public.ai_generation_reviews from anon, authenticated;
grant select on public.ai_generation_audits to authenticated;
grant select on public.ai_generation_reviews to authenticated;

drop policy if exists "ai audit requester or clinic owner read" on public.ai_generation_audits;
create policy "ai audit requester or clinic owner read"
  on public.ai_generation_audits for select to authenticated
  using (
    not private.is_platform_admin()
    and (
      requested_by = auth.uid()
      or private.is_owner_of(clinic_id)
    )
  );

drop policy if exists "ai review visible with audit" on public.ai_generation_reviews;
create policy "ai review visible with audit"
  on public.ai_generation_reviews for select to authenticated
  using (
    exists (
      select 1
      from public.ai_generation_audits audit
      where audit.id = ai_generation_reviews.audit_id
        and not private.is_platform_admin()
        and (
          audit.requested_by = auth.uid()
          or private.is_owner_of(audit.clinic_id)
        )
    )
  );

comment on table public.ai_generation_audits is
  'Append-only server-written snapshots of clinical AI drafts. No client write grants.';
comment on table public.ai_generation_reviews is
  'Append-only clinician accept/edit/reject decisions. Written by a guarded server endpoint.';

commit;
