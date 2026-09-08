-- Atomic, service-only clinician review workflow for generated AI drafts.
-- Run after 009_ai_request_reservations.sql.

begin;

create or replace function public.record_ai_generation_review(
  p_audit_id uuid,
  p_reviewer_id uuid,
  p_decision text,
  p_edited_output jsonb,
  p_notes text
)
returns table (
  review_outcome text,
  review_id uuid,
  review_decision text,
  review_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_audit public.ai_generation_audits%rowtype;
  v_review public.ai_generation_reviews%rowtype;
  v_created boolean := false;
begin
  if p_audit_id is null
     or p_reviewer_id is null
     or p_decision not in ('accepted', 'edited', 'rejected')
     or (p_decision = 'edited' and p_edited_output is null)
     or (p_decision <> 'edited' and p_edited_output is not null)
     or (p_edited_output is not null and pg_column_size(p_edited_output) > 131072)
     or (p_notes is not null and char_length(btrim(p_notes)) > 2000) then
    raise exception using errcode = '22023', message = 'Invalid AI review metadata';
  end if;

  select audit.* into v_audit
  from public.ai_generation_audits audit
  where audit.id = p_audit_id
  for share;
  if not found or v_audit.status <> 'generated' or v_audit.output is null then
    raise exception using errcode = '23514', message = 'Only generated AI drafts can be reviewed';
  end if;

  if not exists (
    select 1
    from public.profiles profile
    join public.clinic_members membership
      on membership.user_id = profile.id
     and membership.clinic_id = v_audit.clinic_id
    where profile.id = p_reviewer_id
      and profile.role in ('clinic_owner', 'therapist')
      and membership.member_role in ('clinic_owner', 'therapist')
      and (
        v_audit.requested_by = p_reviewer_id
        or membership.member_role = 'clinic_owner'
      )
  ) then
    raise exception using errcode = '42501', message = 'Clinician cannot review this AI generation';
  end if;

  insert into public.ai_generation_reviews (
    audit_id, reviewer_id, decision, edited_output, notes
  ) values (
    p_audit_id, p_reviewer_id, p_decision, p_edited_output,
    nullif(btrim(p_notes), '')
  )
  on conflict (audit_id, reviewer_id) do nothing
  returning * into v_review;

  if found then
    v_created := true;
  else
    select review.* into strict v_review
    from public.ai_generation_reviews review
    where review.audit_id = p_audit_id
      and review.reviewer_id = p_reviewer_id;
  end if;

  return query select
    case when v_created then 'created' else 'existing' end::text,
    v_review.id, v_review.decision, v_review.created_at;
end;
$$;

revoke all on function public.record_ai_generation_review(
  uuid, uuid, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.record_ai_generation_review(
  uuid, uuid, text, jsonb, text
) to service_role;

revoke insert, update, delete, truncate
  on table public.ai_generation_reviews from service_role;
grant select on table public.ai_generation_reviews to service_role;

comment on function public.record_ai_generation_review(
  uuid, uuid, text, jsonb, text
) is 'Service-only idempotent accept/edit/reject record for a completed AI generation.';

commit;
