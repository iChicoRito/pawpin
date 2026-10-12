-- Preparation only: no HTTP, cron, Vault secrets, activation, or public trigger changes.
-- Existing 0015/0017 direct sends remain authoritative until a separate reviewed cutover.
create schema push_private;
revoke all on schema push_private from public, anon, authenticated;
grant usage on schema push_private to service_role;
alter default privileges in schema push_private revoke execute on functions from public;

create table push_private.delivery_control (
  singleton boolean primary key default true check (singleton),
  dispatch_paused boolean not null default false,
  retention_enabled boolean not null default false
);
insert into push_private.delivery_control(singleton) values(true);

create table push_private.notification_jobs (
  id bigint generated always as identity primary key,
  event_kind text not null check (event_kind in ('nearby', 'outcome')),
  report_id uuid not null references public.reports on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  expected_registration text not null,
  state text not null default 'queued' check (state in
    ('queued', 'sending', 'sent', 'retry', 'accepted', 'receipt_pending', 'delivered', 'failed', 'cancelled', 'paused')),
  request_id bigint,
  ticket_id text,
  attempts integer not null default 0 check (attempts between 0 and 6),
  retries integer not null default 0 check (retries between 0 and 5),
  next_attempt_at timestamptz not null default now(),
  accepted_at timestamptz,
  ticket_accepted_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (report_id, user_id, event_kind)
);
create index notification_jobs_due on push_private.notification_jobs(state, next_attempt_at, id);
create index notification_jobs_quota on push_private.notification_jobs(user_id, created_at)
  where event_kind = 'nearby' and accepted_at is null;

-- Closed vocabulary only. Never store Expo message/details, HTTP body, or headers here.
create table push_private.operator_failures (
  id bigint generated always as identity primary key,
  job_id bigint references push_private.notification_jobs on delete cascade,
  code text not null check (code in ('authorization', 'credentials', 'invalid_registration',
    'permanent_response', 'retry_exhausted', 'receipt_expired')),
  created_at timestamptz not null default now()
);

create function push_private.retry_delay(retry_number integer)
returns interval language sql immutable set search_path = '' as $$
  select (array[interval '30 seconds', interval '2 minutes', interval '10 minutes',
    interval '30 minutes', interval '2 hours'])[retry_number + 1]
$$;

