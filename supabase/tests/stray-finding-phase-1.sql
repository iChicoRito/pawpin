-- Checks for 0006_nearby_reports.sql.
-- Paste into the Supabase SQL Editor and run. Any wrong result stops with an error that starts
-- with FAIL. Everything is rolled back at the end, so nothing is saved.

begin;

-- One throwaway Google user. Not a guest, so the 3-report limit does not get in the way.
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-00000000000c', false);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated","is_anonymous":false}';

-- Four reports north of the point 14.6, 121.0. One degree of latitude is about 111 km.
-- A is about 100 m away, B about 2 km, C about 8 km, D about 100 m. Longitude first.
insert into public.reports (id, reporter_id, location, urgency) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000c',
   'SRID=4326;POINT(121.0 14.6009)', 'critical'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000c',
   'SRID=4326;POINT(121.0 14.618)', 'needs_help_soon'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-00000000000c',
   'SRID=4326;POINT(121.0 14.672)', 'just_sighted'),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-00000000000c',
   'SRID=4326;POINT(121.0 14.6009)', 'just_sighted');

-- As the database owner, close D.
reset role;
update public.reports set status = 'closed'
where id = '00000000-0000-4000-8000-0000000000d4';

set local role authenticated;

do $$
declare
  a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  b constant uuid := '00000000-0000-4000-8000-0000000000b2';
  c constant uuid := '00000000-0000-4000-8000-0000000000c3';
  d constant uuid := '00000000-0000-4000-8000-0000000000d4';
  -- Only this test's reports are looked at, so real reports near the same point change nothing.
  mine constant uuid[] := array[a, b, c, d];
  found uuid[];
  nearest record;
begin
  select array_agg(id order by ordinality) into found
  from public.nearby_reports(14.6, 121.0, 5000) with ordinality
  where id = any(mine);
  if found is distinct from array[a, b] then
    raise exception 'FAIL: within 5 km expected A then B, got %', found;
  end if;

  select * into nearest from public.nearby_reports(14.6, 121.0, 5000) where id = a;
  if nearest.distance_m not between 50 and 200 then
    raise exception 'FAIL: A should be about 100 m away, got % m', nearest.distance_m;
  end if;
  if abs(nearest.latitude - 14.6009) > 1e-9 or abs(nearest.longitude - 121.0) > 1e-9 then
    raise exception 'FAIL: A came back at %, %', nearest.latitude, nearest.longitude;
  end if;

  select array_agg(id order by ordinality) into found
  from public.nearby_reports(14.6, 121.0, 1000) with ordinality
  where id = any(mine);
  if found is distinct from array[a] then
    raise exception 'FAIL: within 1 km expected only A, got %', found;
  end if;

  select array_agg(id order by ordinality) into found
  from public.nearby_reports(14.6, 121.0, 25000) with ordinality
  where id = any(mine);
  if found is distinct from array[a, b, c] then
    raise exception 'FAIL: within 25 km expected A, B, C, got %', found;
  end if;

  -- A report someone is on the way to is still active.
  update public.reports set status = 'responding' where id = b;
  select array_agg(id order by ordinality) into found
  from public.nearby_reports(14.6, 121.0, 5000) with ordinality
  where id = any(mine);
  if found is distinct from array[a, b] then
    raise exception 'FAIL: a responding report should still come back, got %', found;
  end if;
end;
$$;

-- A signed-out visitor may not search.
set local role anon;

do $$
begin
  begin
    perform public.nearby_reports(14.6, 121.0, 5000);
    raise exception 'FAIL: a signed-out visitor ran the nearby search';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
select 'Phase 1 checks passed' as result;

rollback;
