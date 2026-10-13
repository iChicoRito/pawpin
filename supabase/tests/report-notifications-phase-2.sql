-- Run after 0033_notification_push.sql. All fixtures are rolled back.
-- pg_net sends only on commit, so every request waits in net.http_request_queue, is read there,
-- and is thrown away by the rollback. Nothing is sent.
begin;

insert into auth.users (id, is_anonymous, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', false, '{}'),  -- the reporter
  ('00000000-0000-4000-8000-00000000000b', false, '{}'),  -- the rescuer
  ('00000000-0000-4000-8000-00000000000d', false, '{}'),  -- an admin
  ('00000000-0000-4000-8000-00000000000e', false, '{}');  -- a reporter with no phone saved
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-00000000000d';
update public.profiles set push_token = 'tok-a' where id = '00000000-0000-4000-8000-00000000000a';
update public.profiles set push_token = 'tok-b' where id = '00000000-0000-4000-8000-00000000000b';

-- Far out at sea, so no real user is near enough to be alerted about these reports.
insert into public.reports (id, reporter_id, location, urgency, animal_type, photos)
select ('00000000-0000-4000-8000-0000000000a' || n)::uuid,
  case when n = 6 then '00000000-0000-4000-8000-00000000000e'
    else '00000000-0000-4000-8000-00000000000a' end::uuid,
  'SRID=4326;POINT(130.0 5.0)', 'critical', 'cat', array['https://example.invalid/rollback-fixture.jpg']
from generate_series(1, 7) n;

alter table public.reports disable trigger on_report_updated;
update public.reports set updated_at = now() - interval '73 hours'
where id = '00000000-0000-4000-8000-0000000000a4';
alter table public.reports enable trigger on_report_updated;

create function pg_temp.as_user(who uuid, statement text) returns void
language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', who, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  execute statement;
  reset role;
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- "title|body" of each message waiting for a phone about a report, in title order.
create function pg_temp.pushed(report text, token text) returns text
language sql as $$
  select coalesce(string_agg((message ->> 'title') || '|' || (message ->> 'body'), ' ## '
    order by message ->> 'title'), '')
  from net.http_request_queue q,
    jsonb_array_elements(convert_from(q.body, 'utf8')::jsonb) message
  where message -> 'data' ->> 'reportId' = report and message ->> 'to' = token;
$$;

do $$
declare
  reporter constant uuid := '00000000-0000-4000-8000-00000000000a';
  rescuer constant uuid := '00000000-0000-4000-8000-00000000000b';
  admin constant uuid := '00000000-0000-4000-8000-00000000000d';
  r constant text := '00000000-0000-4000-8000-0000000000a';
  logged constant bigint := (select count(*) from public.alert_log);
  waiting bigint;
  message jsonb;
begin
  -- 1: on the way, then gave up.
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '1'));
  if pg_temp.pushed(r || '1', 'tok-a') <> 'Someone is on the way to the cat you reported|A rescuer is going to it now.' then
    raise exception 'FAIL: on the way pushed "%"', pg_temp.pushed(r || '1', 'tok-a');
  end if;
  -- The push names the notification it is about, and that row is the reporter's.
  select m into message from net.http_request_queue q,
    jsonb_array_elements(convert_from(q.body, 'utf8')::jsonb) m
  where m -> 'data' ->> 'reportId' = r || '1';
  if message ->> 'channelId' <> 'default' or not exists (
    select 1 from public.notifications
    where id = (message -> 'data' ->> 'notificationId')::uuid and user_id = reporter and kind = 'on_the_way') then
    raise exception 'FAIL: unexpected push %', message;
  end if;
  perform pg_temp.as_user(rescuer, format('select public.cancel_claim(%L)', r || '1'));
  if pg_temp.pushed(r || '1', 'tok-a') not like '% ## The rescuer could not go to the cat you reported|It is open again for someone else.' then
    raise exception 'FAIL: giving up pushed "%"', pg_temp.pushed(r || '1', 'tok-a');
  end if;
  if pg_temp.pushed(r || '1', 'tok-b') <> '' then
    raise exception 'FAIL: the rescuer was pushed their own actions';
  end if;

  -- 2: an admin closes with a reason, a rescuer on the way. One push each, plus "on the way".
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '2'));
  perform pg_temp.as_user(admin, format('select public.admin_close_report(%L, %L)', r || '2', 'Wrong place'));
  if pg_temp.pushed(r || '2', 'tok-a') not like '% ## Your report of the cat was closed|Reason: Wrong place.' then
    raise exception 'FAIL: an admin''s close pushed "%"', pg_temp.pushed(r || '2', 'tok-a');
  end if;
  if pg_temp.pushed(r || '2', 'tok-b') <> 'The report of the cat you were going to has ended|You can go to another animal.' then
    raise exception 'FAIL: the rescuer was pushed "%"', pg_temp.pushed(r || '2', 'tok-b');
  end if;

  -- 3: rescued. One push for it, the old one from 0017, not two.
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '3'));
  perform pg_temp.as_user(rescuer, format('select public.resolve_report(%L, %L)', r || '3', 'rescued'));
  if pg_temp.pushed(r || '3', 'tok-a') <> 'Someone is on the way to the cat you reported|A rescuer is going to it now.'
    || ' ## The cat you reported was rescued|Someone helped it. Thank you for reporting.' then
    raise exception 'FAIL: a rescue pushed "%"', pg_temp.pushed(r || '3', 'tok-a');
  end if;

  -- 4: the hourly job.
  perform public.close_stale_reports();
  if pg_temp.pushed(r || '4', 'tok-a') <> 'Your report of the cat was closed|Nobody updated it for 72 hours.' then
    raise exception 'FAIL: the 72-hour close pushed "%"', pg_temp.pushed(r || '4', 'tok-a');
  end if;

  -- 6: a reporter with no phone saved. The notification is kept, nothing is sent.
  select count(*) into waiting from net.http_request_queue;
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '6'));
  perform pg_temp.as_user(rescuer, format('select public.cancel_claim(%L)', r || '6'));
  if (select count(*) from net.http_request_queue) <> waiting then
    raise exception 'FAIL: a push was sent to nobody';
  end if;
  if (select count(*) from public.notifications where report_id = (r || '6')::uuid) <> 2 then
    raise exception 'FAIL: notifications were not kept for a reporter with no phone';
  end if;

  if (select count(*) from public.alert_log) <> logged then
    raise exception 'FAIL: a notification was logged as a nearby alert';
  end if;

  -- The send breaks: the notification and the claim are kept all the same.
  alter table public.profiles rename column push_token to push_token_gone;
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '7'));
  if (select status from public.reports where id = (r || '7')::uuid) <> 'responding'
    or (select count(*) from public.notifications where report_id = (r || '7')::uuid) <> 1 then
    raise exception 'FAIL: a failed push lost the claim or its notification';
  end if;
end;
$$;

select 'Report notifications phase 2 checks passed' as result;
rollback;
