begin;
do $$
begin
  if to_regclass('push_private.delivery_requests') is null then raise exception 'transport missing'; end if;
  if exists(select 1 from net._http_response where id between -30001 and -10000)
    or exists(select 1 from net.http_request_queue where id between -30001 and -10000) then
    raise exception 'transport fixture request IDs collide with existing integrations'; end if;
  if (select mode from push_private.transport_control where singleton) <> 'legacy' then
    raise exception 'transport active by default';
  end if;
  if push_private.dispatch(100) <> 0 then raise exception 'inactive transport dispatched'; end if;
  if pg_get_functiondef('public.alert_nearby()'::regprocedure) not like '%push_private.route_event%'
    or pg_get_functiondef('public.notify_outcome()'::regprocedure) like '%raise warning%'
    or pg_get_functiondef('public.alert_nearby()'::regprocedure) like '%net.http_post(%'
    or pg_get_functiondef('public.notify_outcome()'::regprocedure) like '%net.http_post(%' then
    raise exception 'trigger gating/redaction wrapper missing'; end if;
  if pg_get_functiondef('push_private.record_response(bigint,bigint,text,integer,jsonb,boolean)'::regprocedure)
    like '%insert into push_private.operator_failures%' then
    raise exception 'response diagnostics can still unwind durable state'; end if;
  begin
    perform push_private.activate();
    raise exception 'activation accepted without verified credential';
  exception when check_violation then null;
  end;
  begin perform push_private.assign_operator(null); raise exception 'monitor gate accepted missing operator';
  exception when check_violation then null; end;
  begin perform push_private.approve_retention(null); raise exception 'retention accepted missing approval';
  exception when check_violation then null; end;
end;
$$;

-- Fixtures insert transport metadata and responses only. No credential/proof configuration.
do $$
declare
  fixture_user uuid := gen_random_uuid();
  fixture_report uuid := gen_random_uuid();
  job bigint;
  recipient uuid;
  vector record;
  request bigint := -10000;
begin
  insert into auth.users(id,is_anonymous,raw_user_meta_data) values(fixture_user,false,'{}');
  insert into public.reports(id,reporter_id,location,animal_type,urgency,photos)
    values(fixture_report,fixture_user,'SRID=4326;POINT(0 -89)','dog','critical',array['https://example.invalid/transport.jpg']);
  for vector in select * from (values
    ('{"data":[{"status":"ok","id":"transport-fixture"}]}',200,'accepted'),
    ('{"data":[{"status":"ok","id":"empty-errors-fixture"}],"errors":[]}',200,'accepted'),
    ('{"data":[]}',200,'retry'),
    ('{"data":[{"status":"ok","id":"one"},{"status":"ok","id":"two"}]}',200,'retry'),
    ('{"data":{"status":"ok","id":"wrong-shape"}}',200,'retry'),
    ('{"data":["bad-item"]}',200,'retry'),
    ('not JSON',200,'retry'),
    ('not JSON',400,'failed'),
    ('{"errors":[{"code":"OTHER"},{"code":"UNAUTHORIZED"}]}',200,'paused'),
    ('{"errors":{}}',200,'retry')
  ) as v(body,status,expected) loop
    request:=request-1;
    recipient:=gen_random_uuid();
    insert into auth.users(id,is_anonymous,raw_user_meta_data) values(recipient,false,'{}');
    insert into push_private.notification_jobs(event_kind,report_id,user_id,payload,expected_registration,state,request_id)
      values('nearby',fixture_report,recipient,'{}','fixture-registration','sent',request) returning id into job;
    insert into push_private.delivery_requests(request_id,job_id,stage) values(request,job,'ticket');
    perform push_private.process_response(request,vector.status,vector.body,false);
    if (select state from push_private.notification_jobs where id=job) is distinct from vector.expected then
      raise exception 'transport response mapping expected %',vector.expected;
    end if;
    if push_private.process_response(request,vector.status,vector.body,false) then
      raise exception 'duplicate transport response processed';
    end if;
  end loop;
end;
$$;

do $$
declare
  job bigint;
  recipient uuid := gen_random_uuid();
  report uuid := gen_random_uuid();
