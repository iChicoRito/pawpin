-- Run only through check-push-delivery.cjs, which stages 0028 in this transaction.
begin;
do $$
begin
  if to_regclass('push_private.notification_jobs') is null then
    raise exception 'push preparation missing';
  end if;
  if has_schema_privilege('anon', 'push_private', 'USAGE')
    or has_schema_privilege('authenticated', 'push_private', 'USAGE') then
    raise exception 'private jobs reachable by app roles';
  end if;
end;
$$;

do $$
declare
  fixture record;
  got text;
begin
  for fixture in select * from (values
    ('ticket', 200, '{"status":"ok","id":"fixture-ticket"}'::jsonb, false, 'accepted'),
    ('receipt', 200, '{"status":"ok"}'::jsonb, false, 'delivered'),
    ('ticket', 200, '{"status":"ok"}'::jsonb, false, 'retry'),
    ('ticket', 200, null::jsonb, false, 'retry'),
    ('receipt', 200, null::jsonb, false, 'wait'),
    ('ticket', null::int, null::jsonb, true, 'retry'),
    ('ticket', 429, '{}'::jsonb, false, 'retry'),
    ('ticket', 503, '{}'::jsonb, false, 'retry'),
    ('ticket', 401, '{}'::jsonb, false, 'pause'),
    ('receipt', 403, '{}'::jsonb, false, 'pause'),
    ('ticket', 200, '{"errors":[{"code":"UNAUTHORIZED","message":"raw secret"}]}'::jsonb, false, 'pause'),
    ('ticket', 200, '{"errors":[{"code":"TOO_MANY_REQUESTS"}]}'::jsonb, false, 'retry'),
    ('ticket', 400, '{"errors":[{"code":"PUSH_TOO_MANY_EXPERIENCE_IDS"}]}'::jsonb, false, 'failed'),
    ('ticket', 200, '{"status":"error","details":{"error":"DeviceNotRegistered"}}'::jsonb, false, 'invalid_token'),
    ('receipt', 200, '{"status":"error","details":{"error":"DeviceNotRegistered"}}'::jsonb, false, 'invalid_token'),
    ('receipt', 200, '{"status":"error","details":{"error":"InvalidCredentials"}}'::jsonb, false, 'pause'),
    ('receipt', 200, '{"status":"error","details":{"error":"MismatchSenderId"}}'::jsonb, false, 'pause'),
    ('receipt', 200, '{"status":"error","details":{"error":"MessageRateExceeded"}}'::jsonb, false, 'retry'),
    ('receipt', 200, '{"status":"error","details":{"error":"MessageTooBig"}}'::jsonb, false, 'failed'),
    ('ticket', 200, '{"status":"error","details":{"error":"UnknownNewError"}}'::jsonb, false, 'failed')
  ) as cases(stage, http_status, item, network_failure, expected) loop
    got := push_private.classify_response(fixture.stage, fixture.http_status, fixture.item, fixture.network_failure);
    if got is distinct from fixture.expected then
      raise exception 'classification expected %, got %', fixture.expected, got;
    end if;
  end loop;
  if push_private.retry_delay(0) <> interval '30 seconds'
    or push_private.retry_delay(1) <> interval '2 minutes'
    or push_private.retry_delay(2) <> interval '10 minutes'
    or push_private.retry_delay(3) <> interval '30 minutes'
    or push_private.retry_delay(4) <> interval '2 hours'
    or push_private.retry_delay(5) is not null then
    raise exception 'retry schedule not bounded to five retries';
  end if;
end;
$$;

-- Every profile/report below belongs to rollback-only fixtures. No trigger HTTP runs.
lock table public.profiles in share row exclusive mode;
alter table public.reports disable trigger on_report_alert;
alter table public.reports disable trigger on_report_outcome;

do $$
declare
  reporter uuid := gen_random_uuid();
  recipient uuid := gen_random_uuid();
  guest uuid := gen_random_uuid();
  far_user uuid := gen_random_uuid();
  switched uuid := gen_random_uuid();
  fixture_report uuid;
  job_id bigint;
  ids uuid[] := '{}';
  token text := 'ExponentPushToken[fixture-' || gen_random_uuid()::text || ']';
  point extensions.geography := 'SRID=4326;POINT(0 -89)';
