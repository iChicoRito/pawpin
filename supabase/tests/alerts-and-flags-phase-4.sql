-- Run after 0017_outcome_notice.sql. All fixtures are rolled back.
-- As in the Phase 2 test: pg_net sends only on commit, so every request waits in
-- net.http_request_queue, is read there, and is thrown away by the rollback. Nothing is sent.
begin;

insert into auth.users (id, is_anonymous, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', false, '{}'),  -- a reporter with a phone
  ('00000000-0000-4000-8000-00000000000b', false, '{}'),  -- the rescuer
  ('00000000-0000-4000-8000-00000000000c', true, '{"guest_device_id":"000000000000000c"}');

update public.profiles set push_token = 'tok-a' where id = '00000000-0000-4000-8000-00000000000a';
update public.profiles set push_token = 'tok-b' where id = '00000000-0000-4000-8000-00000000000b';

-- Far out at sea, so no real user is near enough to be alerted about these reports.
insert into public.reports (id, reporter_id, location, urgency, animal_type)
select ('00000000-0000-4000-8000-0000000000a' || n)::uuid,
  case when n = 6 then '00000000-0000-4000-8000-00000000000c'
    else '00000000-0000-4000-8000-00000000000a' end::uuid,
  'SRID=4326;POINT(130.0 5.0)', 'critical', case when n = 2 then 'cat' else 'dog' end
from generate_series(1, 7) n;

-- The message waiting for a phone about a report, or null.
create function pg_temp.notice(report uuid, token text) returns jsonb
language sql as $$
  select message
  from net.http_request_queue q,
    jsonb_array_elements(convert_from(q.body, 'utf8')::jsonb) message
  where message -> 'data' ->> 'reportId' = report::text
    and message ->> 'to' = token;
$$;

-- Runs one statement as a signed-in user, the way the app would.
create function pg_temp.as_user(who uuid, statement text) returns void
language plpgsql as $$
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', who, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  execute statement;
  reset role;
end;
$$;

do $$
declare
  reporter constant uuid := '00000000-0000-4000-8000-00000000000a';
  rescuer constant uuid := '00000000-0000-4000-8000-00000000000b';
  r constant text := '00000000-0000-4000-8000-0000000000a';
  logged constant bigint := (select count(*) from public.alert_log);
  waiting bigint;
  message jsonb;
begin
  -- Rescued by someone else: the reporter is told.
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '1'));
  if pg_temp.notice((r || '1')::uuid, 'tok-a') is not null then
    raise exception 'FAIL: a claim alone sent a notice';
  end if;
  perform pg_temp.as_user(rescuer, format('select public.resolve_report(%L, %L)', r || '1', 'rescued'));
  message := pg_temp.notice((r || '1')::uuid, 'tok-a');
  if message is null then raise exception 'FAIL: the reporter was not told of a rescue'; end if;
  if message ->> 'title' <> 'The dog you reported was rescued'
    or message ->> 'body' <> 'Someone helped it. Thank you for reporting.'
    or message ->> 'channelId' <> 'default' then
    raise exception 'FAIL: unexpected rescue notice %', message;
  end if;
  if pg_temp.notice((r || '1')::uuid, 'tok-b') is not null then
    raise exception 'FAIL: the rescuer was sent the notice';
  end if;

  -- Not found: told too, in other words.
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '2'));
  perform pg_temp.as_user(rescuer, format('select public.resolve_report(%L, %L)', r || '2', 'not_found'));
  message := pg_temp.notice((r || '2')::uuid, 'tok-a');
  if message ->> 'title' is distinct from 'The cat you reported was not found'
    or message ->> 'body' <> 'A rescuer went to look and could not find it.' then
    raise exception 'FAIL: unexpected not-found notice %', message;
  end if;

  select count(*) into waiting from net.http_request_queue;

  -- The reporter ends their own report, either way: nothing to tell them.
  perform pg_temp.as_user(reporter, format('select public.close_report(%L, true)', r || '3'));
  if (select status from public.reports where id = (r || '3')::uuid) <> 'rescued' then
    raise exception 'FAIL: closing as rescued did not end the report as rescued';
  end if;
  perform pg_temp.as_user(reporter, format('select public.close_report(%L)', r || '4'));
  -- A rescuer gives up: not an outcome.
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '5'));
  perform pg_temp.as_user(rescuer, format('select public.cancel_claim(%L)', r || '5'));
  -- A reporter with no phone saved: the outcome is saved, nobody to tell.
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '6'));
  perform pg_temp.as_user(rescuer, format('select public.resolve_report(%L, %L)', r || '6', 'rescued'));
  if (select status from public.reports where id = (r || '6')::uuid) <> 'rescued' then
    raise exception 'FAIL: an outcome was not saved for a reporter with no phone';
  end if;

  if (select count(*) from net.http_request_queue) <> waiting then
    raise exception 'FAIL: a notice was sent where none was due (% more)',
      (select count(*) from net.http_request_queue) - waiting;
  end if;

  -- Outcome notices do not count toward the hourly limit.
  if (select count(*) from public.alert_log) <> logged then
    raise exception 'FAIL: an outcome notice was logged as an alert';
  end if;

  if has_function_privilege('authenticated', 'public.notify_outcome()', 'EXECUTE')
    or has_function_privilege('anon', 'public.notify_outcome()', 'EXECUTE') then
    raise exception 'FAIL: an app user can run notify_outcome';
  end if;

  -- Telling breaks: the outcome is saved all the same.
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '7'));
  alter table public.profiles rename column push_token to push_token_gone;
  perform pg_temp.as_user(rescuer, format('select public.resolve_report(%L, %L)', r || '7', 'rescued'));
  if (select status from public.reports where id = (r || '7')::uuid) <> 'rescued' then
    raise exception 'FAIL: a failed notice stopped an outcome from being saved';
  end if;
end;
$$;

select 'Phase 4 checks passed' as result;
rollback;
