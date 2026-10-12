-- Inactive installation. No Vault secret, proof, HTTP request, or cron schedule is created.
create table push_private.transport_control (
  singleton boolean primary key default true check (singleton),
  mode text not null default 'legacy' check (mode in ('legacy', 'queue', 'direct', 'halted')),
  ever_activated boolean not null default false,
  secret_id uuid,
  secret_version timestamptz,
  project_id uuid,
  approval_ref text,
  operator_monitor_ref text,
  approved_at timestamptz,
  retention_approval_ref text
);
insert into push_private.transport_control(singleton) values(true);

create table push_private.delivery_events (
  report_id uuid not null,
  event_kind text not null check (event_kind in ('nearby', 'outcome')),
  actor uuid,
  expanded_at timestamptz,
  created_at timestamptz not null default now(),
  primary key(report_id, event_kind)
);
alter table push_private.notification_jobs add column is_probe boolean not null default false;
-- Report transactions already hold their reporter's profile FOR UPDATE. Recipient FK checks
-- would wait for another reporter while holding the queue lock. Orphans are cancelled by workers.
alter table push_private.notification_jobs drop constraint notification_jobs_user_id_fkey;
alter table push_private.notification_jobs drop constraint notification_jobs_report_id_fkey;

create table push_private.delivery_requests (
  request_id bigint primary key,
  job_id bigint not null references push_private.notification_jobs on delete cascade,
  stage text not null check (stage in ('ticket', 'receipt')),
  secret_id uuid,
  secret_version timestamptz,
  project_id uuid,
  is_probe boolean not null default false,
  created_at timestamptz not null default clock_timestamp(),
  transaction_id bigint not null default txid_current(),
  receipt_success boolean not null default false,
  missing_since timestamptz,
  processed_at timestamptz
);
create index delivery_requests_pending on push_private.delivery_requests(created_at) where processed_at is null;
alter table push_private.operator_failures drop constraint operator_failures_code_check;
alter table push_private.operator_failures add constraint operator_failures_code_check check(code in
  ('authorization', 'credentials', 'invalid_registration', 'permanent_response', 'retry_exhausted',
   'receipt_expired', 'queue_failure', 'transport_failure', 'response_failure', 'abandoned_claim'));

-- Keep original bodies privately so installation and authenticated rollback use exact baseline
-- recipients/content/actor semantics, not a rewritten approximation.
create table push_private.legacy_definitions (name text primary key, definition text not null);
insert into push_private.legacy_definitions values
  ('alert_nearby', pg_get_functiondef('public.alert_nearby()'::regprocedure)),
  ('notify_outcome', pg_get_functiondef('public.notify_outcome()'::regprocedure));

revoke all on net.http_request_queue, net._http_response from public, anon, authenticated;
revoke usage on schema net from public,anon,authenticated;
grant usage on schema net to postgres,service_role;
revoke all on all sequences in schema net from public, anon, authenticated;
revoke all on schema vault from public, anon, authenticated;
revoke all on vault.secrets, vault.decrypted_secrets from public, anon, authenticated;
-- Preserve server integration owners explicitly before removing PUBLIC-derived access.
grant select,insert,update,delete on net.http_request_queue to postgres;
grant select on net._http_response to postgres;
grant usage,select on all sequences in schema net to postgres,service_role;
grant usage on schema vault to postgres;
grant select on vault.decrypted_secrets to postgres;
-- Table REVOKE does not remove independently granted column privileges.
do $$
declare target text; columns text;
begin
  foreach target in array array['net.http_request_queue','net._http_response','vault.secrets','vault.decrypted_secrets'] loop
    select string_agg(quote_ident(attname),',') into columns from pg_attribute
      where attrelid=target::regclass and attnum>0 and not attisdropped;
    execute 'revoke all (' || columns || ') on table ' || target || ' from public,anon,authenticated';
  end loop;
end;
$$;

