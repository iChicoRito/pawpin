begin;
set local statement_timeout = '30s';

do $$
declare
  guest uuid := gen_random_uuid();
  other_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, is_anonymous, raw_user_meta_data) values
    (guest, true, jsonb_build_object('guest_device_id', substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))),
    (other_user, false, '{}');
  perform set_config('pawpin.upload_guest', guest::text, true);
  perform set_config('pawpin.upload_other', other_user::text, true);
  perform set_config('pawpin.upload_report', gen_random_uuid()::text, true);
end;
$$;

set local role authenticated;
do $$
declare
  guest uuid := current_setting('pawpin.upload_guest')::uuid;
  report_id uuid := current_setting('pawpin.upload_report')::uuid;
  result jsonb;
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', guest,
    'role', 'authenticated', 'is_anonymous', true)::text, true);
  result := public.prepare_report_upload(report_id, 3);
  if (result ->> 'expires_at')::timestamptz <> now() + interval '24 hours' then
    raise exception 'reservation expiry changed';
  end if;
  perform public.prepare_report_upload(report_id, 1);
  perform public.prepare_report_upload(gen_random_uuid(), 1);
  perform public.prepare_report_upload(gen_random_uuid(), 1);
  begin
    perform public.prepare_report_upload(gen_random_uuid(), 1);
    raise exception 'fourth guest reservation accepted';
  exception when raise_exception then
    if sqlerrm <> 'guest_report_limit' then raise; end if;
  end;
  perform public.release_report_upload(report_id);
  perform public.prepare_report_upload(report_id, 1);
  begin
    perform public.prepare_report_upload(gen_random_uuid(), 4);
    raise exception 'four photos accepted';
  exception when check_violation then null;
  end;
  begin
    perform public.prepare_report_upload(gen_random_uuid(), 0);
    raise exception 'zero photos accepted';
  exception when check_violation then null;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', current_setting('pawpin.upload_other'), 'role', 'authenticated', 'is_anonymous', false)::text, true);
  begin
    perform public.prepare_report_upload(report_id, 1);
    raise exception 'another user acquired reservation';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.release_report_upload(report_id);
    raise exception 'another user released reservation';
  exception when insufficient_privilege then null;
  end;
  if exists (select 1 from public.report_uploads where reporter_id = guest) then
    raise exception 'another user read reservations';
  end if;
end;
$$;
reset role;

-- Expired leases can be renewed without changing report identity.
update public.report_uploads set expires_at = now() - interval '1 second'
where report_id = current_setting('pawpin.upload_report')::uuid;
set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('pawpin.upload_guest'), 'role', 'authenticated', 'is_anonymous', true)::text, true);
select public.prepare_report_upload(current_setting('pawpin.upload_report')::uuid, 3);
reset role;

do $$
begin
  if has_table_privilege('authenticated', 'public.report_uploads', 'INSERT,UPDATE,DELETE')
    or has_function_privilege('anon', 'public.prepare_report_upload(uuid,integer)', 'EXECUTE')
    or has_function_privilege('anon', 'public.release_report_upload(uuid)', 'EXECUTE') then
    raise exception 'reservation write boundary is bypassable';
  end if;
end;
$$;

rollback;
