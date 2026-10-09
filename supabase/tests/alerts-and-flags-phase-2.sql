-- Run after 0015_alerts.sql. All fixtures are rolled back.
-- pg_net sends a request only when its transaction is committed. Here every request waits in
-- net.http_request_queue, is read there, and is thrown away by the rollback. Nothing is sent.
begin;

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-00000000000a', false),  -- the reporter
  ('00000000-0000-4000-8000-00000000000b', false),  -- 1 km away
  ('00000000-0000-4000-8000-00000000000c', false),  -- 8 km away
  ('00000000-0000-4000-8000-00000000000d', false),  -- on the spot, no token
  ('00000000-0000-4000-8000-00000000000e', false),  -- 1 km away, at the hourly limit
  ('00000000-0000-4000-8000-00000000000f', true),   -- a guest whose phone is taken over
  ('00000000-0000-4000-8000-000000000010', false);  -- the account that takes that phone over

-- The reports are near 14.6000, 121.0000. One hundredth of a degree north is about 1.1 km.
update public.profiles set push_token = 'tok-a', last_location = 'SRID=4326;POINT(121.0 14.6)'
  where id = '00000000-0000-4000-8000-00000000000a';
update public.profiles set push_token = 'tok-b', last_location = 'SRID=4326;POINT(121.0 14.609)'
  where id = '00000000-0000-4000-8000-00000000000b';
update public.profiles set push_token = 'tok-c', last_location = 'SRID=4326;POINT(121.0 14.672)'
  where id = '00000000-0000-4000-8000-00000000000c';
update public.profiles set last_location = 'SRID=4326;POINT(121.0 14.6)'
  where id = '00000000-0000-4000-8000-00000000000d';
update public.profiles set push_token = 'tok-e', last_location = 'SRID=4326;POINT(121.0 14.609)'
  where id = '00000000-0000-4000-8000-00000000000e';
update public.profiles set push_token = 'tok-f', last_location = 'SRID=4326;POINT(121.0 14.609)'
  where id = '00000000-0000-4000-8000-00000000000f';
update public.profiles set last_location = 'SRID=4326;POINT(121.0 14.609)'
  where id = '00000000-0000-4000-8000-000000000010';

-- How many waiting messages a report made for a phone.
create function pg_temp.messages(report uuid, token text) returns integer
language sql as $$
  select count(*)::integer
  from net.http_request_queue q,
    jsonb_array_elements(convert_from(q.body, 'utf8')::jsonb) message
  where message -> 'data' ->> 'reportId' = report::text
    and message ->> 'to' = token;
$$;

-- Sends a report as the reporter, the way the app does.
create function pg_temp.report(report uuid, animal text, place text) returns void
language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated","is_anonymous":false}', true);
  insert into public.reports (id, reporter_id, location, urgency, animal_type, landmark)
  values (report, '00000000-0000-4000-8000-00000000000a', 'SRID=4326;POINT(121.0 14.6)',
    'critical', animal, place);
  reset role;
end;
$$;

do $$
declare
  r1 constant uuid := '00000000-0000-4000-8000-0000000000a1';
  r2 constant uuid := '00000000-0000-4000-8000-0000000000a2';
  r3 constant uuid := '00000000-0000-4000-8000-0000000000a3';
  r4 constant uuid := '00000000-0000-4000-8000-0000000000a4';
  user_b constant uuid := '00000000-0000-4000-8000-00000000000b';
  user_c constant uuid := '00000000-0000-4000-8000-00000000000c';
  user_e constant uuid := '00000000-0000-4000-8000-00000000000e';
  user_f constant uuid := '00000000-0000-4000-8000-00000000000f';
  taker constant uuid := '00000000-0000-4000-8000-000000000010';
  message jsonb;