-- Managed extension owners may retain grants that this migration role cannot revoke.
-- Refuse even a privileged probe until the real effective app-role permissions are safe.
create function push_private.security_ready()
returns boolean language plpgsql security definer set search_path = '' as $$
declare role_name text; target text; column_name text;
begin
  foreach role_name in array array['anon','authenticated'] loop
    foreach target in array array['net.http_request_queue','net._http_response','vault.secrets','vault.decrypted_secrets'] loop
      if has_schema_privilege(role_name,split_part(target,'.',1),'USAGE') then
        if has_table_privilege(role_name,target,'SELECT') then return false; end if;
        for column_name in select attname from pg_attribute where attrelid=target::regclass
          and attnum>0 and not attisdropped loop
          if has_column_privilege(role_name,target,column_name,'SELECT') then return false; end if;
        end loop;
      end if;
    end loop;
  end loop;
  return true;
end;
$$;

-- Diagnostics must not unwind durable work when their own store is unavailable.
create function push_private.note_failure(failure text,target_job bigint default null)
returns void language plpgsql security definer set search_path='' as $$
begin
  insert into push_private.operator_failures(job_id,code) values(target_job,failure);
exception when others then null;
end;
$$;

create function push_private.credential(require_approval boolean default true)
returns text language plpgsql security definer set search_path = '' as $$
declare c push_private.transport_control%rowtype; secret text; version timestamptz;
begin
  if not push_private.security_ready() then
    raise exception using errcode='23514',message='push_permission_hardening_required'; end if;
  select * into c from push_private.transport_control where singleton;
  if c.secret_id is null or c.project_id is null or (require_approval and c.approved_at is null) then
    raise exception using errcode = '23514', message = 'push_credential_unverified';
  end if;
  select decrypted_secret, updated_at into secret, version from vault.decrypted_secrets where id = c.secret_id;
  if secret is null or btrim(secret) = '' or secret ~ '[\r\n]' or version is distinct from c.secret_version then
    raise exception using errcode = '23514', message = 'push_credential_unverified';
  end if;
  return secret;
end;
$$;

-- Operator-only configuration; a UUID is a secret reference, not a bearer value.
create function push_private.configure(secret_reference uuid, expected_project uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare version timestamptz;
begin
  if not push_private.security_ready() then
    raise exception using errcode='23514',message='push_permission_hardening_required'; end if;
  if expected_project is null then raise exception using errcode = '23514', message = 'project_required'; end if;
  if (select mode from push_private.transport_control where singleton) not in ('legacy','halted')
    or exists(select 1 from push_private.delivery_requests where processed_at is null) then
    raise exception using errcode = '23514', message = 'quiesce_before_credential_change';
  end if;
  select updated_at into version from vault.decrypted_secrets
    where id = secret_reference and decrypted_secret is not null and btrim(decrypted_secret) <> '';
  if not found then raise exception using errcode = '23514', message = 'vault_secret_required'; end if;
  update push_private.transport_control set secret_id = secret_reference, secret_version = version,
    project_id = expected_project, approval_ref = null, approved_at = null where singleton;
end;
$$;

-- One token per HTTP send: opaque profile tokens do not carry trustworthy project metadata.
-- This deliberately never batches unknown projects together. Receipt lookups are also individual.
create function push_private.enqueue_http(stage text, body jsonb, probe boolean default false)
returns bigint language plpgsql security definer set search_path = '' as $$
declare token text; endpoint text;
begin
  token := push_private.credential(not probe);
  if stage = 'ticket' and jsonb_typeof(body) = 'array' and jsonb_array_length(body) = 1
    and jsonb_typeof(body->0->'to') = 'string' then
    endpoint := 'https://exp.host/--/api/v2/push/send';
  elsif stage = 'receipt' and jsonb_typeof(body->'ids') = 'array' and jsonb_array_length(body->'ids') = 1
    and jsonb_typeof(body->'ids'->0) = 'string' then
    endpoint := 'https://exp.host/--/api/v2/push/getReceipts';
  else raise exception using errcode = '23514', message = 'invalid_project_safe_request'; end if;
  return net.http_post(url := endpoint, body := body,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || token),
    timeout_milliseconds := 10000);
end;
$$;

