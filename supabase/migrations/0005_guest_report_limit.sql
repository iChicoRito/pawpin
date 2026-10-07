-- PawPin: a guest may send 3 reports in any 24 hours. The database refuses the fourth, so the
-- limit holds even if the app is bypassed. The app looks for the message 'guest_report_limit'.

create function public.enforce_guest_report_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The count below trusts created_at, so the caller must not be able to choose it.
  new.created_at := now();

  -- Two reports sent at the very same instant can both pass this count. Accepted: it needs a
  -- deliberate script, and the gain is one extra report.
  if coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    and (
      select count(*) from public.reports
      where reporter_id = new.reporter_id
        and created_at > now() - interval '24 hours'
    ) >= 3
  then
    raise exception 'guest_report_limit';
  end if;

  return new;
end;
$$;

create trigger on_report_created
  before insert on public.reports
  for each row execute function public.enforce_guest_report_limit();

-- A reporter may edit their report's details, but not who made it or when. Without this a guest
-- could move created_at into the past and slip under the limit.
revoke update on public.reports from authenticated;
grant update (
  location, location_accuracy_m, landmark, animal_type, size, color, condition, urgency,
  description, photos, status, updated_at
) on public.reports to authenticated;
