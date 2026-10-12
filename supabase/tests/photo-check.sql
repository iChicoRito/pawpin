-- Run after 0023_no_animal_seen.sql. All fixtures are rolled back.
begin;

insert into auth.users (id, is_anonymous, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', false, '{}'),  -- the reporter
  ('00000000-0000-4000-8000-00000000000b', false, '{}'),  -- another user
  ('00000000-0000-4000-8000-00000000000d', false, '{}');  -- an admin, made by hand as the owner does
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-00000000000d';

set local role authenticated;
do $$
declare
  reporter constant uuid := '00000000-0000-4000-8000-00000000000a';
  other constant uuid := '00000000-0000-4000-8000-00000000000b';
  admin constant uuid := '00000000-0000-4000-8000-00000000000d';
  marked constant uuid := '00000000-0000-4000-8000-0000000000a1';
  plain constant uuid := '00000000-0000-4000-8000-0000000000a2';
  changed integer;
begin
  -- The reporter sends two reports, as the app does. Far out at sea, so no real user is alerted.
  perform set_config('request.jwt.claims',
    json_build_object('sub', reporter, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  insert into public.reports (id, reporter_id, location, urgency, no_animal_seen)
  values (marked, reporter, 'SRID=4326;POINT(130.0 5.0)', 'critical', true);
  insert into public.reports (id, reporter_id, location, urgency)
  values (plain, reporter, 'SRID=4326;POINT(130.0 5.0)', 'critical');

  if not (select no_animal_seen from public.reports where id = marked) then
    raise exception 'FAIL: a report sent with the mark lost it';
  end if;
  if (select no_animal_seen from public.reports where id = plain) then
    raise exception 'FAIL: a report sent without the mark has it';
  end if;

  -- The reporter cannot take the mark off afterwards.
  begin
    update public.reports set no_animal_seen = false where id = marked;
    raise exception 'FAIL: the reporter changed the mark';
  exception when insufficient_privilege then null;
  end;

  -- The other columns are as open as before.
  update public.reports set landmark = 'By the pier' where id = marked;
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'FAIL: the reporter could not update the landmark';
  end if;

  -- The searches still answer.
  if not exists (select 1 from public.nearby_reports(5.0, 130.0, 1000) where id = marked) then
    raise exception 'FAIL: the nearby search lost the report';
  end if;
  if not exists (select 1 from public.report_by_id(marked)) then
    raise exception 'FAIL: the report page lost the report';
  end if;

  -- Nobody else can change the mark either.
  perform set_config('request.jwt.claims',
    json_build_object('sub', other, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  begin
    update public.reports set no_animal_seen = false where id = marked;
    raise exception 'FAIL: another user changed the mark';
  exception when insufficient_privilege then null;
  end;

  -- The admin reads the mark, and the admin's numbers still answer.
  perform set_config('request.jwt.claims',
    json_build_object('sub', admin, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  if not (select no_animal_seen from public.reports where id = marked) then
    raise exception 'FAIL: the admin could not read the mark';
  end if;
  perform * from public.admin_overview();
  perform public.admin_stats();
end;
$$;

reset role;
do $$
begin
  if not (select no_animal_seen from public.reports
          where id = '00000000-0000-4000-8000-0000000000a1') then
    raise exception 'FAIL: the mark did not stay on the report';
  end if;
end;
$$;

select 'Photo check mark checks passed' as result;
rollback;
