-- Checks for 0007_claims.sql and 0009_one_claim_per_rescuer.sql.
-- Paste into the Supabase SQL Editor and run. Any wrong result stops with an error that starts
-- with FAIL. Everything is rolled back at the end, so nothing is saved.

begin;

-- A reporter, two rescuers, and a guest. All throwaway.
insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-00000000000a', false),
  ('00000000-0000-4000-8000-00000000000b', false),
  ('00000000-0000-4000-8000-00000000000c', false),
  ('00000000-0000-4000-8000-00000000000d', true);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated","is_anonymous":false}';

-- Two reports about 100 m north of the point 14.6, 121.0. Longitude first.
-- The first one's last change is set 80 hours back: now() does not move inside one transaction,
-- so this is how the test sees a claim bring updated_at up to now.
insert into public.reports (id, reporter_id, location, urgency, updated_at) values
  ('00000000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-00000000000a',
   'SRID=4326;POINT(121.0 14.6009)', 'critical', now() - interval '80 hours'),
  ('00000000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-00000000000a',
   'SRID=4326;POINT(121.0 14.6009)', 'just_sighted', now());

do $$
declare
  reporter constant text :=
    '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated","is_anonymous":false}';
  rescuer_one constant text :=
    '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated","is_anonymous":false}';
  rescuer_two constant text :=
    '{"sub":"00000000-0000-4000-8000-00000000000c","role":"authenticated","is_anonymous":false}';
  guest constant text :=
    '{"sub":"00000000-0000-4000-8000-00000000000d","role":"authenticated","is_anonymous":true}';
  one constant uuid := '00000000-0000-4000-8000-00000000000b';
  r1 constant uuid := '00000000-0000-4000-8000-0000000000e1';
  r2 constant uuid := '00000000-0000-4000-8000-0000000000e2';
  report record;
  found uuid;
  total integer;