begin
  -- First report.
  perform pg_temp.report(r1, 'dog', 'public market');

  if pg_temp.messages(r1, 'tok-b') <> 1 then
    raise exception 'FAIL: a user 1 km away with a 5 km distance was not alerted';
  end if;
  if not exists (select 1 from public.alert_log where report_id = r1 and user_id = user_b) then
    raise exception 'FAIL: the alert was not logged';
  end if;
  if pg_temp.messages(r1, 'tok-c') <> 0 then
    raise exception 'FAIL: a user 8 km away with a 5 km distance was alerted';
  end if;
  if pg_temp.messages(r1, 'tok-a') <> 0 then
    raise exception 'FAIL: the reporter was alerted about their own report';
  end if;
  if (select count(*) from public.alert_log where report_id = r1) <> 3 then
    raise exception 'FAIL: expected 3 users alerted (b, e, f), found %',
      (select count(*) from public.alert_log where report_id = r1);
  end if;

  -- What the phone is sent.
  select m into message
  from net.http_request_queue q, jsonb_array_elements(convert_from(q.body, 'utf8')::jsonb) m
  where m ->> 'to' = 'tok-b' and m -> 'data' ->> 'reportId' = r1::text;
  if message ->> 'title' <> 'Stray reported nearby' or message ->> 'body' <> 'Dog · public market'
    or message ->> 'channelId' <> 'default' then
    raise exception 'FAIL: unexpected message %', message;
  end if;
  if not exists (select 1 from net.http_request_queue
    where url = 'https://exp.host/--/api/v2/push/send' and method::text = 'POST') then
    raise exception 'FAIL: the request does not go to Expo';
  end if;

  -- A wider alert distance brings a farther report in. User e reaches the hourly limit.
  update public.profiles set notification_radius_m = 10000 where id = user_c;
  insert into public.alert_log (user_id, report_id)
    select user_e, r1 from generate_series(1, 4);
  perform pg_temp.report(r2, 'cat', null);

  if pg_temp.messages(r2, 'tok-c') <> 1 then
    raise exception 'FAIL: a 10 km distance did not bring in a report 8 km away';
  end if;
  if (select m ->> 'body' from net.http_request_queue q,
      jsonb_array_elements(convert_from(q.body, 'utf8')::jsonb) m
      where m ->> 'to' = 'tok-c' and m -> 'data' ->> 'reportId' = r2::text) <> 'Cat' then
    raise exception 'FAIL: a report with no landmark has the wrong text';
  end if;
  if pg_temp.messages(r2, 'tok-e') <> 0 then
    raise exception 'FAIL: a sixth alert within the hour was sent';
  end if;

  -- After the hour, alerts start again.
  update public.alert_log set sent_at = now() - interval '2 hours' where user_id = user_e;
  -- One account signs in on another's phone: the phone's pass moves to it.
  set local role authenticated;
  perform set_config('request.jwt.claims',
    '{"sub":"00000000-0000-4000-8000-000000000010","role":"authenticated","is_anonymous":false}', true);
  update public.profiles set push_token = 'tok-f' where id = taker;
  reset role;
  if (select push_token from public.profiles where id = user_f) is not null then
    raise exception 'FAIL: two accounts hold the same phone';
  end if;
  if (select push_token from public.profiles where id = taker) is distinct from 'tok-f' then
    raise exception 'FAIL: the account that signed in lost its own pass';
  end if;

  perform pg_temp.report(r3, 'dog', 'iCafe');
  if pg_temp.messages(r3, 'tok-e') <> 1 then
    raise exception 'FAIL: alerts did not start again after the hour';
  end if;
  if pg_temp.messages(r3, 'tok-f') <> 1 then
    raise exception 'FAIL: one phone got % alerts for one report', pg_temp.messages(r3, 'tok-f');
  end if;
  if (select count(*) from public.alert_log where report_id = r3 and user_id = user_f) <> 0 then
    raise exception 'FAIL: the account that left the phone was still alerted';
  end if;

  -- The app can reach neither the log nor the function.
  if has_table_privilege('authenticated', 'public.alert_log', 'SELECT')
    or has_table_privilege('authenticated', 'public.alert_log', 'INSERT')
    or has_table_privilege('anon', 'public.alert_log', 'SELECT') then
    raise exception 'FAIL: an app user can reach alert_log';
  end if;
  if has_function_privilege('authenticated', 'public.alert_nearby()', 'EXECUTE')
    or has_function_privilege('anon', 'public.alert_nearby()', 'EXECUTE') then
    raise exception 'FAIL: an app user can run alert_nearby';
  end if;

  -- Alerting breaks: the report is saved all the same.
  drop table public.alert_log;
  perform pg_temp.report(r4, 'dog', 'broken alert');
  if not exists (select 1 from public.reports where id = r4) then
    raise exception 'FAIL: a failed alert stopped a report from being saved';
  end if;
end;
$$;

select 'Phase 2 checks passed' as result;
rollback;