begin
  if exists (select 1 from public.profiles where push_token is not null
    and extensions.st_dwithin(last_location, point, notification_radius_m)) then
    raise exception 'unsafe location: existing nearby recipient';
  end if;
  insert into auth.users(id, is_anonymous, raw_user_meta_data) values
    (reporter, false, '{}'), (recipient, false, '{}'), (far_user, false, '{}'), (switched, false, '{}'),
    (guest, true, jsonb_build_object('guest_device_id', substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)));
  update public.profiles set push_token = token, last_location = point where id = recipient;
  update public.profiles set push_token = 'ExponentPushToken[fixture-guest-' || guest || ']', last_location = point where id = guest;
  update public.profiles set push_token = 'ExponentPushToken[fixture-reporter-' || reporter || ']', last_location = point where id = reporter;
  update public.profiles set push_token = 'ExponentPushToken[fixture-far-' || far_user || ']',
    last_location = 'SRID=4326;POINT(0 -80)', notification_radius_m = 1000 where id = far_user;

  for i in 1..6 loop
    fixture_report := gen_random_uuid();
    ids := array_append(ids, fixture_report);
    insert into public.reports(id, reporter_id, location, animal_type, landmark, urgency, photos)
      values(fixture_report, reporter, point, 'dog', 'market', 'just_sighted', array['https://example.invalid/push.jpg']);
    perform push_private.queue_report(fixture_report, 'nearby', null);
    perform push_private.queue_report(fixture_report, 'nearby', null);
  end loop;
  if (select count(*) from push_private.notification_jobs where user_id = recipient) <> 5
    or (select count(*) from push_private.notification_jobs where user_id = guest) <> 5
    or exists(select 1 from push_private.notification_jobs where user_id in (reporter, far_user)) then
    raise exception 'recipient exclusion/radius/guest/quota/dedup changed';
  end if;
  if exists(select 1 from public.alert_log where user_id in(recipient, guest)) then
    raise exception 'queue insertion claimed acceptance';
  end if;
  update push_private.notification_jobs set created_at = now() - interval '2 hours'
    where user_id = recipient and report_id = ids[1];
  perform push_private.queue_report(ids[6], 'nearby', null);
  if exists(select 1 from push_private.notification_jobs where user_id = recipient and report_id = ids[6]) then
    raise exception 'unresolved old job released reserved quota';
  end if;
  if not exists(select 1 from push_private.notification_jobs where user_id = recipient and payload =
    jsonb_build_object('to', token, 'title', 'Stray reported nearby', 'body', 'Dog · market',
      'channelId', 'default', 'sound', 'default', 'priority', 'high', 'data', jsonb_build_object('reportId', ids[1]))) then
    raise exception 'nearby payload changed';
  end if;

  update public.reports set status = 'rescued' where id = ids[1];
  perform push_private.queue_report(ids[1], 'outcome', reporter);
  if exists(select 1 from push_private.notification_jobs where event_kind = 'outcome') then
    raise exception 'self outcome queued';
  end if;
  perform push_private.queue_report(ids[1], 'outcome', recipient);
  if not exists(select 1 from push_private.notification_jobs where event_kind = 'outcome' and user_id = reporter
    and payload->>'title' = 'The dog you reported was rescued'
    and payload->>'body' = 'Someone helped it. Thank you for reporting.'
    and payload->>'sound' = 'default' and payload->>'channelId' = 'default') then
    raise exception 'outcome selection/payload changed';
  end if;

  select id into job_id from push_private.notification_jobs where user_id = recipient and report_id = ids[1];
  update push_private.notification_jobs set state = 'sent', request_id = -1 where id = job_id;
  perform push_private.record_response(job_id, -1, 'ticket', 200, '{"status":"ok","id":"fixture-ticket"}', false);
  perform push_private.record_response(job_id, -1, 'ticket', 200, '{"status":"ok","id":"fixture-ticket"}', false);
  if (select count(*) from public.alert_log where user_id = recipient) <> 1
    or not exists(select 1 from push_private.notification_jobs where id = job_id and state = 'accepted'
      and next_attempt_at = ticket_accepted_at + interval '15 minutes') then
    raise exception 'acceptance not idempotent / receipt not due after 15 minutes';
  end if;

  -- A rejected old token must not clear a rotated registration.
  update public.profiles set push_token = 'ExponentPushToken[fixture-rotated-' || recipient || ']' where id = recipient;
  update push_private.notification_jobs set state = 'receipt_pending', request_id = -2 where id = job_id;
  perform push_private.record_response(job_id, -2, 'receipt', 200,
    '{"status":"error","message":"raw token must never persist","details":{"error":"DeviceNotRegistered"}}', false);
  if (select push_token from public.profiles where id = recipient) is null then
    raise exception 'new token erased';
  end if;
  if (select count(*) from public.alert_log where user_id = recipient) <> 1 then
    raise exception 'post-acceptance failure released quota';
  end if;
  select id into job_id from push_private.notification_jobs where user_id = guest and report_id = ids[1];
  update push_private.notification_jobs set state = 'sent', request_id = -3 where id = job_id;
  perform push_private.record_response(job_id, -3, 'ticket', 200,
    '{"status":"error","details":{"error":"DeviceNotRegistered"}}', false);
  if (select push_token from public.profiles where id = guest) is not null then
    raise exception 'invalid current token not cleared';
  end if;
  update public.profiles set push_token = 'ExponentPushToken[fixture-new-guest-' || guest || ']' where id = guest;
  perform push_private.queue_report(ids[6], 'nearby', null);
  if not exists(select 1 from push_private.notification_jobs where user_id = guest and report_id = ids[6]) then
    raise exception 'terminal pre-acceptance failure kept quota';
  end if;

  -- Registration moved to another account: claim must cancel without returning payload.
  update public.profiles set push_token = token where id = switched;
  if exists(select 1 from push_private.claim_jobs(100) where user_id = recipient) then
    raise exception 'detached registration claimed';
  end if;

  select id into job_id from push_private.notification_jobs where user_id = guest and report_id = ids[2];
  for i in 0..5 loop
    update push_private.notification_jobs set state = 'sent', request_id = -10-i where id = job_id;
    perform push_private.record_response(job_id, -10-i, 'ticket', 503, '{}', false);
    if i < 5 and not exists(select 1 from push_private.notification_jobs where id = job_id
      and state = 'retry' and retries = i+1 and next_attempt_at = now() + push_private.retry_delay(i)) then
      raise exception 'retry bound/delay wrong';
    end if;
  end loop;
  if (select state from push_private.notification_jobs where id = job_id) <> 'failed' then
    raise exception 'sixth retry allowed';
  end if;
  select id into job_id from push_private.notification_jobs where event_kind = 'outcome';
  update push_private.notification_jobs set state = 'sent', request_id = -99 where id = job_id;
  perform push_private.record_response(job_id, -99, 'ticket', 401,
    '{"message":"secret registration or bearer credential"}', false);
  if not (select dispatch_paused from push_private.delivery_control where singleton)
    or not exists(select 1 from push_private.operator_failures f where f.job_id = (select j.id
      from push_private.notification_jobs j where j.event_kind = 'outcome') and f.code = 'authorization') then
    raise exception 'authorization not halted/redacted';
  end if;
