-- Run after 0035_my_chats.sql. All fixtures are rolled back, and pg_net sends only on commit:
-- nothing is sent.
begin;

insert into auth.users (id, is_anonymous, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', false, '{}'),  -- the reporter
  ('00000000-0000-4000-8000-00000000000b', false, '{}'),  -- the rescuer
  ('00000000-0000-4000-8000-00000000000c', false, '{}'),  -- someone else
  ('00000000-0000-4000-8000-00000000000d', false, '{}');  -- an admin
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-00000000000d';
update public.profiles set display_name = 'Rita Reporter' where id = '00000000-0000-4000-8000-00000000000a';
update public.profiles set display_name = 'Sam Rescuer' where id = '00000000-0000-4000-8000-00000000000b';

insert into public.reports (id, reporter_id, location, urgency, animal_type, photos)
select ('00000000-0000-4000-8000-0000000000a' || n)::uuid, '00000000-0000-4000-8000-00000000000a',
  'SRID=4326;POINT(130.0 5.0)', 'critical', case when n = 1 then 'dog' else 'cat' end,
  array['https://example.invalid/first.jpg', 'https://example.invalid/second.jpg']
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

-- A person's chats as the app would read them, as json, newest first.
create function pg_temp.chats(who uuid) returns jsonb
language plpgsql as $$
declare found jsonb;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', who, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into found from public.my_chats() c;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return found;
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
  seen jsonb;
begin
  -- 2: a claim with messages that has ended. 3: a claim that ended with none.
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '2'));
  select id into claim from public.claims where report_id = (r || '2')::uuid;
  perform pg_temp.as_user(reporter, format('select public.send_message(%L, %L)', claim, 'Thank you'));
  perform pg_temp.as_user(rescuer, format('select public.resolve_report(%L, %L)', r || '2', 'rescued'));
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '3'));
  perform pg_temp.as_user(rescuer, format('select public.cancel_claim(%L)', r || '3'));
  -- 4: the reporter helped it themselves: the claim in their own name is nobody's thread.
  perform pg_temp.as_user(reporter, format('select public.close_report(%L, true)', r || '4'));

  -- 1: on the way now, nothing written yet. It is listed all the same, for both.
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '1'));
  select id into claim from public.claims where report_id = (r || '1')::uuid;
  seen := pg_temp.chats(reporter);
  if jsonb_array_length(seen) <> 2 then
    raise exception 'FAIL: the reporter sees % chats, not 2: %', jsonb_array_length(seen), seen;
  end if;
  if not exists (select 1 from jsonb_array_elements(seen) c
    where c ->> 'claim_id' = claim::text and (c ->> 'is_open')::boolean and c ->> 'last_body' is null
      and not (c ->> 'unread')::boolean) then
    raise exception 'FAIL: an open chat with no messages is not listed as such: %', seen;
  end if;

  -- The rescuer writes. The newest thread comes first, with who it is with and what was said.
  perform pg_temp.as_user(rescuer, format('select public.send_message(%L, %L)', claim, 'On my way'));
  -- Everything in one transaction carries the same time. Make this message the later one.
  update public.messages set created_at = now() + interval '1 minute' where body = 'On my way';
  seen := pg_temp.chats(reporter) -> 0;
  if seen ->> 'claim_id' <> claim::text or seen ->> 'report_id' <> r || '1'
    or seen ->> 'animal_type' <> 'dog' or seen ->> 'photo' <> 'https://example.invalid/first.jpg'
    or seen ->> 'other_name' <> 'Sam Rescuer' or not (seen ->> 'other_is_rescuer')::boolean
    or seen ->> 'last_body' <> 'On my way' or (seen ->> 'last_from_me')::boolean
    or not (seen ->> 'unread')::boolean or not (seen ->> 'is_open')::boolean then
    raise exception 'FAIL: the reporter sees %', seen;
  end if;
  seen := pg_temp.chats(rescuer) -> 0;
  if seen ->> 'other_name' <> 'Rita Reporter' or (seen ->> 'other_is_rescuer')::boolean
    or not (seen ->> 'last_from_me')::boolean or (seen ->> 'unread')::boolean then
    raise exception 'FAIL: the rescuer sees %', seen;
  end if;

  -- The ended thread is second for both, and closed. The one with no messages is in neither list.
  seen := pg_temp.chats(rescuer);
  if jsonb_array_length(seen) <> 2 or seen -> 1 ->> 'report_id' <> r || '2'
    or (seen -> 1 ->> 'is_open')::boolean or seen -> 1 ->> 'last_body' <> 'Thank you' then
    raise exception 'FAIL: the rescuer''s list is %', seen;
  end if;

  -- Read: the dot goes.
  update public.notifications set read_at = now() where user_id = reporter and kind = 'message';
  if (pg_temp.chats(reporter) -> 0 ->> 'unread')::boolean then
    raise exception 'FAIL: a read chat still counts as unread';
  end if;

  -- Nobody else has any. An admin may read every message, and still has no chats of their own.
  if pg_temp.chats(other) <> '[]'::jsonb or pg_temp.chats(admin) <> '[]'::jsonb then
    raise exception 'FAIL: someone outside sees chats: % / %', pg_temp.chats(other), pg_temp.chats(admin);
  end if;

  if has_function_privilege('anon', 'public.my_chats()', 'EXECUTE') then
    raise exception 'FAIL: a signed-out visitor can run my_chats';
  end if;
end;
$$;

select 'Report notifications chats checks passed' as result;
rollback;