-- item is one mapped ticket/receipt, or the request-level error envelope.
-- The future poller must validate ticket array cardinality/order before calling this.
create function push_private.classify_response(stage text, http_status integer, item jsonb, network_failure boolean)
returns text language plpgsql immutable set search_path = '' as $$
declare
  code text := coalesce(item #>> '{details,error}', item #>> '{errors,0,code}');
begin
  if stage not in ('ticket', 'receipt') or stage is null then
    raise exception using errcode = '22023', message = 'invalid_response_stage';
  end if;
  if http_status in (401, 403) or code in ('UNAUTHORIZED', 'InvalidCredentials', 'MismatchSenderId') then
    return 'pause';
  end if;
  if coalesce(network_failure, false) or http_status is null or http_status = 429
    or http_status between 500 and 599 or code in ('TOO_MANY_REQUESTS', 'MessageRateExceeded') then
    return 'retry';
  end if;
  if http_status <> 200 then return 'failed'; end if;
  if code = 'DeviceNotRegistered' then return 'invalid_token'; end if;
  if code is not null or item->>'status' = 'error' then return 'failed'; end if;
  if item->>'status' = 'ok' then
    if stage = 'receipt' then return 'delivered'; end if;
    if jsonb_typeof(item->'id') = 'string' and length(item->>'id') between 1 and 200 then
      return 'accepted';
    end if;
    return 'retry';
  end if;
  if stage = 'receipt' and item is null then return 'wait'; end if;
  return 'retry';
end;
$$;

-- No trigger calls this preparation primitive. actor is the original outcome actor.
create function push_private.queue_report(target_report uuid, event text, actor uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  r public.reports%rowtype;
  p record;
  inserted integer := 0;
  changed integer;
  words text;
  animal text;
  message jsonb;
begin
  if event not in ('nearby', 'outcome') or event is null then
    raise exception using errcode = '22023', message = 'invalid_event_kind';
  end if;
  -- ponytail: global queue lock, per-recipient locks if throughput warrants it.
  -- Read committed, VOLATILE function statements see the previous lock holder's jobs.
  perform pg_catalog.pg_advisory_xact_lock(7280028);
  -- Once selected, retries keep original recipients instead of filling with farther accounts.
  if exists(select 1 from push_private.notification_jobs where report_id = target_report and event_kind = event) then
    return 0;
  end if;
  select * into r from public.reports where id = target_report;
  if not found then return 0; end if;
  if event = 'outcome' and (r.status not in ('rescued', 'not_found') or actor = r.reporter_id) then return 0; end if;
  words := concat_ws(' · ', upper(left(coalesce(nullif(r.animal_type, ''), 'animal'), 1))
    || substr(coalesce(nullif(r.animal_type, ''), 'animal'), 2), nullif(r.landmark, ''));
  animal := coalesce(nullif(r.animal_type, ''), 'animal');
  for p in
    select profile.id, profile.push_token from public.profiles profile
    where profile.push_token is not null and (
      (event = 'outcome' and profile.id = r.reporter_id) or
      (event = 'nearby' and profile.id <> r.reporter_id
        and extensions.st_dwithin(profile.last_location, r.location, profile.notification_radius_m)
        and (select count(*) from public.alert_log l where l.user_id = profile.id
          and l.sent_at > now() - interval '1 hour') +
          (select count(*) from push_private.notification_jobs j where j.user_id = profile.id
            and j.event_kind = 'nearby' and j.accepted_at is null
            and j.state in ('queued', 'sending', 'sent', 'retry', 'paused')) < 5))
    order by extensions.st_distance(profile.last_location, r.location), profile.id
    limit 100
  loop
    message := jsonb_build_object('to', p.push_token,
      'title', case when event = 'nearby' then 'Stray reported nearby'
        when r.status = 'rescued' then 'The ' || animal || ' you reported was rescued'
        else 'The ' || animal || ' you reported was not found' end,
      'body', case when event = 'nearby' then words
        when r.status = 'rescued' then 'Someone helped it. Thank you for reporting.'
        else 'A rescuer went to look and could not find it.' end,
      'channelId', 'default', 'sound', 'default', 'priority', 'high',
      'data', jsonb_build_object('reportId', r.id));
    insert into push_private.notification_jobs(event_kind, report_id, user_id, payload, expected_registration)
      values(event, r.id, p.id, message, p.push_token) on conflict (report_id, user_id, event_kind) do nothing;
    get diagnostics changed = row_count;
    inserted := inserted + changed;
  end loop;
  return inserted;
end;
$$;

-- Returns no more than 100 messages. There is intentionally no network transport yet.
create function push_private.claim_jobs(batch_size integer default 100)
returns setof push_private.notification_jobs language plpgsql security definer set search_path = '' as $$
declare
  job push_private.notification_jobs%rowtype;
  registration text;
begin
  if batch_size not between 1 and 100 or batch_size is null then
    raise exception using errcode = '22023', message = 'invalid_batch_size';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(7280028);
  if (select dispatch_paused from push_private.delivery_control where singleton) then return; end if;
  for job in select * from push_private.notification_jobs
    where state in ('queued', 'retry') and next_attempt_at <= now()
    order by next_attempt_at, id limit batch_size for update skip locked
  loop
    select push_token into registration from public.profiles where id = job.user_id for update;
    if registration is distinct from job.expected_registration then
      update push_private.notification_jobs set state = 'cancelled', finished_at = now(), updated_at = now()
        where id = job.id;
    elsif job.attempts >= 6 then
      update push_private.notification_jobs set state = 'failed', finished_at = now(), updated_at = now()
        where id = job.id;
      insert into push_private.operator_failures(job_id, code) values(job.id, 'retry_exhausted');
    else
      update push_private.notification_jobs set state = 'sending', attempts = attempts + 1,
        request_id = null, updated_at = now() where id = job.id returning * into job;
      return next job;
    end if;
  end loop;
end;
$$;

-- Only process responses for the exact current request and expected stage; repeat polls are inert.
create function push_private.record_response(target_job bigint, response_request bigint, stage text,
  http_status integer, item jsonb, network_failure boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  job push_private.notification_jobs%rowtype;
  result text;
  failure_code text;
  delay interval;
begin
  perform pg_catalog.pg_advisory_xact_lock(7280028);
  select * into job from push_private.notification_jobs where id = target_job for update;
  if not found or response_request is null or job.request_id is distinct from response_request
    or (stage = 'ticket' and job.state <> 'sent')
    or (stage = 'receipt' and job.state <> 'receipt_pending') then return false; end if;
  result := push_private.classify_response(stage, http_status, item, network_failure);
  if result = 'accepted' then
    if job.accepted_at is null and job.event_kind = 'nearby' then
      insert into public.alert_log(user_id, report_id) values(job.user_id, job.report_id);
    end if;
    update push_private.notification_jobs set state = 'accepted', ticket_id = item->>'id',
      accepted_at = coalesce(accepted_at, now()), ticket_accepted_at = now(),
      next_attempt_at = now() + interval '15 minutes', request_id = null, updated_at = now()
      where id = job.id;
    return true;
  end if;
  if result = 'delivered' then
    update push_private.notification_jobs set state = 'delivered', finished_at = now(), updated_at = now(),
      request_id = null where id = job.id;
    return true;
  end if;
  -- Receipt lookup network failures/missing receipts poll again, never resend an accepted message.
  if stage = 'receipt' and (result = 'wait' or (result = 'retry'
    and item #>> '{details,error}' is distinct from 'MessageRateExceeded')) then
    if job.ticket_accepted_at is not null and now() < job.ticket_accepted_at + interval '23 hours' then
      update push_private.notification_jobs set state = 'accepted', next_attempt_at = now() + interval '2 minutes',
        request_id = null, updated_at = now() where id = job.id;
      return true;
    end if;
    result := 'failed';
    failure_code := 'receipt_expired';
  end if;
  if result = 'retry' then
    delay := push_private.retry_delay(job.retries);
    if delay is not null then
      update push_private.notification_jobs set state = 'retry', retries = retries + 1,
        next_attempt_at = now() + delay, request_id = null, updated_at = now() where id = job.id;
      return true;
    end if;
    result := 'failed';
    failure_code := 'retry_exhausted';
  end if;
  if result = 'invalid_token' then
    update public.profiles set push_token = null where id = job.user_id and push_token = job.expected_registration;
    failure_code := 'invalid_registration';
  elsif result = 'pause' then
    update push_private.delivery_control set dispatch_paused = true where singleton;
    failure_code := case when http_status in (401, 403) or item #>> '{errors,0,code}' = 'UNAUTHORIZED'
      then 'authorization' else 'credentials' end;
  end if;
  insert into push_private.operator_failures(job_id, code)
    values(job.id, coalesce(failure_code, 'permanent_response'));
  update push_private.notification_jobs set state = case when result = 'pause' then 'paused' else 'failed' end,
    finished_at = case when result = 'pause' then null else now() end, request_id = null, updated_at = now()
    where id = job.id;
  return true;
end;
$$;

-- At most limit_rows total deletions. The row locks and repeated expiry predicates
-- preserve refreshed guest reservations; locked rows are left for a later sweep.
create function push_private.cleanup(limit_rows integer default 500)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  removed integer := 0;
  changed integer;
begin
  if limit_rows not between 1 and 500 or limit_rows is null then
    raise exception using errcode = '22023', message = 'invalid_cleanup_limit';
  end if;
  if not (select retention_enabled from push_private.delivery_control where singleton) then return 0; end if;
  with chosen as (
    select id from push_private.notification_jobs
    where state in ('delivered', 'failed', 'cancelled') and finished_at <= now() - interval '7 days'
    order by finished_at, id limit limit_rows for update skip locked
  ) delete from push_private.notification_jobs j using chosen c where j.id = c.id
    and j.state in ('delivered', 'failed', 'cancelled') and j.finished_at <= now() - interval '7 days';
  get diagnostics changed = row_count;
  removed := removed + changed;
  with chosen as (
    select ctid from public.alert_log where sent_at <= now() - interval '48 hours'
    order by sent_at limit (limit_rows - removed) for update skip locked
  ) delete from public.alert_log l using chosen c where l.ctid = c.ctid
    and l.sent_at <= now() - interval '48 hours';
  get diagnostics changed = row_count;
  removed := removed + changed;
  with chosen as (
    select device_hash from public.guest_devices where next_allowed_at <= now()
    order by next_allowed_at, device_hash limit (limit_rows - removed) for update skip locked
  ) delete from public.guest_devices d using chosen c where d.device_hash = c.device_hash
    and d.next_allowed_at <= now();
  get diagnostics changed = row_count;
  return removed + changed;
end;
$$;

alter table push_private.notification_jobs enable row level security;
alter table push_private.operator_failures enable row level security;
alter table push_private.delivery_control enable row level security;
revoke all on all tables in schema push_private from public, anon, authenticated;
revoke all on all sequences in schema push_private from public, anon, authenticated;
revoke all on all functions in schema push_private from public, anon, authenticated;
grant select, insert, update, delete on all tables in schema push_private to service_role;
grant usage, select on all sequences in schema push_private to service_role;
grant execute on all functions in schema push_private to service_role;