end;
$$;

do $$
declare
  device text := replace(gen_random_uuid()::text, '-', '');
  active_device text := replace(gen_random_uuid()::text, '-', '');
  expired_job bigint;
  active_job bigint;
  fixture_user uuid;
begin
  select user_id, id into fixture_user, expired_job from push_private.notification_jobs where state = 'failed' limit 1;
  select id into active_job from push_private.notification_jobs where state in ('sending', 'queued', 'retry') limit 1;
  if expired_job is null or active_job is null then raise exception 'cleanup fixtures missing'; end if;
  update push_private.notification_jobs set finished_at = now() - interval '8 days' where id = expired_job;
  update push_private.notification_jobs set created_at = now() - interval '8 days' where id = active_job;
  insert into public.alert_log(user_id, report_id, sent_at)
    select fixture_user, report_id, now() - interval '49 hours' from push_private.notification_jobs where id = expired_job;
  insert into public.guest_devices(device_hash, next_allowed_at) values
    (device, now() - interval '1 second'), (active_device, now() + interval '72 hours');
  perform push_private.cleanup(500);
  if not exists(select 1 from push_private.notification_jobs where id = expired_job)
    or not exists(select 1 from public.guest_devices where device_hash = device) then
    raise exception 'retention ran without approval gate';
  end if;
  update push_private.delivery_control set retention_enabled = true where singleton;
  perform push_private.cleanup(500);
  if exists(select 1 from push_private.notification_jobs where id = expired_job)
    or not exists(select 1 from push_private.notification_jobs where id = active_job)
    or exists(select 1 from public.alert_log where user_id = fixture_user and sent_at <= now() - interval '48 hours')
    or exists(select 1 from public.guest_devices where device_hash = device)
    or not exists(select 1 from public.guest_devices where device_hash = active_device) then
    raise exception 'retention deleted active data or retained expired data';
  end if;
  insert into public.guest_devices(device_hash, next_allowed_at) values(device, now() - interval '1 second');
  update public.guest_devices set next_allowed_at = now() + interval '72 hours' where device_hash = device;
  perform push_private.cleanup(500);
  if not exists(select 1 from public.guest_devices where device_hash = device) then
    raise exception 'refreshed cooldown erased';
  end if;
