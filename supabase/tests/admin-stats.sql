-- Run after 0021_admin_stats.sql. All fixtures are rolled back.
begin;

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-00000000000a', false),  -- the reporter
  ('00000000-0000-4000-8000-00000000000b', false),  -- a Google user who went to report 2
  ('00000000-0000-4000-8000-00000000000d', false);  -- an admin, made by hand as the owner does
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-00000000000d';

-- What the real rows add up to, before the fixtures, counted as the database owner.
select set_config('test.before', json_build_object(
  'this_week', (select count(*) from public.reports where created_at > now() - interval '7 days'),
  'critical', (select count(*) from public.reports
    where status in ('reported', 'responding') and urgency = 'critical'),
  'wrong_place', (select count(*) from public.flags where reason = 'Wrong place'),
  'dogs', (select count(*) from public.reports where lower(trim(animal_type)) = 'dog'),
  'others', (select count(*) from public.reports
    where lower(trim(animal_type)) not in ('dog', 'cat') or animal_type is null)
)::text, true);

-- Far out at sea, so no real user is alerted about these reports.
-- 1: sent now, a dog typed with a capital and spaces. 2: sent 2 hours ago, a typed kind, a rescuer
-- went after 10 minutes. 3: sent 60 hours ago with no kind, untouched since, so it closes soon.
insert into public.reports (id, reporter_id, location, urgency, status, animal_type, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a',
    'SRID=4326;POINT(130.0 5.0)', 'critical', 'reported', ' Dog ', now(), now()),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a',
    'SRID=4326;POINT(130.0 5.0)', 'critical', 'responding', 'test kind',
    now() - interval '2 hours', now()),
  ('00000000-0000-4000-8000-0000000000a3', '00000000-0000-4000-8000-00000000000a',
    'SRID=4326;POINT(130.0 5.0)', 'just_sighted', 'reported', null,
    now() - interval '60 hours', now() - interval '60 hours');
insert into public.claims (report_id, rescuer_id, status, created_at) values
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000b', 'on_the_way',
    now() - interval '110 minutes');
insert into public.flags (report_id, flagged_by, reason) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000b', 'Wrong place');

set local role authenticated;
do $$
declare
  google constant uuid := '00000000-0000-4000-8000-00000000000b';
  admin constant uuid := '00000000-0000-4000-8000-00000000000d';
  before constant json := current_setting('test.before')::json;
  stats jsonb;
begin
  -- A plain user is refused.
  perform set_config('request.jwt.claims',
    json_build_object('sub', google, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  begin
    perform public.admin_stats();
    raise exception 'FAIL: a plain user read the admin''s charts';
  exception when raise_exception then
    if sqlerrm <> 'not_admin' then raise; end if;
  end;

  perform set_config('request.jwt.claims',
    json_build_object('sub', admin, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  stats := public.admin_stats('Asia/Manila');

  -- Fourteen days, oldest first, the last of them today with at least the two sent today.
  if jsonb_array_length(stats -> 'days') <> 14
    or (stats -> 'days' -> 13 ->> 'day')::date <> (now() at time zone 'Asia/Manila')::date
    or (stats -> 'days' -> 0 ->> 'day')::date <> (now() at time zone 'Asia/Manila')::date - 13 then
    raise exception 'FAIL: the days are off: %', stats -> 'days';
  end if;
  if (select sum((d ->> 'count')::integer) from jsonb_array_elements(stats -> 'days') d)
      < (before ->> 'this_week')::integer + 3 then
    raise exception 'FAIL: the days do not hold the reports sent: %', stats -> 'days';
  end if;

  if (stats ->> 'this_week')::integer <> (before ->> 'this_week')::integer + 3 then
    raise exception 'FAIL: this week is off: %', stats ->> 'this_week';
  end if;
  if (stats -> 'urgency' ->> 'critical')::integer <> (before ->> 'critical')::integer + 2 then
    raise exception 'FAIL: the urgency of open reports is off: %', stats -> 'urgency';
  end if;
  if stats ->> 'response_minutes' is null then
    raise exception 'FAIL: no time to first response, with a rescuer gone';
  end if;

  -- The untouched report is listed as closing soon; the fresh ones are not.
  if not exists (select 1 from jsonb_array_elements(stats -> 'closing_soon') s
      where s ->> 'id' = '00000000-0000-4000-8000-0000000000a3')
    or exists (select 1 from jsonb_array_elements(stats -> 'closing_soon') s
      where s ->> 'id' = '00000000-0000-4000-8000-0000000000a1') then
    raise exception 'FAIL: closing soon is off: %', stats -> 'closing_soon';
  end if;

  if (select (f ->> 'count')::integer from jsonb_array_elements(stats -> 'flag_reasons') f
      where f ->> 'label' = 'Wrong place') <> (before ->> 'wrong_place')::integer + 1 then
    raise exception 'FAIL: the flag reasons are off: %', stats -> 'flag_reasons';
  end if;

  -- Always dog, cat, other, in that order. " Dog " is a dog; a typed kind and no kind are other.
  if (select jsonb_agg(a ->> 'label') from jsonb_array_elements(stats -> 'animals') a)
      <> '["dog", "cat", "other"]'::jsonb then
    raise exception 'FAIL: the kinds of animal are off: %', stats -> 'animals';
  end if;
  if (stats -> 'animals' -> 0 ->> 'count')::integer <> (before ->> 'dogs')::integer + 1
    or (stats -> 'animals' -> 2 ->> 'count')::integer <> (before ->> 'others')::integer + 2 then
    raise exception 'FAIL: the animals are miscounted: %', stats -> 'animals';
  end if;
end;
$$;

reset role;
do $$
begin
  if has_function_privilege('anon', 'public.admin_stats(text)', 'EXECUTE') then
    raise exception 'FAIL: a signed-out visitor can read the admin''s charts';
  end if;
end;
$$;

select 'Admin stats checks passed' as result;
rollback;
