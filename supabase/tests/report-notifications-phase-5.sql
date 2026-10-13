-- Run after 0034_messages.sql. All fixtures are rolled back, and pg_net sends only on commit:
-- nothing is sent.
begin;

insert into auth.users (id, is_anonymous, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', false, '{}'),  -- the reporter
  ('00000000-0000-4000-8000-00000000000b', false, '{}'),  -- the rescuer
  ('00000000-0000-4000-8000-00000000000c', false, '{}'),  -- someone else
  ('00000000-0000-4000-8000-00000000000d', false, '{}');  -- an admin
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-00000000000d';
update public.profiles set push_token = 'tok-a' where id = '00000000-0000-4000-8000-00000000000a';
update public.profiles set push_token = 'tok-b' where id = '00000000-0000-4000-8000-00000000000b';

insert into public.reports (id, reporter_id, location, urgency, animal_type, photos)
select ('00000000-0000-4000-8000-0000000000a' || n)::uuid, '00000000-0000-4000-8000-00000000000a',
  'SRID=4326;POINT(130.0 5.0)', 'critical', 'dog', array['https://example.invalid/rollback-fixture.jpg']
from generate_series(1, 4) n;

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

-- How many messages a person can read, as the app would.
create function pg_temp.reads(who uuid) returns bigint
language plpgsql as $$
declare seen bigint;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', who, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  -- Only this test's own: an admin reads every message, the real ones too.
  select count(*) into seen from public.messages
  where report_id::text like '00000000-0000-4000-8000-0000000000a_';
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return seen;
end;
$$;

-- Must be refused with exactly this message.
create function pg_temp.refused(who uuid, statement text, expected text) returns void
language plpgsql as $$
begin
  begin
    perform pg_temp.as_user(who, statement);
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> expected then
      raise exception 'FAIL: expected %, got % for %', expected, sqlerrm, statement;
    end if;
    return;
  end;
  raise exception 'FAIL: not refused (%): %', expected, statement;
end;
$$;

do $$
declare
  reporter constant uuid := '00000000-0000-4000-8000-00000000000a';
  rescuer constant uuid := '00000000-0000-4000-8000-00000000000b';
  other constant uuid := '00000000-0000-4000-8000-00000000000c';
  admin constant uuid := '00000000-0000-4000-8000-00000000000d';
  r constant text := '00000000-0000-4000-8000-0000000000a';
  claim uuid;
  pushes bigint;
  message jsonb;
begin
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '1'));
  select id into claim from public.claims where report_id = (r || '1')::uuid;
  select count(*) into pushes from net.http_request_queue;

  -- Both write, both read both. Nobody else reads; an admin does.
  perform pg_temp.as_user(rescuer, format('select public.send_message(%L, %L)', claim, '  On my way, 5 minutes.  '));
  perform pg_temp.as_user(rescuer, format('select public.send_message(%L, %L)', claim, 'Is it still there?'));
  perform pg_temp.as_user(reporter, format('select public.send_message(%L, %L)', claim, repeat('x', 500)));
  if pg_temp.reads(reporter) <> 3 or pg_temp.reads(rescuer) <> 3 or pg_temp.reads(admin) <> 3
    or pg_temp.reads(other) <> 0 then
    raise exception 'FAIL: read by reporter %, rescuer %, admin %, other %', pg_temp.reads(reporter),
      pg_temp.reads(rescuer), pg_temp.reads(admin), pg_temp.reads(other);
  end if;
  if not exists (select 1 from public.messages where body = 'On my way, 5 minutes.') then
    raise exception 'FAIL: a message was not trimmed';
  end if;

  -- Two messages in a row: one unread line in the reporter's list, two pushes to their phone.
  if (select count(*) from public.notifications
      where user_id = reporter and report_id = (r || '1')::uuid and kind = 'message') <> 1
    or (select count(*) from public.notifications
      where user_id = rescuer and report_id = (r || '1')::uuid and kind = 'message') <> 1 then
    raise exception 'FAIL: the message notifications are not one each';
  end if;
  if (select count(*) from net.http_request_queue) <> pushes + 3 then
    raise exception 'FAIL: % pushes for 3 messages', (select count(*) from net.http_request_queue) - pushes;
  end if;
  select m into message from net.http_request_queue q,
    jsonb_array_elements(convert_from(q.body, 'utf8')::jsonb) m
  where m ->> 'body' = 'Is it still there?';
  if message ->> 'to' <> 'tok-a' or message ->> 'title' <> 'Message about the dog you reported'
    or message -> 'data' ->> 'claimId' <> claim::text
    or message -> 'data' ->> 'reportId' <> r || '1'
    or not exists (select 1 from public.notifications
      where id = (message -> 'data' ->> 'notificationId')::uuid and user_id = reporter) then
    raise exception 'FAIL: unexpected message push %', message;
  end if;
  if not exists (select 1 from net.http_request_queue q,
      jsonb_array_elements(convert_from(q.body, 'utf8')::jsonb) m
    where m ->> 'to' = 'tok-b' and m ->> 'title' = 'Message about the dog you are going to'
      and m ->> 'body' = repeat('x', 100)) then
    raise exception 'FAIL: the rescuer was not pushed the reporter''s message, cut to 100';
  end if;

  -- Who may not write, and what may not be written.
  perform pg_temp.refused(other, format('select public.send_message(%L, %L)', claim, 'hi'), 'not_in_chat');
  perform pg_temp.refused(admin, format('select public.send_message(%L, %L)', claim, 'hi'), 'not_in_chat');
  perform pg_temp.refused(reporter, format('select public.send_message(%L, %L)', gen_random_uuid(), 'hi'), 'not_in_chat');
  perform pg_temp.refused(reporter, format('select public.send_message(%L, %L)', claim, '   '), 'empty_message');
  perform pg_temp.refused(reporter, format('select public.send_message(%L, %L)', claim, repeat('x', 501)), 'empty_message');
  perform pg_temp.refused(reporter, format(
    'insert into public.messages (claim_id, report_id, sender_id, body) values (%L, %L, %L, %L)',
    claim, r || '1', reporter, 'hi'), 'permission denied for table messages');
  perform pg_temp.refused(reporter, 'update public.messages set body = ''changed''',
    'permission denied for table messages');
  perform pg_temp.refused(reporter, 'delete from public.messages', 'permission denied for table messages');

  -- At most 20 a minute. The rescuer has sent 2.
  for n in 1..18 loop
    perform pg_temp.as_user(rescuer, format('select public.send_message(%L, %L)', claim, 'again ' || n));
  end loop;
  perform pg_temp.refused(rescuer, format('select public.send_message(%L, %L)', claim, 'one more'), 'too_fast');

  -- The rescuer gives up: the thread is read, not written.
  perform pg_temp.as_user(rescuer, format('select public.cancel_claim(%L)', r || '1'));
  perform pg_temp.refused(reporter, format('select public.send_message(%L, %L)', claim, 'hello?'), 'chat_closed');
  if pg_temp.reads(reporter) <> 21 or pg_temp.reads(rescuer) <> 21 then
    raise exception 'FAIL: an ended thread can no longer be read';
  end if;

  -- The same after an outcome, and after the reporter closes.
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '2'));
  select id into claim from public.claims where report_id = (r || '2')::uuid;
  perform pg_temp.as_user(rescuer, format('select public.resolve_report(%L, %L)', r || '2', 'rescued'));
  perform pg_temp.refused(reporter, format('select public.send_message(%L, %L)', claim, 'thanks'), 'chat_closed');
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '3'));
  select id into claim from public.claims where report_id = (r || '3')::uuid;
  perform pg_temp.as_user(reporter, format('select public.close_report(%L, true)', r || '3'));
  perform pg_temp.refused(rescuer, format('select public.send_message(%L, %L)', claim, 'ok'), 'chat_closed');
  -- The finished claim close_report wrote in the reporter's own name is nobody's thread.
  select id into claim from public.claims where report_id = (r || '3')::uuid and rescuer_id = reporter;
  perform pg_temp.refused(reporter, format('select public.send_message(%L, %L)', claim, 'me'), 'not_in_chat');

  if has_function_privilege('anon', 'public.send_message(uuid, text)', 'EXECUTE') then
    raise exception 'FAIL: a signed-out visitor can run send_message';
  end if;

  -- Telling the other person breaks: the message is kept all the same.
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '4'));
  select id into claim from public.claims where report_id = (r || '4')::uuid;
  alter table public.notifications rename column kind to kind_gone;
  perform pg_temp.as_user(reporter, format('select public.send_message(%L, %L)', claim, 'kept'));
  if not exists (select 1 from public.messages where claim_id = claim and body = 'kept') then
    raise exception 'FAIL: a failed notification lost the message';
  end if;
end;
$$;

select 'Report notifications phase 5 checks passed' as result;
rollback;