end;
$$;

do $$
declare
  reporter uuid := gen_random_uuid();
  fixture_report uuid := gen_random_uuid();
  job_id bigint;
  logged bigint := (select count(*) from public.alert_log);
begin
  insert into auth.users(id, is_anonymous, raw_user_meta_data) values(reporter, false, '{}');
  update public.profiles set push_token = 'ExponentPushToken[fixture-receipt-' || reporter || ']' where id = reporter;
  insert into public.reports(id, reporter_id, location, animal_type, urgency, photos, status)
    values(fixture_report, reporter, 'SRID=4326;POINT(0 -89)', 'cat', 'critical',
      array['https://example.invalid/receipt.jpg'], 'not_found');
  perform push_private.queue_report(fixture_report, 'outcome', null);
  select id into job_id from push_private.notification_jobs where report_id = fixture_report;
  if not exists(select 1 from push_private.notification_jobs where id = job_id
    and payload->>'title' = 'The cat you reported was not found'
    and payload->>'body' = 'A rescuer went to look and could not find it.') then
    raise exception 'not_found payload changed';
  end if;
  update push_private.notification_jobs set state = 'sent', request_id = -201 where id = job_id;
  if push_private.record_response(job_id, -200, 'ticket', 200, '{"status":"ok","id":"wrong-request"}', false) then
    raise exception 'stale response accepted';
  end if;
  perform push_private.record_response(job_id, -201, 'ticket', 200, '{"status":"ok","id":"fixture-receipt"}', false);
  if (select count(*) from public.alert_log) <> logged then raise exception 'outcome consumed nearby quota'; end if;
  update push_private.notification_jobs set state = 'receipt_pending', request_id = -202 where id = job_id;
  perform push_private.record_response(job_id, -202, 'receipt', 503, '{}', false);
  if not exists(select 1 from push_private.notification_jobs where id = job_id and state = 'accepted'
    and retries = 0 and next_attempt_at = now() + interval '2 minutes') then
    raise exception 'receipt network failure resent message';
  end if;
  update push_private.notification_jobs set state = 'receipt_pending', request_id = -203 where id = job_id;
  perform push_private.record_response(job_id, -203, 'receipt', 200, null, false);
  if (select state from push_private.notification_jobs where id = job_id) <> 'accepted' then
    raise exception 'missing receipt not polled';
  end if;
  update push_private.notification_jobs set state = 'receipt_pending', request_id = -204 where id = job_id;
  perform push_private.record_response(job_id, -204, 'receipt', 200, '{"status":"ok"}', false);
  if (select state from push_private.notification_jobs where id = job_id) <> 'delivered' then
    raise exception 'provider handoff not recorded';
  end if;
  -- Simulate an overdue receipt lookup. No accepted-message resend after receipt expiry.
  update push_private.notification_jobs set state = 'receipt_pending', request_id = -205,
    ticket_accepted_at = now() - interval '23 hours' where id = job_id;
  perform push_private.record_response(job_id, -205, 'receipt', 200, null, false);
  if not exists(select 1 from push_private.notification_jobs where id = job_id and state = 'failed')
    or not exists(select 1 from push_private.operator_failures where code = 'receipt_expired') then
    raise exception 'receipt expiry not bounded';
  end if;
