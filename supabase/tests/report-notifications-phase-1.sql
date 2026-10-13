-- Run after 0032_notifications.sql. All fixtures are rolled back.
begin;

insert into auth.users (id, is_anonymous, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', false, '{}'),  -- the reporter
  ('00000000-0000-4000-8000-00000000000b', false, '{}'),  -- the rescuer
  ('00000000-0000-4000-8000-00000000000d', false, '{}');  -- an admin, made by hand as the owner does
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-00000000000d';

-- Far out at sea, so no real user is near enough to be alerted about these reports.
insert into public.reports (id, reporter_id, location, urgency, animal_type, photos)
select ('00000000-0000-4000-8000-0000000000a' || n)::uuid, '00000000-0000-4000-8000-00000000000a',
  'SRID=4326;POINT(130.0 5.0)', 'critical', 'dog', array['https://example.invalid/rollback-fixture.jpg']
from generate_series(1, 9) n;

-- Report 8 was last touched 73 hours ago. The trigger from 0007 would move the time back to now.
alter table public.reports disable trigger on_report_updated;
update public.reports set updated_at = now() - interval '73 hours'
where id = '00000000-0000-4000-8000-0000000000a8';
alter table public.reports enable trigger on_report_updated;

-- Runs one statement as a signed-in user, the way the app would.
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

-- A person's notifications about one report, oldest first, as "kind" or "kind:reason".
create function pg_temp.told(who uuid, report text) returns text
language sql as $$
  select coalesce(string_agg(kind || coalesce(':' || reason, ''), ',' order by created_at, kind), '')
  from public.notifications where user_id = who and report_id = report::uuid;
$$;

do $$
declare
  reporter constant uuid := '00000000-0000-4000-8000-00000000000a';
  rescuer constant uuid := '00000000-0000-4000-8000-00000000000b';
  admin constant uuid := '00000000-0000-4000-8000-00000000000d';
  r constant text := '00000000-0000-4000-8000-0000000000a';
  seen integer;
begin
  -- 1: a claim, then the rescuer gives up.
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '1'));
  if pg_temp.told(reporter, r || '1') <> 'on_the_way' or pg_temp.told(rescuer, r || '1') <> '' then
    raise exception 'FAIL: a claim told % / %', pg_temp.told(reporter, r || '1'), pg_temp.told(rescuer, r || '1');
  end if;
  perform pg_temp.as_user(rescuer, format('select public.cancel_claim(%L)', r || '1'));
  if pg_temp.told(reporter, r || '1') not in ('on_the_way,gave_up', 'gave_up,on_the_way')
    or pg_temp.told(rescuer, r || '1') <> '' then
    raise exception 'FAIL: giving up told % / %', pg_temp.told(reporter, r || '1'), pg_temp.told(rescuer, r || '1');
  end if;

  -- 2 and 3: the two outcomes.
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '2'));
  perform pg_temp.as_user(rescuer, format('select public.resolve_report(%L, %L)', r || '2', 'rescued'));
  if pg_temp.told(reporter, r || '2') not in ('on_the_way,rescued', 'rescued,on_the_way')
    or pg_temp.told(rescuer, r || '2') <> '' then
    raise exception 'FAIL: a rescue told % / %', pg_temp.told(reporter, r || '2'), pg_temp.told(rescuer, r || '2');
  end if;
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '3'));
  perform pg_temp.as_user(rescuer, format('select public.resolve_report(%L, %L)', r || '3', 'not_found'));
  if pg_temp.told(reporter, r || '3') not in ('on_the_way,not_found', 'not_found,on_the_way') then
    raise exception 'FAIL: not found told %', pg_temp.told(reporter, r || '3');
  end if;

  -- 4 and 5: the reporter ends their own report, nobody on the way. Nothing to tell.
  perform pg_temp.as_user(reporter, format('select public.close_report(%L, true)', r || '4'));
  perform pg_temp.as_user(reporter, format('select public.close_report(%L)', r || '5'));
  if pg_temp.told(reporter, r || '4') <> '' or pg_temp.told(reporter, r || '5') <> '' then
    raise exception 'FAIL: a reporter was told of their own closing';
  end if;

  -- 6: the reporter helps the animal while a rescuer is on the way. The rescuer is told; the
  -- reporter is not told the rescuer "gave up", nor of their own rescue.
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '6'));
  perform pg_temp.as_user(reporter, format('select public.close_report(%L, true)', r || '6'));
  if pg_temp.told(reporter, r || '6') <> 'on_the_way' or pg_temp.told(rescuer, r || '6') <> 'closed_under_you' then
    raise exception 'FAIL: closing under a rescuer told % / %',
      pg_temp.told(reporter, r || '6'), pg_temp.told(rescuer, r || '6');
  end if;

  -- 7: an admin closes with a reason, a rescuer on the way.
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '7'));
  begin
    perform pg_temp.as_user(rescuer, format('select public.admin_close_report(%L, %L)', r || '7', 'Wrong place'));
    raise exception 'FAIL: a plain user closed a report as admin';
  exception when raise_exception then
    if sqlerrm <> 'not_admin' then raise; end if;
    reset role;
  end;
  perform pg_temp.as_user(admin, format('select public.admin_close_report(%L, %L)', r || '7', ' Wrong place '));
  if pg_temp.told(reporter, r || '7') not in ('on_the_way,closed_by_admin:Wrong place', 'closed_by_admin:Wrong place,on_the_way')
    or pg_temp.told(rescuer, r || '7') <> 'closed_under_you'
    or pg_temp.told(admin, r || '7') <> '' then
    raise exception 'FAIL: an admin''s close told % / %',
      pg_temp.told(reporter, r || '7'), pg_temp.told(rescuer, r || '7');
  end if;
  if (select close_reason from public.reports where id = (r || '7')::uuid) is distinct from 'Wrong place' then
    raise exception 'FAIL: the reason was not saved on the report';
  end if;

  -- 9: an admin closes with no reason, as the app does until it asks for one.
  perform pg_temp.as_user(admin, format('select public.admin_close_report(%L)', r || '9'));
  if (select status from public.reports where id = (r || '9')::uuid) <> 'closed'
    or pg_temp.told(reporter, r || '9') <> '' then
    raise exception 'FAIL: a close without a reason told %', pg_temp.told(reporter, r || '9');
  end if;

  -- 8: untouched for 73 hours. The hourly job closes it.
  perform public.close_stale_reports();
  if pg_temp.told(reporter, r || '8') <> 'closed_stale' then
    raise exception 'FAIL: the 72-hour close told %', pg_temp.told(reporter, r || '8');
  end if;

  -- Who may do what with the rows. The reporter has some; the rescuer has two.
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object(
    'sub', reporter, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  select count(*) into seen from public.notifications where user_id <> reporter;
  if seen <> 0 then raise exception 'FAIL: a user read % of another''s notifications', seen; end if;
  select count(*) into seen from public.notifications;
  if seen = 0 then raise exception 'FAIL: a user cannot read their own notifications'; end if;

  update public.notifications set read_at = now() where report_id = (r || '1')::uuid;
  get diagnostics seen = row_count;
  if seen <> 2 then raise exception 'FAIL: marking read changed % rows, not 2', seen; end if;
  update public.notifications set read_at = now() where user_id = rescuer;
  get diagnostics seen = row_count;
  if seen <> 0 then raise exception 'FAIL: a user marked another''s notification read'; end if;

  begin
    update public.notifications set kind = 'rescued' where report_id = (r || '1')::uuid;
    raise exception 'FAIL: a user changed what a notification says';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.notifications (user_id, report_id, kind) values (reporter, (r || '1')::uuid, 'rescued');
    raise exception 'FAIL: a user wrote a notification';
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.notifications where user_id = reporter;
    raise exception 'FAIL: a user deleted a notification';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.add_notification(reporter, (r || '1')::uuid, 'rescued');
    raise exception 'FAIL: a user ran add_notification';
  exception when insufficient_privilege then null;
  end;
  reset role;
  perform set_config('request.jwt.claims', '', true);

  -- Telling breaks: the claim and the outcome are saved all the same.
  alter table public.notifications rename column kind to kind_gone;
  perform pg_temp.as_user(rescuer, format('select public.claim_report(%L)', r || '1'));
  perform pg_temp.as_user(rescuer, format('select public.resolve_report(%L, %L)', r || '1', 'rescued'));
  if (select status from public.reports where id = (r || '1')::uuid) <> 'rescued' then
    raise exception 'FAIL: a failed notification stopped an outcome from being saved';
  end if;
end;
$$;

select 'Report notifications phase 1 checks passed' as result;
rollback;
