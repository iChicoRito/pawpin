-- PawPin: what the charts on the admin's Dashboard draw. One answer, so the Dashboard makes one
-- request for all of them. Like admin_overview (0020) it runs with the caller's own rights and
-- refuses anyone who is not an admin with 'not_admin'.

-- p_tz is the admin's own time zone, so "today" and each day's bar are their days, not UTC's.
create function public.admin_stats(p_tz text default 'Asia/Manila')
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  today date := (now() at time zone p_tz)::date;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  return jsonb_build_object(
    -- Reports sent on each of the last 14 days, oldest first. A day with none is there as 0.
    'days', (
      select jsonb_agg(jsonb_build_object('day', d.day, 'count', coalesce(c.n, 0)) order by d.day)
      from (select generate_series(today - 13, today, interval '1 day')::date as day) d
      left join (
        select (created_at at time zone p_tz)::date as day, count(*)::integer as n
        from public.reports
        where created_at > now() - interval '15 days'
        group by 1
      ) c using (day)
    ),
    'this_week', (select count(*) from public.reports
      where created_at > now() - interval '7 days'),
    'last_week', (select count(*) from public.reports
      where created_at > now() - interval '14 days' and created_at <= now() - interval '7 days'),
    -- How urgent the reports still waiting or being gone to are.
    'urgency', (
      select coalesce(jsonb_object_agg(u.urgency, u.n), '{}'::jsonb)
      from (
        select urgency, count(*) as n from public.reports
        where status in ('reported', 'responding')
        group by 1
      ) u
    ),
    -- Half of the reports of the last 30 days that a rescuer went to were taken within this many
    -- minutes. A reporter closing their own report as rescued writes a claim too (0011): that is
    -- not a rescuer going, so it is left out. Null when nobody has gone yet.
    'response_minutes', (
      select round(percentile_cont(0.5) within group (
        order by extract(epoch from (c.first_at - r.created_at)) / 60))
      from public.reports r
      join (
        select cl.report_id, min(cl.created_at) as first_at
        from public.claims cl
        join public.reports rr on rr.id = cl.report_id
        where cl.rescuer_id <> rr.reporter_id
        group by 1
      ) c on c.report_id = r.id
      where r.created_at > now() - interval '30 days'
    ),
    -- Untouched for over 48 hours: the hourly job (0010) closes these within a day.
    'closing_soon', (
      select coalesce(jsonb_agg(to_jsonb(s) order by s.updated_at), '[]'::jsonb)
      from (
        select id, animal_type, status, landmark, photos, created_at, updated_at
        from public.reports
        where status in ('reported', 'responding')
          and updated_at < now() - interval '48 hours'
        order by updated_at
        limit 5
      ) s
    ),
    -- Every reason given, most used first.
    'flag_reasons', (
      select coalesce(jsonb_agg(jsonb_build_object('label', f.reason, 'count', f.n)
        order by f.n desc, f.reason), '[]'::jsonb)
      from (select reason, count(*) as n from public.flags group by 1) f
    ),
    -- Dogs, cats, and everything else, always these three in this order. The form offers dog, cat,
    -- and a typed kind; every typed kind, and a report with none, counts as 'other'.
    'animals', (
      select jsonb_agg(jsonb_build_object('label', a.kind, 'count', a.n) order by a.place)
      from (
        select k.kind, k.place, count(r.id) as n
        from (values ('dog', 1), ('cat', 2), ('other', 3)) as k (kind, place)
        left join public.reports r
          on case when lower(trim(r.animal_type)) in ('dog', 'cat')
            then lower(trim(r.animal_type)) else 'other' end = k.kind
        group by k.kind, k.place
      ) a
    )
  );
end;
$$;

revoke execute on function public.admin_stats(text) from public, anon;
grant execute on function public.admin_stats(text) to authenticated;