-- These primitives may never wait on a profile/report while holding the queue lock.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('push_private.claim_jobs(integer)'::regprocedure);
  definition := replace(definition, 'where id = job.user_id for update;', 'where id = job.user_id for update nowait;');
  definition := replace(definition,
    'insert into push_private.operator_failures(job_id, code) values(job.id, ''retry_exhausted'');',
    'perform push_private.note_failure(''retry_exhausted'',job.id);');
  execute definition;
  definition := pg_get_functiondef('push_private.record_response(bigint,bigint,text,integer,jsonb,boolean)'::regprocedure);
  definition := replace(definition, 'perform pg_catalog.pg_advisory_xact_lock(7280028);',
    'perform 1 from public.profiles where id = (select user_id from push_private.notification_jobs where id = target_job) for update nowait;
     perform 1 from public.reports where id = (select report_id from push_private.notification_jobs where id = target_job) for key share nowait;
     perform pg_catalog.pg_advisory_xact_lock(7280028);');
  definition := replace(definition, 'where id = target_job for update;', 'where id = target_job for update nowait;');
  definition := replace(definition,
    'insert into push_private.operator_failures(job_id, code)
    values(job.id, coalesce(failure_code, ''permanent_response''));',
    'perform push_private.note_failure(coalesce(failure_code, ''permanent_response''),job.id);');
  execute definition;
end;
$$;

create function push_private.send_job(target_job bigint, probe boolean default false)
returns boolean language plpgsql security definer set search_path = '' as $$
declare j push_private.notification_jobs%rowtype; c push_private.transport_control%rowtype;
  registration text; request bigint; stage text; body jsonb;
begin
  select * into c from push_private.transport_control where singleton;
  if not probe and (c.mode not in ('queue','halted') or (select dispatch_paused from push_private.delivery_control where singleton)) then return false; end if;
  perform push_private.credential(not probe);
  if not pg_try_advisory_xact_lock(7280028) then return false; end if;
  select * into j from push_private.notification_jobs where id = target_job for update skip locked;
  if not found or j.state not in ('queued','retry','accepted') or j.next_attempt_at > now() then return false; end if;
  if not probe and c.mode='halted' and j.state <> 'accepted' then return false; end if;
  -- NOWAIT, including the report lock needed by accepted alert_log FK insertion later.
  select push_token into registration from public.profiles where id = j.user_id for update nowait;
  perform 1 from public.reports where id = j.report_id for key share nowait;
  if not found or registration is distinct from j.expected_registration then
    update push_private.notification_jobs set state = 'cancelled', finished_at = now(), updated_at = now() where id = j.id;
    return false;
  end if;
  if j.state = 'accepted' then
    if j.ticket_accepted_at <= now() - interval '23 hours' then
      update push_private.notification_jobs set state = 'failed', finished_at = now(), updated_at = now() where id = j.id;
      perform push_private.note_failure('receipt_expired',j.id);
      return false;
    end if;
    stage := 'receipt'; body := jsonb_build_object('ids',jsonb_build_array(j.ticket_id));
  else
    if j.attempts >= 6 then
      update push_private.notification_jobs set state = 'failed', finished_at = now(), updated_at = now() where id = j.id;
      perform push_private.note_failure('retry_exhausted',j.id); return false;
    end if;
    stage := 'ticket'; body := jsonb_build_array(j.payload);
  end if;
  -- Project rate ceiling: at most 100 transport requests in any second, below Expo's 600 messages/s.
  if (select count(*) from push_private.delivery_requests where created_at > clock_timestamp() - interval '1 second') >= 100
    or (select count(*) from push_private.delivery_requests where processed_at is null) >= 100
    or (select count(*) from push_private.delivery_requests where transaction_id=txid_current()) >= 100
    or (select count(*) from net.http_request_queue where url in
      ('https://exp.host/--/api/v2/push/send','https://exp.host/--/api/v2/push/getReceipts')) >= 100 then return false; end if;
  update push_private.notification_jobs set state = case when stage = 'ticket' then 'sending' else 'receipt_pending' end,
    attempts = attempts + case when stage = 'ticket' then 1 else 0 end, updated_at = now() where id = j.id;
  request := push_private.enqueue_http(stage, body, probe);
  insert into push_private.delivery_requests(request_id,job_id,stage,secret_id,secret_version,project_id,is_probe)
    values(request,j.id,stage,c.secret_id,c.secret_version,c.project_id,probe or j.is_probe);
  update push_private.notification_jobs set state = case when stage = 'ticket' then 'sent' else 'receipt_pending' end,
    request_id = request, is_probe = probe or is_probe, updated_at = now() where id = j.id;
  return true;
end;
$$;

create function push_private.dispatch(limit_jobs integer default 100, target_report uuid default null, target_event text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare j record; dispatched integer := 0;
begin
  if limit_jobs not between 1 and 100 or limit_jobs is null then raise exception using errcode='22023',message='invalid_batch_size'; end if;
  if (select mode from push_private.transport_control where singleton) not in ('queue','halted')
    or (select dispatch_paused from push_private.delivery_control where singleton) then return 0; end if;
  begin perform push_private.credential();
  exception when check_violation then
    update push_private.delivery_control set dispatch_paused = true where singleton;
    perform push_private.note_failure('credentials'); return 0;
  when insufficient_privilege then
    update push_private.delivery_control set dispatch_paused = true where singleton;
    perform push_private.note_failure('credentials'); return 0;
  end;
  for j in select id from push_private.notification_jobs where state in ('queued','retry','accepted')
    and ((select mode from push_private.transport_control where singleton)='queue' or state='accepted')
    and next_attempt_at <= now() and (target_report is null or report_id = target_report)
    and (target_event is null or event_kind=target_event)
    order by next_attempt_at,id limit limit_jobs loop
    begin
      if push_private.send_job(j.id) then dispatched := dispatched + 1; end if;
    exception when lock_not_available then null;
    when others then
      perform push_private.note_failure('transport_failure',j.id);
      -- HTTP insertion and claim roll back together; the durable queued job remains.
      update push_private.notification_jobs set
        state=case when state='accepted' then 'accepted' when retries >= 5 then 'failed' else 'retry' end,
        next_attempt_at=now()+case when state='accepted' then interval '2 minutes'
          else coalesce(push_private.retry_delay(retries),interval '2 hours') end,
        attempts=case when state='accepted' then attempts else least(attempts+1,6) end,
        retries=case when state='accepted' then retries else least(retries+1,5) end,
        finished_at=case when state <> 'accepted' and retries >= 5 then now() else finished_at end,
        updated_at=now() where id=j.id;
    end;
  end loop;
  return dispatched;
end;
$$;

create function push_private.expand_events(limit_events integer default 100,target_report uuid default null,target_event text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare e record; expanded integer := 0;
begin
  if limit_events not between 1 and 100 or limit_events is null then raise exception using errcode='22023',message='invalid_event_limit'; end if;
  if target_report is not null then perform pg_advisory_xact_lock(7280028);
  elsif not pg_try_advisory_xact_lock(7280028) then return 0; end if;
  for e in select * from push_private.delivery_events where expanded_at is null
    and (target_report is null or report_id=target_report) and (target_event is null or event_kind=target_event)
    order by created_at,report_id limit limit_events for update skip locked loop
    begin
      perform push_private.queue_report(e.report_id,e.event_kind,e.actor);
      update push_private.delivery_events set expanded_at=now() where report_id=e.report_id and event_kind=e.event_kind;
      expanded := expanded + 1;
    exception when others then perform push_private.note_failure('queue_failure');
    end;
  end loop;
  return expanded;
end;
$$;

create function push_private.route_event(report uuid, event text, actor uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  insert into push_private.delivery_events(report_id,event_kind,actor) values(report,event,actor)
    on conflict(report_id,event_kind) do nothing;
  begin perform push_private.expand_events(1,report,event);
  exception when others then perform push_private.note_failure('queue_failure'); end;
  -- Clear ready responses opportunistically so ordinary reports do not wait for the next cron tick.
  begin perform push_private.poll(100);
  exception when others then perform push_private.note_failure('response_failure'); end;
  -- Separate subtransaction: a transport failure must not unwind event/job insertion.
  begin perform push_private.dispatch(100,report,event);
  exception when others then perform push_private.note_failure('transport_failure'); end;
end;
$$;

-- Exact response mapping: single-token request has exactly one ticket, receipts keyed by stored ID.
create function push_private.process_response(request bigint, status integer, content text, network_failure boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare r push_private.delivery_requests%rowtype; j push_private.notification_jobs%rowtype;
  envelope jsonb; item jsonb; malformed boolean := false; recorded boolean; request_error boolean := false;
begin
  select * into r from push_private.delivery_requests where request_id=request for update skip locked;
  if not found or r.processed_at is not null then return false; end if;
  select * into j from push_private.notification_jobs where id=r.job_id for update nowait;
  if not exists(select 1 from public.profiles where id=j.user_id)
    or not exists(select 1 from public.reports where id=j.report_id) then
    update push_private.notification_jobs set state='cancelled',finished_at=now(),updated_at=now() where id=j.id;
    update push_private.delivery_requests set processed_at=now() where request_id=r.request_id;
    return true;
  end if;
  begin
    if octet_length(content) > 1048576 then malformed:=true; else envelope := content::jsonb; end if;
  exception when others then malformed := true; end;
  if jsonb_typeof(envelope) is distinct from 'object' then malformed := true; end if;
  if not malformed and envelope ? 'errors' then
    if jsonb_typeof(envelope->'errors') is distinct from 'array' then malformed:=true;
    elsif jsonb_array_length(envelope->'errors') > 0 then
      request_error:=true;
      -- Any authorization/credential error must halt, not just errors[0].
      select jsonb_build_object('errors',jsonb_build_array(value)) into item
      from jsonb_array_elements(envelope->'errors')
      order by case when value->>'code' in ('UNAUTHORIZED','InvalidCredentials','MismatchSenderId') then 0 else 1 end limit 1;
    end if;
  end if;
  if not malformed and not request_error and r.stage='ticket' then
    if jsonb_typeof(envelope->'data') is distinct from 'array' then malformed:=true;
    elsif jsonb_array_length(envelope->'data') <> 1 then malformed:=true;
    else item := envelope->'data'->0;
      if jsonb_typeof(item) is distinct from 'object' then malformed:=true; end if;
    end if;
  elsif not malformed and not request_error then
    if jsonb_typeof(envelope->'data') is distinct from 'object' then malformed:=true;
    else item := envelope->'data'->j.ticket_id;
      if item is not null and jsonb_typeof(item) is distinct from 'object' then malformed:=true; end if;
    end if;
  end if;
  if malformed then item:=null; end if;
  if r.stage='ticket' and item->>'status'='ok' and exists(select 1 from push_private.notification_jobs
    where ticket_id=item->>'id' and id<>r.job_id) then item:=null; malformed:=true; end if;
  recorded:=push_private.record_response(r.job_id,r.request_id,r.stage,status,item,
    network_failure or (malformed and (status=200 or status is null)));
  update push_private.delivery_requests set processed_at=now(), receipt_success=(recorded and r.stage='receipt'
    and (select state from push_private.notification_jobs where id=r.job_id)='delivered') where request_id=r.request_id;
  return true;
end;
$$;

create function push_private.poll(limit_requests integer default 100)
returns integer language plpgsql security definer set search_path = '' as $$
declare r record; response record; processed integer := 0;
begin
  if limit_requests not between 1 and 100 or limit_requests is null then raise exception using errcode='22023',message='invalid_poll_limit'; end if;
  for r in select * from push_private.delivery_requests where processed_at is null
    order by created_at,request_id limit limit_requests loop
    begin
      select status_code,content,timed_out,error_msg into response from net._http_response where id=r.request_id;
      if found then
        if push_private.process_response(r.request_id,response.status_code,response.content,
          coalesce(response.timed_out,false) or response.error_msg is not null) then processed:=processed+1; end if;
      elsif r.created_at <= now() - interval '2 minutes'
        and not exists(select 1 from net.http_request_queue where id=r.request_id) then
        -- Queue/response tables are unlogged. A vanished request is uncertain, not proof of failure.
        -- Measure grace after first observing disappearance, not before a long transaction commits.
        if r.missing_since is null then
          update push_private.delivery_requests set missing_since=clock_timestamp() where request_id=r.request_id;
        elsif r.missing_since <= clock_timestamp()-interval '2 minutes' then
          if push_private.process_response(r.request_id,null,null,true) then processed:=processed+1; end if;
        end if;
      end if;
    exception when lock_not_available then null;
    when others then perform push_private.note_failure('response_failure',r.job_id); end;
  end loop;
  -- Atomic enqueue cannot normally leave 'sending'; only recover an abandoned claim with no request.
  with abandoned as (select id from push_private.notification_jobs
    where state='sending' and request_id is null and updated_at <= now()-interval '2 minutes'
    order by updated_at,id limit limit_requests for update skip locked)
  update push_private.notification_jobs j set state=case when accepted_at is null then 'retry' else 'accepted' end,
    next_attempt_at=now()+interval '30 seconds', updated_at=now()
    from abandoned a where j.id=a.id;
  return processed;
end;
$$;

create function push_private.tick()
returns void language plpgsql security definer set search_path = '' as $$
begin
  begin perform push_private.poll(100);
  exception when others then perform push_private.note_failure('response_failure'); end;
  if (select mode from push_private.transport_control where singleton) = 'queue' then
    begin perform push_private.expand_events(100);
    exception when others then perform push_private.note_failure('queue_failure'); end;
  end if;
  begin perform push_private.dispatch(100);
  exception when others then
    update push_private.delivery_control set dispatch_paused=true where singleton;
    perform push_private.note_failure('transport_failure'); end;
  if (select retention_enabled from push_private.delivery_control where singleton) then
    perform push_private.cleanup(500);
    delete from push_private.delivery_events where (report_id,event_kind) in (
      select e.report_id,e.event_kind from push_private.delivery_events e
      where e.expanded_at <= now()-interval '7 days' and not exists(select 1 from push_private.notification_jobs j
        where j.report_id=e.report_id and j.event_kind=e.event_kind)
      order by e.expanded_at limit 100 for update skip locked);
    delete from push_private.operator_failures where id in (
      select id from push_private.operator_failures where job_id is null and created_at<=now()-interval '7 days'
      order by created_at,id limit 100 for update skip locked);
  end if;
end;
$$;

-- Privileged real-phone probes require an existing deliberately prepared job and configured Vault
-- credential. No fixture proof or fake token is provisioned by this migration.
create function push_private.probe_job(job bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if (select mode from push_private.transport_control where singleton) not in ('legacy','halted') then
    raise exception using errcode='23514',message='probe_before_cutover'; end if;
  return push_private.send_job(job,true);
end;
$$;

create function push_private.approve(expected_project uuid, operator_reference text)
returns void language plpgsql security definer set search_path = '' as $$
declare c push_private.transport_control%rowtype; proven integer;
begin
  select * into c from push_private.transport_control where singleton for update;
  perform push_private.credential(false);
  if expected_project is distinct from c.project_id or operator_reference is null or length(btrim(operator_reference)) not between 8 and 200 then
    raise exception using errcode='23514',message='operator_project_approval_required'; end if;
  select count(distinct j.event_kind) into proven from push_private.notification_jobs j
    join push_private.delivery_requests r on r.job_id=j.id
    where j.is_probe and j.state='delivered' and r.stage='receipt' and r.is_probe and r.receipt_success
      and r.secret_id=c.secret_id and r.secret_version=c.secret_version and r.project_id=c.project_id;
  if proven <> 2 then raise exception using errcode='23514',message='nearby_and_outcome_receipt_proof_required'; end if;
  update push_private.transport_control set approval_ref=operator_reference,approved_at=now() where singleton;
end;
$$;

create function push_private.activate()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform push_private.credential();
  if (select operator_monitor_ref from push_private.transport_control where singleton) is null
    or to_regclass('push_private.operator_failures') is null then
    raise exception using errcode='23514',message='operator_monitoring_required'; end if;
  lock table public.reports in share row exclusive mode;
  if exists(select 1 from push_private.delivery_requests where processed_at is null)
    or exists(select 1 from net.http_request_queue where url in
      ('https://exp.host/--/api/v2/push/send','https://exp.host/--/api/v2/push/getReceipts')) then
    raise exception using errcode='23514',message='legacy_send_queue_not_quiescent'; end if;
  if not (select ever_activated from push_private.transport_control where singleton)
    and exists(select 1 from push_private.notification_jobs where not is_probe and state not in ('delivered','failed','cancelled')) then
    raise exception using errcode='23514',message='pre_cutover_jobs_must_be_resolved'; end if;
  update push_private.transport_control set mode='queue',ever_activated=true where singleton;
  update push_private.delivery_control set dispatch_paused=false where singleton;
  -- Owner-triggered resume after fresh proof. Accepted tickets return to lookup, never blind resend.
  update push_private.notification_jobs set state=case when accepted_at is not null then 'accepted'
    when attempts >= 6 then 'failed' else 'retry' end,
    next_attempt_at=now(),request_id=null,updated_at=now(),
    finished_at=case when accepted_at is null and attempts >= 6 then now() else null end where state='paused';
  perform cron.schedule('pawpin-push-delivery-minute','* * * * *','select push_private.tick()');
end;
$$;

create function push_private.assign_operator(monitor_reference text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if monitor_reference is null or length(btrim(monitor_reference)) not between 8 and 200 then
    raise exception using errcode='23514',message='operator_monitoring_required'; end if;
  update push_private.transport_control set operator_monitor_ref=monitor_reference where singleton;
end;
$$;

-- Stop new sends while allowing already accepted tickets to finish receipt lookup.
create function push_private.quiesce()
returns void language plpgsql security definer set search_path = '' as $$
begin
  lock table public.reports in share row exclusive mode;
  if not (select ever_activated from push_private.transport_control where singleton) then
    raise exception using errcode='23514',message='transport_not_activated'; end if;
  update push_private.transport_control set mode='halted' where singleton;
end;
$$;

create function push_private.approve_retention(operator_reference text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if operator_reference is null or length(btrim(operator_reference)) not between 8 and 200
    or not (select ever_activated from push_private.transport_control where singleton) then
    raise exception using errcode='23514',message='retention_operator_approval_required'; end if;
  update push_private.transport_control set retention_approval_ref=operator_reference where singleton;
  update push_private.delivery_control set retention_enabled=true where singleton;
end;
$$;

-- Explicit operator cancellation is separate from rollback; never discard in-flight HTTP.
create function push_private.cancel_unstarted(operator_reference text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if operator_reference is null or length(btrim(operator_reference)) not between 8 and 200
    or (select mode from push_private.transport_control where singleton) <> 'halted' then
    raise exception using errcode='23514',message='quiescent_cancellation_approval_required'; end if;
  lock table public.reports in share row exclusive mode;
  if exists(select 1 from push_private.delivery_requests where processed_at is null) then
    raise exception using errcode='23514',message='inflight_requests_remain'; end if;
  update push_private.notification_jobs set state='cancelled',finished_at=now(),updated_at=now()
    where state in ('queued','retry','paused');
  update push_private.delivery_events set expanded_at=now() where expanded_at is null;
end;
$$;

create function push_private.rollback_authenticated()
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform push_private.credential();
  lock table public.reports in share row exclusive mode;
  update push_private.transport_control set mode='halted' where singleton;
  update push_private.delivery_control set dispatch_paused=true where singleton;
  if exists(select 1 from push_private.delivery_requests where processed_at is null)
    or exists(select 1 from push_private.notification_jobs where not is_probe and state not in ('delivered','failed','cancelled'))
    or exists(select 1 from push_private.delivery_events where expanded_at is null) then
    raise exception using errcode='23514',message='resolve_queued_work_before_direct_rollback'; end if;
  perform cron.unschedule(jobname) from cron.job where jobname='pawpin-push-delivery-minute';
  update push_private.transport_control set mode='direct' where singleton;
  update push_private.delivery_control set dispatch_paused=false where singleton;
end;
$$;

create function push_private.legacy_post(url text, body jsonb, headers jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare mode text; ever boolean; message jsonb; result bigint; token text;
begin
  select c.mode,c.ever_activated into mode,ever from push_private.transport_control c where singleton;
  if url <> 'https://exp.host/--/api/v2/push/send' then raise exception using errcode='23514',message='invalid_push_endpoint'; end if;
  if mode='legacy' and not ever then
    return net.http_post(url:=url,body:=body,headers:=headers);
  elsif mode='direct' then
    if (select dispatch_paused from push_private.delivery_control where singleton) then
      raise exception using errcode='23514',message='push_dispatch_paused'; end if;
    token:=push_private.credential();
    if jsonb_typeof(body) is distinct from 'array' or jsonb_array_length(body) > 100 then
      raise exception using errcode='23514',message='invalid_legacy_batch'; end if;
    for message in select value from jsonb_array_elements(body) loop
      result:=net.http_post(url:=url,body:=jsonb_build_array(message),
        headers:=headers || jsonb_build_object('Authorization','Bearer ' || token),timeout_milliseconds:=10000);
    end loop;
    return result;
  end if;
  raise exception using errcode='23514',message='legacy_transport_disabled';
end;
$$;

-- Insert the gated branch into the stored baseline, retaining auth.uid() and trigger context.
do $$
declare original record; definition text; branch text;
begin
  for original in select * from push_private.legacy_definitions loop
    branch := case when original.name='alert_nearby' then
      'perform push_private.route_event(new.id,''nearby'',null);'
      else 'perform push_private.route_event(new.id,''outcome'',(select auth.uid()));' end;
    definition := replace(original.definition,'net.http_post(', 'push_private.legacy_post(');
    definition := regexp_replace(definition, E'\nbegin\n', E'\nbegin\n'
      || '  if (select mode from push_private.transport_control where singleton) in (''queue'',''halted'') then
    begin ' || branch || '
    exception when others then
      perform push_private.note_failure(''queue_failure'');
    end;
    return new;
  end if;
');
    if strpos(definition,'push_private.route_event')=0 then
      raise exception using errcode='23514',message='unrecognized_legacy_trigger_body'; end if;
    -- Never emit SQLERRM: legacy error text can contain rejected payloads/credentials.
    definition := regexp_replace(definition, 'raise warning ''[^'']+failed: %'', sqlerrm;',
      'perform push_private.note_failure(''transport_failure'');','g');
    execute definition;
  end loop;
end;
$$;

alter table push_private.transport_control enable row level security;
alter table push_private.delivery_events enable row level security;
alter table push_private.delivery_requests enable row level security;
alter table push_private.legacy_definitions enable row level security;
revoke all on all tables in schema push_private from public,anon,authenticated;
revoke all on all sequences in schema push_private from public,anon,authenticated;
revoke all on all functions in schema push_private from public,anon,authenticated;
grant select,insert,update,delete on all tables in schema push_private to service_role;
grant usage,select on all sequences in schema push_private to service_role;
grant execute on all functions in schema push_private to service_role;
-- Configuration/proof/cutover belong to the database operator, not a service API or app.
revoke all on function push_private.configure(uuid,uuid),push_private.probe_job(bigint),
  push_private.approve(uuid,text),push_private.activate(),push_private.rollback_authenticated(),
  push_private.quiesce(),push_private.cancel_unstarted(text),
  push_private.assign_operator(text),
  push_private.approve_retention(text),
  push_private.credential(boolean),push_private.enqueue_http(text,jsonb,boolean),
  push_private.send_job(bigint,boolean),
  push_private.legacy_post(text,jsonb,jsonb) from service_role;
revoke insert,update,delete on push_private.transport_control,push_private.delivery_control,
  push_private.delivery_requests,push_private.legacy_definitions from service_role;
revoke execute on function push_private.process_response(bigint,integer,text,boolean) from service_role;
