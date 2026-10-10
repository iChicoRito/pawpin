-- Run after 0020_admin.sql. All fixtures are rolled back.
begin;

insert into auth.users (id, is_anonymous, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', false, '{}'),  -- the reporter
  ('00000000-0000-4000-8000-00000000000b', false, '{}'),  -- a Google user, on the way to report 2
  ('00000000-0000-4000-8000-00000000000c', true, '{"guest_device_id":"000000000000000c"}'),
  ('00000000-0000-4000-8000-00000000000d', false, '{}');  -- an admin, made by hand as the owner does
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-00000000000d';

-- What the real reports add up to, before the fixtures, counted as the database owner.
select set_config('test.before', (select row_to_json(t)::text from (
  select
    count(*) filter (where status = 'reported') as reported,
    count(*) filter (where status = 'responding') as responding,
    count(*) filter (where status = 'closed') as closed,
    count(*) filter (where status in ('reported', 'responding')
      and exists (select 1 from public.flags f where f.report_id = r.id)) as flagged
  from public.reports r) t), true);

-- Far out at sea, so no real user is alerted about these reports.
-- 1: waiting, flagged. 2: someone on the way. 3: already rescued.
insert into public.reports (id, reporter_id, location, urgency, status)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a',
    'SRID=4326;POINT(130.0 5.0)', 'critical', 'reported'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a',
    'SRID=4326;POINT(130.0 5.0)', 'critical', 'responding'),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-00000000000a',
    'SRID=4326;POINT(130.0 5.0)', 'critical', 'rescued');
insert into public.claims (report_id, rescuer_id, status) values
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000b', 'on_the_way');
insert into public.flags (report_id, flagged_by, reason) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000b', 'Wrong place');

set local role authenticated;
do $$
declare
  google constant uuid := '00000000-0000-4000-8000-00000000000b';
  guest constant uuid := '00000000-0000-4000-8000-00000000000c';
  admin constant uuid := '00000000-0000-4000-8000-00000000000d';
  r1 constant uuid := '00000000-0000-4000-8000-0000000000a1';
  r2 constant uuid := '00000000-0000-4000-8000-0000000000a2';
  r3 constant uuid := '00000000-0000-4000-8000-0000000000a3';
  before constant json := current_setting('test.before')::json;
  seen record;
begin
  -- A plain user and a guest are refused both.
  perform set_config('request.jwt.claims',
    json_build_object('sub', google, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  begin
    perform public.admin_close_report(r1);
    raise exception 'FAIL: a plain user closed someone else''s report';
  exception when raise_exception then
    if sqlerrm <> 'not_admin' then raise; end if;
  end;
  begin
    perform * from public.admin_overview();
    raise exception 'FAIL: a plain user read the admin''s numbers';
  exception when raise_exception then
    if sqlerrm <> 'not_admin' then raise; end if;
  end;
  perform set_config('request.jwt.claims',
    json_build_object('sub', guest, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  begin
    perform public.admin_close_report(r1);
    raise exception 'FAIL: a guest closed someone else''s report';
  exception when raise_exception then
    if sqlerrm <> 'not_admin' then raise; end if;
  end;

  -- The admin's numbers: the real ones plus the three fixtures.
  perform set_config('request.jwt.claims',
    json_build_object('sub', admin, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  select * into seen from public.admin_overview();
  if seen.reported <> (before ->> 'reported')::integer + 1
    or seen.responding <> (before ->> 'responding')::integer + 1
    or seen.flagged <> (before ->> 'flagged')::integer + 1
    or seen.new_today < 3 then
    raise exception 'FAIL: the numbers are off: %', row_to_json(seen);
  end if;

  -- The admin closes a waiting report, and one with a rescuer on the way.
  perform public.admin_close_report(r1);
  perform public.admin_close_report(r2);

  -- A finished report stays as it ended.
  begin
    perform public.admin_close_report(r3);
    raise exception 'FAIL: a rescued report was closed';
  exception when raise_exception then
    if sqlerrm <> 'cannot_close' then raise; end if;
  end;

  -- A closed flagged report no longer counts as needing a look.
  select * into seen from public.admin_overview();
  if seen.flagged <> (before ->> 'flagged')::integer
    or seen.closed <> (before ->> 'closed')::integer + 2 then
    raise exception 'FAIL: the numbers after closing are off: %', row_to_json(seen);
  end if;
end;
$$;

reset role;
do $$
begin
  if (select count(*) from public.reports
      where id in ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-0000000000a2')
        and status = 'closed') <> 2 then
    raise exception 'FAIL: the admin''s close did not close both reports';
  end if;
  if (select status from public.reports
      where id = '00000000-0000-4000-8000-0000000000a3') <> 'rescued' then
    raise exception 'FAIL: a rescued report changed';
  end if;
  -- The rescuer is freed to go to another animal.
  if (select status from public.claims
      where report_id = '00000000-0000-4000-8000-0000000000a2') <> 'cancelled' then
    raise exception 'FAIL: the rescuer''s claim was not cancelled';
  end if;
  if has_function_privilege('anon', 'public.admin_close_report(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.admin_overview()', 'EXECUTE') then
    raise exception 'FAIL: a signed-out visitor can run an admin function';
  end if;
end;
$$;

select 'Admin checks passed' as result;
rollback;
