-- Run after 0012_prebuild_safety.sql. All fixtures are rolled back.
begin;

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-00000000000a', false),
  ('00000000-0000-4000-8000-00000000000b', false),
  ('00000000-0000-4000-8000-00000000000c', true);

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated","is_anonymous":false}';

do $$
declare
  initial_status public.report_status;
  definition text;
begin
  foreach initial_status in array array['responding', 'rescued', 'not_found', 'closed']::public.report_status[] loop
    begin
      insert into public.reports (reporter_id, location, urgency, status)
      values ('00000000-0000-4000-8000-00000000000a',
        'SRID=4326;POINT(121.0 14.6)', 'critical', initial_status);
      raise exception 'FAIL: a new report started as %', initial_status;
    exception when insufficient_privilege then null;
    end;
  end loop;

  -- PGlite serializes queries, so also check lock order in the installed function bodies.
  for definition in
    select pg_get_functiondef(oid) from pg_proc
    where oid in ('public.cancel_claim(uuid)'::regprocedure,
      'public.resolve_report(uuid,public.report_status)'::regprocedure)
  loop
    if strpos(definition, 'for update') = 0 or
      strpos(definition, 'for update') > strpos(definition, 'update public.claims') then
      raise exception 'FAIL: report must lock before its claim';
    end if;
  end loop;
end;
$$;

insert into public.reports (id, reporter_id, location, urgency) values
  ('00000000-0000-4000-8000-0000000000a1', '00000000-0000-4000-8000-00000000000a',
    'SRID=4326;POINT(121.0 14.6)', 'critical'),
  ('00000000-0000-4000-8000-0000000000b2', '00000000-0000-4000-8000-00000000000a',
    'SRID=4326;POINT(121.0 14.6)', 'just_sighted');

do $$
declare
  reporter constant text := '{"sub":"00000000-0000-4000-8000-00000000000a","is_anonymous":false}';
  rescuer constant text := '{"sub":"00000000-0000-4000-8000-00000000000b","is_anonymous":false}';
  guest constant text := '{"sub":"00000000-0000-4000-8000-00000000000c","is_anonymous":true}';
  report_id constant uuid := '00000000-0000-4000-8000-0000000000a1';
  second_id constant uuid := '00000000-0000-4000-8000-0000000000b2';
  found text;
begin
  begin
    perform public.claim_report(report_id);
    raise exception 'FAIL: reporter claimed their own report';
  exception when raise_exception then
    if sqlerrm <> 'own_report' then raise; end if;
  end;

  perform set_config('request.jwt.claims', guest, true);
  begin
    perform public.claim_report(report_id);
    raise exception 'FAIL: guest claimed report';
  exception when raise_exception then
    if sqlerrm <> 'guest_cannot_claim' then raise; end if;
  end;

  perform set_config('request.jwt.claims', rescuer, true);
  perform public.claim_report(report_id);
  begin
    perform public.claim_report(second_id);
    raise exception 'FAIL: rescuer claimed two reports at once';
  exception when raise_exception then
    if sqlerrm <> 'already_on_the_way' then raise; end if;
  end;
  begin
    perform public.resolve_report(report_id, 'closed');
    raise exception 'FAIL: rescuer recorded an invalid outcome';
  exception when raise_exception then
    if sqlerrm <> 'bad_outcome' then raise; end if;
  end;
  perform set_config('request.jwt.claims', reporter, true);
  begin
    perform public.cancel_claim(report_id);
    raise exception 'FAIL: reporter cancelled another rescuer claim';
  exception when raise_exception then
    if sqlerrm <> 'no_active_claim' then raise; end if;
  end;
  perform set_config('request.jwt.claims', rescuer, true);
  perform public.cancel_claim(report_id);
  select status into found from public.reports where id = report_id;
  if found <> 'reported' then raise exception 'FAIL: cancellation did not reopen report'; end if;

  perform public.claim_report(report_id);
  perform public.resolve_report(report_id, 'rescued');
  select status into found from public.reports where id = report_id;
  if found <> 'rescued' then raise exception 'FAIL: rescue outcome changed'; end if;

  perform public.claim_report(second_id);
  perform set_config('request.jwt.claims', reporter, true);
  perform public.close_report(second_id);
  perform set_config('request.jwt.claims', rescuer, true);
  begin
    perform public.cancel_claim(second_id);
    raise exception 'FAIL: cancellation reopened closed report';
  exception when raise_exception then
    if sqlerrm <> 'no_active_claim' then raise; end if;
  end;
  begin
    perform public.resolve_report(second_id, 'rescued');
    raise exception 'FAIL: resolution changed closed report';
  exception when raise_exception then
    if sqlerrm <> 'no_active_claim' then raise; end if;
  end;
end;
$$;

reset role;
do $$
begin
  if has_function_privilege('anon', 'public.cancel_claim(uuid)', 'EXECUTE') or
    has_function_privilege('anon', 'public.resolve_report(uuid,public.report_status)', 'EXECUTE') then
    raise exception 'FAIL: signed-out caller can change rescue status';
  end if;
end;
$$;
select 'Pre-build safety checks passed' as result;
rollback;
