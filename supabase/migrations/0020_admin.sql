-- PawPin: what the admin's own screens lean on. An admin is a profile whose role was set to
-- 'admin' by hand (0001). The app looks for the messages 'not_admin' and 'cannot_close'.

-- An admin takes a bad report off the map. As close_report (0011), without the reporter check:
-- the report ends as 'closed' and a rescuer who was on the way has their claim cancelled. Nothing
-- is deleted, and the reporter is not alerted: 0017 alerts only for 'rescued' and 'not_found'.
create function public.admin_close_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  update public.reports set status = 'closed'
  where id = p_report_id and status in ('reported', 'responding');
  if not found then
    raise exception 'cannot_close';
  end if;

  update public.claims set status = 'cancelled'
  where report_id = p_report_id and status = 'on_the_way';
end;
$$;

revoke execute on function public.admin_close_report(uuid) from public, anon;
grant execute on function public.admin_close_report(uuid) to authenticated;

-- The numbers on the admin's Dashboard, in one answer: how many reports of each status, how many
-- came in over the last 24 hours, and how many active reports have a flag. It runs with the
-- caller's own rights; the check is there so a plain user gets a refusal, not a row of numbers.
create function public.admin_overview()
returns table (
  reported integer,
  responding integer,
  rescued integer,
  not_found integer,
  closed integer,
  new_today integer,
  flagged integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  return query
  select
    (count(*) filter (where r.status = 'reported'))::integer,
    (count(*) filter (where r.status = 'responding'))::integer,
    (count(*) filter (where r.status = 'rescued'))::integer,
    (count(*) filter (where r.status = 'not_found'))::integer,
    (count(*) filter (where r.status = 'closed'))::integer,
    (count(*) filter (where r.created_at > now() - interval '24 hours'))::integer,
    (count(*) filter (where r.status in ('reported', 'responding')
      and exists (select 1 from public.flags f where f.report_id = r.id)))::integer
  from public.reports r;
end;
$$;

revoke execute on function public.admin_overview() from public, anon;
grant execute on function public.admin_overview() to authenticated;
