begin;
set local statement_timeout = '30s';

do $$
declare
  guest uuid := gen_random_uuid();
  reporter uuid := gen_random_uuid();
  report_id uuid;
  ids uuid[] := '{}';
begin
  insert into auth.users (id, is_anonymous, raw_user_meta_data) values
    (guest, true, jsonb_build_object('guest_device_id', substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))),
    (reporter, false, '{}');
  perform set_config('pawpin.quota_guest', guest::text, true);
  perform set_config('pawpin.quota_reporter', reporter::text, true);
  for i in 1..5 loop
    report_id := gen_random_uuid();
    ids := array_append(ids, report_id);
    insert into public.reports (id, reporter_id, location, animal_type, urgency, photos)
      values (report_id, reporter, 'SRID=4326;POINT(0 -89)', 'dog', 'just_sighted', array['https://example.invalid/quota.jpg']);
  end loop;
  perform set_config('pawpin.quota_reports', ids::text, true);
  insert into public.reports (reporter_id, location, animal_type, urgency, photos)
    values (guest, 'SRID=4326;POINT(0 -89)', 'dog', 'just_sighted', array['https://example.invalid/quota.jpg']);
  update public.reports set created_at = now() - interval '24 hours' where reporter_id = guest;
  insert into public.flags (report_id, flagged_by, reason) values (ids[1], guest, 'expired fixture');
  update public.flags set created_at = now() - interval '24 hours' where flagged_by = guest;
end;
$$;

set local role authenticated;
do $$
declare
  guest uuid := current_setting('pawpin.quota_guest')::uuid;
  ids uuid[] := current_setting('pawpin.quota_reports')::uuid[];
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', guest,
    'role', 'authenticated', 'is_anonymous', true)::text, true);
  -- A rejected report must not consume a slot.
  begin
    insert into public.reports (reporter_id, location, animal_type, urgency, photos)
      values (guest, 'SRID=4326;POINT(0 -89)', 'dog', 'just_sighted', '{}');
    raise exception 'invalid report accepted';
  exception when check_violation then null;
  end;
  for i in 1..3 loop
    insert into public.reports (reporter_id, location, animal_type, urgency, photos)
      values (guest, 'SRID=4326;POINT(0 -89)', 'dog', 'just_sighted', array['https://example.invalid/quota.jpg']);
    insert into public.flags (report_id, flagged_by, reason) values (ids[i + 1], guest, 'quota fixture');
  end loop;
  begin
    insert into public.reports (reporter_id, location, animal_type, urgency, photos)
      values (guest, 'SRID=4326;POINT(0 -89)', 'dog', 'just_sighted', array['https://example.invalid/quota.jpg']);
    raise exception 'fourth report accepted';
  exception when raise_exception then
    if sqlerrm <> 'guest_report_limit' then raise; end if;
  end;
  begin
    insert into public.flags (report_id, flagged_by, reason) values (ids[1], guest, 'fourth flag');
    raise exception 'fourth flag accepted';
  exception when raise_exception then
    if sqlerrm <> 'guest_flag_limit' then raise; end if;
  end;
  begin
    update public.profiles set role = 'admin' where id = guest;
    raise exception 'guest granted itself admin';
  exception when insufficient_privilege then null;
  end;
  begin
    perform push_token from public.profiles;
    raise exception 'private token readable';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

do $$
begin
  if has_function_privilege('anon', 'public.enforce_guest_report_limit()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.enforce_guest_report_limit()', 'EXECUTE')
    or has_function_privilege('anon', 'public.enforce_guest_flag_limit()', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.enforce_guest_flag_limit()', 'EXECUTE') then
    raise exception 'quota trigger is client callable';
  end if;
end;
$$;

rollback;