begin
  insert into auth.users(id,is_anonymous,raw_user_meta_data) values(recipient,false,'{}');
  insert into public.reports(id,reporter_id,location,animal_type,urgency,photos)
    values(report,recipient,'SRID=4326;POINT(0 -89)','cat','critical',array['https://example.invalid/poll.jpg']);
  insert into push_private.notification_jobs(event_kind,report_id,user_id,payload,expected_registration,state,request_id)
    values('outcome',report,recipient,'{}','fixture-registration','sent',-20001) returning id into job;
  insert into push_private.delivery_requests(request_id,job_id,stage) values(-20001,job,'ticket');
  -- Only a fake response row, never net.http_post or an HTTP queue row.
  insert into net._http_response(id,status_code,content,timed_out)
    values(-20001,200,'{"data":[{"status":"ok","id":"poll-fixture-ticket"}]}',false);
  perform push_private.poll(100);
  if (select state from push_private.notification_jobs where id=job) <> 'accepted' then
    raise exception 'async response poll did not accept mapped ticket'; end if;
  update push_private.notification_jobs set state='receipt_pending',request_id=-20002 where id=job;
  insert into push_private.delivery_requests(request_id,job_id,stage) values(-20002,job,'receipt');
  perform push_private.process_response(-20002,200,'{"data":{"another-ticket":{"status":"ok"}}}',false);
  if (select state from push_private.notification_jobs where id=job) <> 'accepted' then
    raise exception 'unrelated receipt ID falsely delivered job'; end if;
  update push_private.notification_jobs set state='receipt_pending',request_id=-20003 where id=job;
  insert into push_private.delivery_requests(request_id,job_id,stage) values(-20003,job,'receipt');
  perform push_private.process_response(-20003,200,'{"data":{"poll-fixture-ticket":{"status":"ok"}}}',false);
  if not exists(select 1 from push_private.notification_jobs where id=job and state='delivered')
    or not exists(select 1 from push_private.delivery_requests where request_id=-20003 and receipt_success) then
    raise exception 'successful mapped receipt not recorded'; end if;
  update push_private.notification_jobs set state='sent',request_id=-20004 where id=job;
  insert into push_private.delivery_requests(request_id,job_id,stage,created_at)
    values(-20004,job,'ticket',now()-interval '3 minutes');
  perform push_private.poll(100);
  if (select state from push_private.notification_jobs where id=job) <> 'sent' then
    raise exception 'first missing observation retried before postcommit grace'; end if;
  update push_private.delivery_requests set missing_since=now()-interval '3 minutes' where request_id=-20004;
  perform push_private.poll(100);
  if (select state from push_private.notification_jobs where id=job) <> 'retry' then
    raise exception 'vanished unlogged request not recovered'; end if;
  update push_private.notification_jobs set state='sending',request_id=null,updated_at=now()-interval '3 minutes' where id=job;
  perform push_private.poll(100);
  if (select state from push_private.notification_jobs where id=job) <> 'accepted' then
    raise exception 'abandoned accepted claim would blindly resend'; end if;
end;
$$;

do $$
declare
  reporter uuid := gen_random_uuid();
  recipient uuid := gen_random_uuid();
  fixture_report uuid := gen_random_uuid();
  second_report uuid := gen_random_uuid();
begin
  -- Simulate routing only, not an approved activation. No secret or proof rows are configured.
  update push_private.transport_control set mode='queue' where singleton;
  update push_private.delivery_control set dispatch_paused=false where singleton;
  alter table public.reports enable trigger on_report_alert;
  alter table public.reports enable trigger on_report_outcome;
  insert into auth.users(id,is_anonymous,raw_user_meta_data) values(reporter,false,'{}'),(recipient,false,'{}');
  update public.profiles set push_token='ExponentPushToken[transport-' || recipient || ']',
    last_location='SRID=4326;POINT(0 -89)' where id=recipient;
  insert into public.reports(id,reporter_id,location,animal_type,urgency,photos)
    values(fixture_report,reporter,'SRID=4326;POINT(0 -89)','dog','critical',array['https://example.invalid/durable.jpg']);
  if not exists(select 1 from push_private.delivery_events where report_id=fixture_report and expanded_at is not null)
    or not exists(select 1 from push_private.notification_jobs where report_id=fixture_report and user_id=recipient and state='queued') then
    raise exception 'missing credential lost initial durable work'; end if;
  if not (select dispatch_paused from push_private.delivery_control where singleton) then
    raise exception 'missing credential failed to pause sends'; end if;
  if exists(select 1 from push_private.delivery_requests where job_id in (
    select id from push_private.notification_jobs where report_id=fixture_report)) then
    raise exception 'missing credential generated outbound HTTP metadata'; end if;
  -- Reporter closing their own report creates no outcome job.
  update public.profiles set push_token='ExponentPushToken[transport-reporter-'||reporter||']' where id=reporter;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',reporter,'role','authenticated')::text,true);
  update public.reports set status='rescued' where id=fixture_report;
  if exists(select 1 from push_private.notification_jobs where report_id=fixture_report and event_kind='outcome') then
    raise exception 'trigger actor exclusion changed'; end if;
  insert into public.reports(id,reporter_id,location,animal_type,urgency,photos)
    values(second_report,reporter,'SRID=4326;POINT(0 -89)','cat','critical',array['https://example.invalid/outcome.jpg']);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',recipient,'role','authenticated')::text,true);
  perform public.claim_report(second_report);
  perform public.resolve_report(second_report,'not_found');
  if not exists(select 1 from public.reports where id=second_report and status='not_found')
    or not exists(select 1 from push_private.delivery_events where report_id=second_report and event_kind='outcome' and actor=recipient)
    or not exists(select 1 from push_private.notification_jobs where report_id=second_report and event_kind='outcome'
      and user_id=reporter and payload->>'title'='The cat you reported was not found') then
    raise exception 'unavailable sending lost rescue/outcome actor work'; end if;
  -- There is no unauthenticated fallback, even if an operator mistakenly restores legacy mode.
  update push_private.transport_control set mode='legacy',ever_activated=true where singleton;
  begin
    perform push_private.legacy_post('https://exp.host/--/api/v2/push/send','[]','{}');
    raise exception 'unauthenticated fallback accepted after activation';
  exception when check_violation then null;
  end;
  update push_private.transport_control set mode='legacy',ever_activated=false where singleton;
