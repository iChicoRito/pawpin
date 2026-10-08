-- PawPin: a reporter does not go "on the way" to their own report. They were there when they sent
-- it. If they help the animal themselves, they say so when they close the report, and it ends as
-- rescued instead of closed.
-- The app looks for the message 'own_report'.

-- As in 0009, with one more refusal. Same name and arguments, so who may run it stays as set.
create or replace function public.claim_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'guest_cannot_claim';
  end if;

  if exists (
    select 1 from public.reports
    where id = p_report_id and reporter_id = (select auth.uid())
  ) then
    raise exception 'own_report';
  end if;

  -- Finish or give up the first rescue before starting another.
  if exists (
    select 1 from public.claims
    where rescuer_id = (select auth.uid()) and status = 'on_the_way'
  ) then
    raise exception 'already_on_the_way';
  end if;

  -- The update locks the row, so of two claims sent at the same moment only one finds the report
  -- still 'reported'.
  update public.reports set status = 'responding'
  where id = p_report_id and status = 'reported';
  if not found then
    raise exception 'report_not_open';
  end if;

  insert into public.claims (report_id, rescuer_id)
  values (p_report_id, (select auth.uid()));
end;
$$;

-- Closing now says why. The old one-argument function is dropped first: two functions of the same
-- name would leave a call with one argument with no clear target.
drop function public.close_report(uuid);

-- The reporter ends their own report. With p_rescued it ends as 'rescued' and a finished claim is
-- written in the reporter's name, so every rescued report says who rescued it and the rescue
-- shows in that person's history. Without it the report ends as 'closed', as in 0010.
-- Either way a rescuer who was on the way has their claim cancelled.
create function public.close_report(p_report_id uuid, p_rescued boolean default false)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.reports
  set status = case when p_rescued then 'rescued' else 'closed' end::public.report_status
  where id = p_report_id
    and reporter_id = (select auth.uid())
    and status in ('reported', 'responding');
  if not found then
    raise exception 'cannot_close';
  end if;

  update public.claims set status = 'cancelled'
  where report_id = p_report_id and status = 'on_the_way';

  if p_rescued then
    insert into public.claims (report_id, rescuer_id, status)
    values (p_report_id, (select auth.uid()), 'completed');
  end if;
end;
$$;

revoke execute on function public.close_report(uuid, boolean) from public, anon;
grant execute on function public.close_report(uuid, boolean) to authenticated;
