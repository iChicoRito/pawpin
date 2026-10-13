-- Run after 0036_chat_end.sql. All fixtures are rolled back, and pg_net sends only on commit:
-- nothing is sent.
begin;

insert into auth.users (id, is_anonymous, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', false, '{}'),  -- the reporter
  ('00000000-0000-4000-8000-00000000000b', false, '{}'),  -- the rescuer
  ('00000000-0000-4000-8000-00000000000c', false, '{}'),  -- a second rescuer
  ('00000000-0000-4000-8000-00000000000d', false, '{}');  -- an admin
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-00000000000d';

insert into public.reports (id, reporter_id, location, urgency, animal_type, photos)
select ('00000000-0000-4000-8000-0000000000a' || n)::uuid, '00000000-0000-4000-8000-00000000000a',
  'SRID=4326;POINT(130.0 5.0)', 'critical', 'dog', array['https://example.invalid/rollback-fixture.jpg']
from generate_series(1, 9) n;

alter table public.reports disable trigger on_report_updated;
update public.reports set updated_at = now() - interval '73 hours'
where id = '00000000-0000-4000-8000-0000000000a7';
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

-- The first rescuer goes to a report and says one thing, so the thread is listed once it ends.
-- The claim is dated an hour back: everything here shares one time, and "a later claim" must
-- be later.
create function pg_temp.go(report text) returns uuid
language plpgsql as $$
declare claim uuid;
begin
  perform pg_temp.as_user('00000000-0000-4000-8000-00000000000b', format('select public.claim_report(%L)', report));
  select id into claim from public.claims where report_id = report::uuid and status = 'on_the_way';
  update public.claims set created_at = now() - interval '1 hour' where id = claim;
  perform pg_temp.as_user('00000000-0000-4000-8000-00000000000b', format('select public.send_message(%L, %L)', claim, 'hello'));
  return claim;
end;
$$;

-- Why a chat ended, as a signed-in user is told it.
create function pg_temp.ended(who uuid, claim uuid) returns text
language plpgsql as $$
declare answer text;
begin
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', who, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  select public.chat_end(claim) into answer;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  return coalesce(answer, 'open');
end;
$$;

do $$
declare
  reporter constant uuid := '00000000-0000-4000-8000-00000000000a';
  rescuer constant uuid := '00000000-0000-4000-8000-00000000000b';
  second constant uuid := '00000000-0000-4000-8000-00000000000c';
  admin constant uuid := '00000000-0000-4000-8000-00000000000d';
  r constant text := '00000000-0000-4000-8000-0000000000a';
  claim uuid;
  listed jsonb;

begin
  -- 1: rescued. 2: not found.
  claim := pg_temp.go(r || '1');
  if pg_temp.ended(reporter, claim) <> 'open' then raise exception 'FAIL: an open chat says it ended'; end if;
  perform pg_temp.as_user(rescuer, format('select public.resolve_report(%L, %L)', r || '1', 'rescued'));
  if pg_temp.ended(reporter, claim) <> 'rescued' then raise exception 'FAIL: rescued reads %', pg_temp.ended(reporter, claim); end if;
  claim := pg_temp.go(r || '2');
  perform pg_temp.as_user(rescuer, format('select public.resolve_report(%L, %L)', r || '2', 'not_found'));
  if pg_temp.ended(rescuer, claim) <> 'not_found' then raise exception 'FAIL: not found reads %', pg_temp.ended(rescuer, claim); end if;

  -- 3: the rescuer gave up, and the report is open again.
  claim := pg_temp.go(r || '3');
  perform pg_temp.as_user(rescuer, format('select public.cancel_claim(%L)', r || '3'));
  if pg_temp.ended(reporter, claim) <> 'gave_up' then raise exception 'FAIL: giving up reads %', pg_temp.ended(reporter, claim); end if;
  -- Someone else then rescues it: the first chat still ended because its rescuer gave up.
  perform pg_temp.as_user(second, format('select public.claim_report(%L)', r || '3'));
  perform pg_temp.as_user(second, format('select public.resolve_report(%L, %L)', r || '3', 'rescued'));
  if pg_temp.ended(rescuer, claim) <> 'gave_up' then
    raise exception 'FAIL: a chat given up, then rescued by another, reads %', pg_temp.ended(rescuer, claim);
  end if;

  -- 4: the reporter helped it themselves while the rescuer was on the way.
  claim := pg_temp.go(r || '4');
  perform pg_temp.as_user(reporter, format('select public.close_report(%L, true)', r || '4'));
  if pg_temp.ended(rescuer, claim) <> 'reporter_rescued' then
    raise exception 'FAIL: the reporter''s own rescue reads %', pg_temp.ended(rescuer, claim);
  end if;

  -- 5: the reporter closed it. 6: an admin closed it, with a reason. 7: the 72-hour job.
  claim := pg_temp.go(r || '5');
  perform pg_temp.as_user(reporter, format('select public.close_report(%L)', r || '5'));
  if pg_temp.ended(rescuer, claim) <> 'closed' then raise exception 'FAIL: a closed report reads %', pg_temp.ended(rescuer, claim); end if;
  claim := pg_temp.go(r || '6');
  perform pg_temp.as_user(admin, format('select public.admin_close_report(%L, %L)', r || '6', 'Wrong place'));
  if pg_temp.ended(rescuer, claim) <> 'closed_by_admin' then
    raise exception 'FAIL: an admin''s close reads %', pg_temp.ended(rescuer, claim);
  end if;

  -- The Chats tab is told the same thing, row by row.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', rescuer, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  select jsonb_object_agg(right(c.report_id::text, 1), coalesce(c.ended, 'open')) into listed
  from public.my_chats() c;
  reset role;
  perform set_config('request.jwt.claims', '', true);
  if listed <> '{"1":"rescued","2":"not_found","3":"gave_up","4":"reporter_rescued","5":"closed","6":"closed_by_admin"}'::jsonb then
    raise exception 'FAIL: the list says %', listed;
  end if;

  if has_function_privilege('anon', 'public.chat_end(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'public.my_chats()', 'EXECUTE') then
    raise exception 'FAIL: a signed-out visitor can run these';
  end if;
end;
$$;

select 'Report notifications chat end checks passed' as result;
rollback;