end;
$$;

-- Nearest 100, each radius, outcomes outside quota, and guest/admin privacy.
do $$
declare
  reporter uuid := gen_random_uuid();
  fixture_report uuid := gen_random_uuid();
  farthest uuid;
  member uuid;
  admin_user uuid;
  point extensions.geography := 'SRID=4326;POINT(0 -89)';
  chosen_count integer;
begin
  update push_private.delivery_control set dispatch_paused = false where singleton;
  update push_private.notification_jobs set state = 'cancelled', finished_at = now()
    where state not in ('delivered', 'failed', 'cancelled');
  insert into auth.users(id, is_anonymous, raw_user_meta_data) values(reporter, false, '{}');
  for i in 1..102 loop
    member := gen_random_uuid();
    insert into auth.users(id, is_anonymous, raw_user_meta_data) values(member, false, '{}');
    update public.profiles set push_token = 'ExponentPushToken[fixture-nearest-' || member || ']',
      last_location = extensions.st_setsrid(extensions.st_makepoint(0, -89 + i*0.00001), 4326)::extensions.geography
      where id = member;
    if i = 101 then admin_user := member; end if;
    if i = 102 then farthest := member; end if;
  end loop;
  update public.profiles set role = 'admin' where id = admin_user;
  insert into public.reports(id, reporter_id, location, animal_type, urgency, photos)
    values(fixture_report, reporter, point, 'cat', 'critical', array['https://example.invalid/nearest.jpg']);
  chosen_count := push_private.queue_report(fixture_report, 'nearby', null);
  if chosen_count <> 100 or exists(select 1 from push_private.notification_jobs
    where report_id = fixture_report and user_id in(admin_user, farthest)) then
    raise exception 'nearest 100 not preserved';
  end if;
  if exists(select 1 from push_private.notification_jobs where report_id = fixture_report and payload->>'body' <> 'Cat') then
    raise exception 'no-landmark payload changed';
  end if;
  if (select count(*) from push_private.claim_jobs(100)) <> 100 then raise exception 'claim batch bound changed'; end if;
  if (select count(*) from push_private.claim_jobs(100)) <> 0 then
    raise exception 'claimed jobs returned twice';
  end if;
  update public.profiles set push_token = null where id in (select user_id
    from push_private.notification_jobs where report_id = fixture_report);
  perform push_private.queue_report(fixture_report, 'nearby', null);
  if (select count(*) from push_private.notification_jobs where report_id = fixture_report) <> 100 then
    raise exception 'repeat queue reselected farther recipients';
  end if;
  begin
    perform push_private.claim_jobs(101);
    raise exception 'oversized claim allowed';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('pawpin.push_admin', admin_user::text, true);
end;
$$;

set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('pawpin.push_admin'),
    'role', 'authenticated', 'is_anonymous', false)::text, true);
  begin
    perform payload from push_private.notification_jobs;
    raise exception 'admin read private jobs';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims', '{"role":"authenticated","is_anonymous":true}', true);
  begin
    perform push_private.claim_jobs(1);
    raise exception 'guest invoked private claim';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

set local role service_role;
do $$
begin
  if (select count(*) from push_private.notification_jobs) = 0 then
    raise exception 'service cannot read jobs';
  end if;
  perform push_private.classify_response('ticket', 200, '{"status":"ok","id":"service-fixture"}', false);
end;
$$;
reset role;

do $$
declare f record;
begin
  for f in select p.oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'push_private' loop
    if has_function_privilege('anon', f.oid, 'EXECUTE')
      or has_function_privilege('authenticated', f.oid, 'EXECUTE') then
      raise exception 'private function callable by app';
    end if;
  end loop;
end;
$$;

rollback;