end;
$$;

savepoint transport_failure_fixture;
create or replace function push_private.dispatch(limit_jobs integer default 100,target_report uuid default null,target_event text default null)
returns integer language plpgsql security definer set search_path='' as $$
begin raise exception 'fixture transport unavailable'; end;
$$;
alter table push_private.operator_failures rename to operator_failures_offline;
do $$
declare reporter uuid:=gen_random_uuid(); recipient uuid:=gen_random_uuid(); report uuid:=gen_random_uuid();
begin
  update push_private.transport_control set mode='queue' where singleton;
  insert into auth.users(id,is_anonymous,raw_user_meta_data) values(reporter,false,'{}'),(recipient,false,'{}');
  update public.profiles set push_token='ExponentPushToken[fixture-failure-'||recipient||']',
    last_location='SRID=4326;POINT(0 -89)' where id=recipient;
  insert into public.reports(id,reporter_id,location,animal_type,urgency,photos)
    values(report,reporter,'SRID=4326;POINT(0 -89)','dog','critical',array['https://example.invalid/failure.jpg']);
  if not exists(select 1 from public.reports where id=report)
    or not exists(select 1 from push_private.delivery_events where report_id=report and expanded_at is not null)
    or not exists(select 1 from push_private.notification_jobs where report_id=report and user_id=recipient and state='queued') then
    raise exception 'transport subtransaction failure lost report or durable jobs'; end if;
end;
$$;
rollback to savepoint transport_failure_fixture;

select set_config('pawpin.push_security_ready',push_private.security_ready()::text,true);
set local role authenticated;
do $$
begin
  begin perform headers from net.http_request_queue limit 0;
    if current_setting('pawpin.push_security_ready')::boolean then raise exception 'app read bearer headers despite ready gate'; end if;
  exception when insufficient_privilege then null; end;
  begin perform content from net._http_response limit 0;
    if current_setting('pawpin.push_security_ready')::boolean then raise exception 'app read response registrations despite ready gate'; end if;
  exception when insufficient_privilege then null; end;
  begin perform decrypted_secret from vault.decrypted_secrets limit 0;
    if current_setting('pawpin.push_security_ready')::boolean then raise exception 'app read Vault despite ready gate'; end if;
  exception when insufficient_privilege then null; end;
end;
$$;
reset role;
do $$
begin
  if not push_private.security_ready() then
    begin perform push_private.credential(false); raise exception 'unsafe permissions allowed credential lookup';
    exception when check_violation then
      if sqlerrm <> 'push_permission_hardening_required' then raise; end if;
    end;
    raise notice 'Permission gate correctly blocks managed PUBLIC grants; owner hardening remains required';
  end if;
  if has_function_privilege('service_role','push_private.activate()','EXECUTE')
    or has_function_privilege('service_role','push_private.approve(uuid,text)','EXECUTE')
    or has_function_privilege('service_role','push_private.send_job(bigint,boolean)','EXECUTE')
    or has_table_privilege('service_role','push_private.transport_control','UPDATE') then
    raise exception 'service API can bypass operator proof gate'; end if;
end;
$$;
rollback;
