-- Structured prescriptions must not also accept the legacy daily aggregate.
begin;
create or replace function private.guard_structured_progress()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (
    select 1 from public.exercise_prescriptions prescription
    where prescription.episode_id = new.episode_id
      and prescription.status in ('published', 'suspended')
      and prescription.schedule_timezone is not null
  ) then
    raise exception using errcode = '23514',
      message = 'Record individual exercise events for structured prescriptions';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_structured_progress() from public, anon, authenticated, service_role;
drop trigger if exists guard_structured_progress on public.patient_daily_logs;
create trigger guard_structured_progress before insert or update on public.patient_daily_logs
for each row execute function private.guard_structured_progress();
commit;