begin
  -- Rescuer one claims the first report.
  perform set_config('request.jwt.claims', rescuer_one, true);
  perform public.claim_report(r1);

  select status, updated_at into report from public.reports where id = r1;
  if report.status <> 'responding' then
    raise exception 'FAIL: a claimed report should be responding, got %', report.status;
  end if;
  if report.updated_at < now() - interval '1 hour' then
    raise exception 'FAIL: a claim should bring updated_at up to now, got %', report.updated_at;
  end if;

  select count(*) into total from public.claims
  where report_id = r1 and rescuer_id = one and status = 'on_the_way';
  if total <> 1 then
    raise exception 'FAIL: expected one active claim by rescuer one, got %', total;
  end if;

  select rescuer_id into found from public.nearby_reports(14.6, 121.0, 5000) where id = r1;
  if found is distinct from one then
    raise exception 'FAIL: the nearby search should name rescuer one, got %', found;
  end if;

  -- One rescue at a time: while on the way to the first report, rescuer one cannot claim another.
  begin
    perform public.claim_report(r2);
    raise exception 'FAIL: a rescuer claimed a second report while on the way to the first';
  exception when raise_exception then
    if sqlerrm <> 'already_on_the_way' then
      raise exception 'FAIL: expected already_on_the_way, got %', sqlerrm;
    end if;
  end;
  select status into report from public.reports where id = r2;
  if report.status <> 'reported' then
    raise exception 'FAIL: a refused second claim changed the report to %', report.status;
  end if;

  -- Rescuer two can neither claim it nor record its outcome.
  perform set_config('request.jwt.claims', rescuer_two, true);
  begin
    perform public.claim_report(r1);
    raise exception 'FAIL: a second rescuer claimed a report someone is on the way to';
  exception when raise_exception then
    if sqlerrm <> 'report_not_open' then
      raise exception 'FAIL: expected report_not_open, got %', sqlerrm;
    end if;
  end;
  begin
    perform public.resolve_report(r1, 'rescued');
    raise exception 'FAIL: a rescuer without the claim recorded the outcome';
  exception when raise_exception then
    if sqlerrm <> 'no_active_claim' then
      raise exception 'FAIL: expected no_active_claim, got %', sqlerrm;
    end if;
  end;
  begin
    perform public.cancel_claim(r1);
    raise exception 'FAIL: a rescuer cancelled a claim that is not theirs';
  exception when raise_exception then
    if sqlerrm <> 'no_active_claim' then
      raise exception 'FAIL: expected no_active_claim, got %', sqlerrm;
    end if;
  end;

  -- A guest cannot claim.
  perform set_config('request.jwt.claims', guest, true);
  begin
    perform public.claim_report(r2);
    raise exception 'FAIL: a guest claimed a report';
  exception when raise_exception then
    if sqlerrm <> 'guest_cannot_claim' then
      raise exception 'FAIL: expected guest_cannot_claim, got %', sqlerrm;
    end if;
  end;
  select status into report from public.reports where id = r2;
  if report.status <> 'reported' then
    raise exception 'FAIL: a refused claim changed the report to %', report.status;
  end if;

  -- Rescuer one gives up. The report is open again, and can be claimed again.
  perform set_config('request.jwt.claims', rescuer_one, true);
  perform public.cancel_claim(r1);

  select status into report from public.reports where id = r1;
  if report.status <> 'reported' then
    raise exception 'FAIL: a cancelled claim should reopen the report, got %', report.status;
  end if;
  select rescuer_id into found from public.nearby_reports(14.6, 121.0, 5000) where id = r1;
  if found is not null then
    raise exception 'FAIL: nobody should be on the way after a cancel, got %', found;
  end if;

  perform public.claim_report(r1);

  -- The reporter cannot set the status with a plain update, and nobody can add a claim directly.
  perform set_config('request.jwt.claims', reporter, true);
  begin
    update public.reports set status = 'rescued' where id = r1;
    raise exception 'FAIL: the reporter set the status with a plain update';
  exception when insufficient_privilege then
    null;
  end;
  begin
    insert into public.claims (report_id, rescuer_id)
    values (r2, '00000000-0000-4000-8000-00000000000a');
    raise exception 'FAIL: a claim was added without claim_report';
  exception when insufficient_privilege then
    null;
  end;
  -- The details are still the reporter's to change.
  update public.reports set landmark = 'By the gate' where id = r1;

  -- Rescuer one records the outcome. Only rescued and not_found are outcomes.
  perform set_config('request.jwt.claims', rescuer_one, true);
  begin
    perform public.resolve_report(r1, 'closed');
    raise exception 'FAIL: closed was accepted as an outcome';
  exception when raise_exception then
    if sqlerrm <> 'bad_outcome' then
      raise exception 'FAIL: expected bad_outcome, got %', sqlerrm;
    end if;
  end;

  perform public.resolve_report(r1, 'rescued');

  select status into report from public.reports where id = r1;
  if report.status <> 'rescued' then
    raise exception 'FAIL: the outcome should stick as rescued, got %', report.status;
  end if;
  select count(*) into total from public.claims
  where report_id = r1 and rescuer_id = one and status = 'completed';
  if total <> 1 then
    raise exception 'FAIL: expected one completed claim, got %', total;
  end if;
  select count(*) into total from public.claims where report_id = r1 and status = 'cancelled';
  if total <> 1 then
    raise exception 'FAIL: expected the earlier claim to stay cancelled, got %', total;
  end if;

  select count(*) into total from public.nearby_reports(14.6, 121.0, 5000) where id = r1;
  if total <> 0 then
    raise exception 'FAIL: a rescued report still came back from the nearby search';
  end if;
  -- The other report is still open and still found.
  select count(*) into total from public.nearby_reports(14.6, 121.0, 5000) where id = r2;
  if total <> 1 then
    raise exception 'FAIL: the open report should still come back, got % rows', total;
  end if;

  -- With the first rescue finished, rescuer one is free to go to another.
  perform public.claim_report(r2);
  select status into report from public.reports where id = r2;
  if report.status <> 'responding' then
    raise exception 'FAIL: a free rescuer could not claim the next report, got %', report.status;
  end if;
  perform public.cancel_claim(r2);

  -- A report that has ended cannot be claimed.
  begin
    perform public.claim_report(r1);
    raise exception 'FAIL: a rescued report was claimed';
  exception when raise_exception then
    if sqlerrm <> 'report_not_open' then
      raise exception 'FAIL: expected report_not_open, got %', sqlerrm;
    end if;
  end;
end;
$$;

-- A signed-out visitor may run none of the three.
set local role anon;

do $$
declare
  r2 constant uuid := '00000000-0000-4000-8000-0000000000e2';
begin
  begin
    perform public.claim_report(r2);
    raise exception 'FAIL: a signed-out visitor ran claim_report';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.cancel_claim(r2);
    raise exception 'FAIL: a signed-out visitor ran cancel_claim';
  exception when insufficient_privilege then
    null;
  end;
  begin
    perform public.resolve_report(r2, 'rescued');
    raise exception 'FAIL: a signed-out visitor ran resolve_report';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

reset role;
select 'Phase 1 checks passed' as result;

rollback;
