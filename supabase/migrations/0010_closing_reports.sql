-- PawPin: how a report ends when nobody rescues the animal. The reporter can close their own
-- report, and a report nobody has touched for 72 hours closes by itself.
-- Closed is final. The app looks for the message 'cannot_close'.

-- The reporter closes their own report: the animal left, or was helped another way. Allowed while
-- it is open or someone is on the way; that rescuer's claim is cancelled, which frees them to go
-- to another animal. Guests may close their own reports too.
create function public.close_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reports set status = 'closed'
  where id = p_report_id
    and reporter_id = (select auth.uid())
    and status in ('reported', 'responding');
  if not found then
    raise exception 'cannot_close';
  end if;

  update public.claims set status = 'cancelled'
  where report_id = p_report_id and status = 'on_the_way';
end;
$$;

revoke execute on function public.close_report(uuid) from public, anon;
grant execute on function public.close_report(uuid) to authenticated;

-- Closes every active report with no change for 72 hours, and cancels the claims on them.
-- "Change" is reports.updated_at, which the trigger from 0007 moves on a claim, a give-up, or an
-- edit. Looking at a report does not count.
create function public.close_stale_reports()
returns void
language sql
security definer
set search_path = ''
as $$
  with closed as (
    update public.reports set status = 'closed'
    where status in ('reported', 'responding')
      and updated_at < now() - interval '72 hours'
    returning id
  )
  update public.claims set status = 'cancelled'
  where status = 'on_the_way' and report_id in (select id from closed);
$$;

-- Only the hourly job below runs it, as the database owner. No user of the app may.
revoke execute on function public.close_stale_reports() from public, anon, authenticated;

-- The scheduler. Every hour, on the hour. So a report can stay up to an hour past its 72.
-- Scheduling under the same name again replaces the job, so this file can be run twice.
create extension if not exists pg_cron;
select cron.schedule('close-stale-reports', '0 * * * *', 'select public.close_stale_reports()');
