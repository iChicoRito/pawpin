-- Checks for 0010_closing_reports.sql.
-- Paste into the Supabase SQL Editor and run. Any wrong result stops with an error that starts
-- with FAIL. Everything is rolled back at the end, so nothing is saved.

begin;

-- A reporter, a rescuer, and a stranger. All throwaway Google users.
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-00000000000a', false),
  ('00000000-0000-4000-8000-00000000000b', false),
  ('00000000-0000-4000-8000-00000000000c', false);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated","is_anonymous":false}';

-- Four reports about 100 m north of the point 14.6, 121.0. Longitude first.
-- Their last change is set on the way in: A and B 73 hours back, C 71 hours, D now.
insert into public.reports (id, reporter_id, location, urgency, updated_at) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a',
   'SRID=4326;POINT(121.0 14.6009)', 'critical', now() - interval '73 hours'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000a',
   'SRID=4326;POINT(121.0 14.6009)', 'critical', now() - interval '73 hours'),
  ('00000000-0000-4000-8000-0000000000c3', '00000000-0000-4000-8000-00000000000a',
   'SRID=4326;POINT(121.0 14.6009)', 'just_sighted', now() - interval '71 hours'),
  ('00000000-0000-4000-8000-0000000000d4', '00000000-0000-4000-8000-00000000000a',
   'SRID=4326;POINT(121.0 14.6009)', 'just_sighted', now());

-- The rescuer claims B. A claim is activity: B's 72 hours start again.
do $$
declare
  rescuer constant text :=
    '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated","is_anonymous":false}';
  b constant uuid := '00000000-0000-4000-8000-0000000000b2';
  changed timestamptz;
begin
  perform set_config('request.jwt.claims', rescuer, true);
  perform public.claim_report(b);
  select updated_at into changed from public.reports where id = b;
  if changed < now() - interval '1 hour' then
    raise exception 'FAIL: a claim should restart the 72 hours, last change is %', changed;
  end if;
end;
$$;

-- The hourly job, run here by hand as the database owner.
reset role;
select public.close_stale_reports();
set local role authenticated;

do $$
declare
  reporter constant text :=
    '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated","is_anonymous":false}';
  rescuer constant text :=
    '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated","is_anonymous":false}';
  stranger constant text :=
    '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated","is_anonymous":false}';
  a constant uuid := '00000000-0000-4000-8000-0000000000a1';
  b constant uuid := '00000000-0000-4000-8000-0000000000b2';
  c constant uuid := '00000000-0000-4000-8000-0000000000c3';
  d constant uuid := '00000000-0000-4000-8000-0000000000d4';
  found text;
  total integer;
begin
  -- Only A was untouched for more than 72 hours.
  select string_agg(id::text, ',' order by id) into found
  from public.reports where id in (a, b, c, d) and status = 'closed';
  if found is distinct from a::text then
    raise exception 'FAIL: the job should close A only, closed: %', found;
  end if;
  select status into found from public.reports where id = b;
  if found <> 'responding' then
    raise exception 'FAIL: the claimed report B should still be responding, got %', found;
  end if;

  -- Only the reporter may close a report.
  perform set_config('request.jwt.claims', stranger, true);
  begin
    perform public.close_report(d);
    raise exception 'FAIL: a stranger closed someone else''s report';
  exception when raise_exception then
    if sqlerrm <> 'cannot_close' then
      raise exception 'FAIL: expected cannot_close, got %', sqlerrm;
    end if;
  end;

  -- The reporter closes B while the rescuer is on the way. The claim is cancelled with it.
  perform set_config('request.jwt.claims', reporter, true);
  perform public.close_report(b);
  select status into found from public.reports where id = b;
  if found <> 'closed' then
    raise exception 'FAIL: the reporter''s close should stick, got %', found;
  end if;
  select count(*) into total from public.claims where report_id = b and status = 'cancelled';
  if total <> 1 then
    raise exception 'FAIL: closing should cancel the claim, cancelled claims: %', total;
  end if;

  -- Closed is final.
  begin
    perform public.close_report(b);
    raise exception 'FAIL: a closed report was closed again';
  exception when raise_exception then
    if sqlerrm <> 'cannot_close' then
      raise exception 'FAIL: expected cannot_close, got %', sqlerrm;
    end if;
  end;
  -- The job's own close is final too.
  begin
    perform public.close_report(a);
    raise exception 'FAIL: a report closed by the job was closed again';
  exception when raise_exception then
    if sqlerrm <> 'cannot_close' then
      raise exception 'FAIL: expected cannot_close, got %', sqlerrm;
    end if;
  end;

  -- The rescuer has nothing left to resolve on B, and is free to go to another animal.
  perform set_config('request.jwt.claims', rescuer, true);
  begin
    perform public.resolve_report(b, 'rescued');
    raise exception 'FAIL: an outcome was recorded on a closed report';
  exception when raise_exception then
    if sqlerrm <> 'no_active_claim' then
      raise exception 'FAIL: expected no_active_claim, got %', sqlerrm;
    end if;
  end;
  perform public.claim_report(d);
  perform public.cancel_claim(d);

  -- A signed-in user cannot run the job.
  begin
    perform public.close_stale_reports();
    raise exception 'FAIL: a signed-in user ran close_stale_reports';
  exception when insufficient_privilege then
    null;
  end;

  -- Closed reports are gone from the nearby search; the other two are still found.
  select string_agg(id::text, ',' order by id) into found
  from public.nearby_reports(14.6, 121.0, 5000) where id in (a, b, c, d);
  if found is distinct from c::text || ',' || d::text then
    raise exception 'FAIL: the nearby search should hand back C and D only, got %', found;
  end if;
end;
$$;

-- A signed-out visitor may run neither.
set local role anon;

do $$
begin
  begin
    perform public.close_report('00000000-0000-4000-8000-0000000000d4');
    raise exception 'FAIL: a signed-out visitor ran close_report';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.close_stale_reports();
    raise exception 'FAIL: a signed-out visitor ran close_stale_reports';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
select 'Phase 4 checks passed' as result;

rollback;
