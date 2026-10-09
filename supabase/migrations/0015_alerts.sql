-- PawPin: a new report alerts the people nearby. The database sends the alert itself, through
-- Expo's push service, so there is no server of our own and nothing for the app to do.

-- Lets the database make a web request. The request is sent once the transaction is committed.
create extension if not exists pg_net with schema extensions;

-- For "whose last place is near this report".
create index profiles_last_location_idx on public.profiles using gist (last_location);

-- Who was alerted about what, and when. It is what the hourly limit counts.
create table public.alert_log (
  user_id uuid not null references public.profiles on delete cascade,
  report_id uuid not null references public.reports on delete cascade,
  sent_at timestamptz not null default now()
);

create index alert_log_user_idx on public.alert_log (user_id, sent_at);

-- No rule is added, so the app can neither read nor write it. Only the function below does.
alter table public.alert_log enable row level security;
revoke all on public.alert_log from anon, authenticated;

-- A phone belongs to the account signed in on it now. When an account saves a phone's alert
-- pass, the same pass is taken off every other account. Without this, someone who used the app
-- as a guest and then signed in with Google would get every alert twice, and would be alerted
-- about their own reports through the guest's row.
create function public.keep_token_single()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set push_token = null
  where push_token = new.push_token and id <> new.id;
  return null;
end;
$$;

-- Not when a pass is cleared: there is nothing to take off anyone then, and it stops the
-- update above from setting this off again.
create trigger on_push_token_saved
  after update of push_token on public.profiles
  for each row
  when (new.push_token is not null)
  execute function public.keep_token_single();

-- Alerts users whose last place is within their own alert distance of a new report. Skips the
-- reporter, and anyone already alerted 5 times in the past hour.
create function public.alert_nearby()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  messages jsonb;
  -- "Dog · public market", or just "Dog" when no landmark was given.
  words text := concat_ws(' · ',
    upper(left(coalesce(nullif(new.animal_type, ''), 'animal'), 1))
      || substr(coalesce(nullif(new.animal_type, ''), 'animal'), 2),
    nullif(new.landmark, ''));
begin
  -- Whatever goes wrong in here, the report is still saved.
  begin
    with chosen as (
      select p.id, p.push_token
      from public.profiles p
      where p.push_token is not null
        and p.id <> new.reporter_id
        and extensions.st_dwithin(p.last_location, new.location, p.notification_radius_m)
        and (
          select count(*) from public.alert_log l
          where l.user_id = p.id and l.sent_at > now() - interval '1 hour'
        ) < 5
      order by extensions.st_distance(p.last_location, new.location)
      -- Expo takes up to 100 messages in one request. A report with more than 100 users in
      -- range alerts the nearest 100. Send further requests here when that really happens.
      limit 100
    ),
    logged as (
      insert into public.alert_log (user_id, report_id)
      select id, new.id from chosen
    )
    select jsonb_agg(jsonb_build_object(
      'to', push_token,
      'title', 'Stray reported nearby',
      'body', words,
      -- The channel the app makes on Android (src/lib/alerts.ts).
      'channelId', 'default',
      'sound', 'default',
      'priority', 'high',
      -- The app opens this report when the alert is tapped.
      'data', jsonb_build_object('reportId', new.id)
    ))
    into messages
    from chosen;

    if messages is not null then
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := messages,
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    end if;
  exception when others then
    raise warning 'alert_nearby failed: %', sqlerrm;
  end;

  return new;
end;
$$;

-- on_report_created is taken: it is the guest limit, from 0005.
create trigger on_report_alert
  after insert on public.reports
  for each row execute function public.alert_nearby();

-- Only the triggers run these.
revoke execute on function public.alert_nearby() from public, anon, authenticated;
revoke execute on function public.keep_token_single() from public, anon, authenticated;
