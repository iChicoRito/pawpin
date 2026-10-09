-- Run after 0016_report_by_id.sql. All fixtures are rolled back.
begin;

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-00000000000a', false),  -- the reporter
  ('00000000-0000-4000-8000-00000000000b', false);  -- a rescuer

insert into public.reports (id, reporter_id, location, urgency, animal_type, landmark) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a',
    'SRID=4326;POINT(121.0 14.6)', 'critical', 'dog', 'public market'),
  ('00000000-0000-4000-8000-0000000000a2', '00000000-0000-4000-8000-00000000000a',
    'SRID=4326;POINT(121.0 14.6)', 'just_sighted', 'cat', null);

set local role authenticated;

do $$
declare
  reporter constant text := '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated","is_anonymous":false}';
  rescuer constant text := '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated","is_anonymous":false}';
  r1 constant uuid := '00000000-0000-4000-8000-0000000000a1';
  r2 constant uuid := '00000000-0000-4000-8000-0000000000a2';
  found record;
  rows integer;
begin
  perform set_config('request.jwt.claims', rescuer, true);

  -- An active report, from a place about 1.1 km north of it.
  select * into found from public.report_by_id(r1, 14.61, 121.0);
  if found.id is distinct from r1 or found.status <> 'reported' then
    raise exception 'FAIL: an active report did not come back';
  end if;
  if found.latitude <> 14.6 or found.longitude <> 121.0 then
    raise exception 'FAIL: wrong place: %, %', found.latitude, found.longitude;
  end if;
  if found.distance_m not between 1000 and 1200 then
    raise exception 'FAIL: wrong distance: %', found.distance_m;
  end if;
  if found.landmark <> 'public market' or found.animal_type <> 'dog' or found.rescuer_id is not null then
    raise exception 'FAIL: wrong details';
  end if;

  -- Far outside any search distance, it still comes back: about 600 km away.
  select * into found from public.report_by_id(r1, 20.0, 121.0);
  if found.id is distinct from r1 or found.distance_m < 500000 then
    raise exception 'FAIL: a far report did not come back';
  end if;

  -- With no place to measure from, there is no distance.
  select * into found from public.report_by_id(r1);
  if found.id is distinct from r1 or found.distance_m is not null then
    raise exception 'FAIL: expected the report with no distance';
  end if;

  -- Someone on the way is named.
  perform public.claim_report(r1);
  select * into found from public.report_by_id(r1, 14.61, 121.0);
  if found.status <> 'responding'
    or found.rescuer_id is distinct from '00000000-0000-4000-8000-00000000000b' then
    raise exception 'FAIL: the rescuer on the way is not named';
  end if;

  -- A finished report still comes back, with how it ended.
  perform public.resolve_report(r1, 'rescued');
  select * into found from public.report_by_id(r1, 14.61, 121.0);
  if found.status <> 'rescued' or found.rescuer_id is not null then
    raise exception 'FAIL: a rescued report came back as %', found.status;
  end if;

  perform set_config('request.jwt.claims', reporter, true);
  perform public.close_report(r2);
  select * into found from public.report_by_id(r2, 14.61, 121.0);
  if found.status <> 'closed' then
    raise exception 'FAIL: a closed report came back as %', found.status;
  end if;

  -- An id that is no report.
  select count(*) into rows from public.report_by_id('00000000-0000-4000-8000-0000000000ff', 14.61, 121.0);
  if rows <> 0 then raise exception 'FAIL: an unknown id gave a row'; end if;
end;
$$;

reset role;
do $$
begin
  if has_function_privilege('anon',
      'public.report_by_id(uuid, double precision, double precision)', 'EXECUTE') then
    raise exception 'FAIL: a signed-out visitor can read a report';
  end if;
  if not has_function_privilege('authenticated',
      'public.report_by_id(uuid, double precision, double precision)', 'EXECUTE') then
    raise exception 'FAIL: a signed-in user cannot read a report';
  end if;
end;
$$;

select 'Phase 3 checks passed' as result;
rollback;
