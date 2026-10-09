-- PawPin: the person who reported an animal is told how it ended. When a rescuer marks the
-- report rescued or not found, the database sends that reporter an alert, as 0015 does for a
-- new report. These are not counted in alert_log: there is one per report, about the reporter's
-- own report, and it must not use up their alerts about strays nearby.

create function public.notify_outcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  token text;
  -- As the reporter typed it: "dog", "cat", or their own word.
  animal text := coalesce(nullif(new.animal_type, ''), 'animal');
begin
  -- Whatever goes wrong in here, the outcome is still saved.
  begin
    -- The reporter closed it themselves ("I helped it myself"): they already know. A rescuer is
    -- never the reporter; claim_report refuses that.
    if (select auth.uid()) = new.reporter_id then
      return new;
    end if;

    select push_token into token from public.profiles where id = new.reporter_id;
    if token is null then
      return new;
    end if;

    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := jsonb_build_array(jsonb_build_object(
        'to', token,
        'title', case when new.status = 'rescued'
          then 'The ' || animal || ' you reported was rescued'
          else 'The ' || animal || ' you reported was not found' end,
        'body', case when new.status = 'rescued'
          then 'Someone helped it. Thank you for reporting.'
          else 'A rescuer went to look and could not find it.' end,
        -- The channel the app makes on Android (src/lib/alerts.ts).
        'channelId', 'default',
        'sound', 'default',
        'priority', 'high',
        -- The app opens this report when the alert is tapped.
        'data', jsonb_build_object('reportId', new.id)
      )),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    raise warning 'notify_outcome failed: %', sqlerrm;
  end;

  return new;
end;
$$;

-- Only the two outcomes. A report that is closed, by its reporter or after 72 hours, sends nothing.
create trigger on_report_outcome
  after update of status on public.reports
  for each row
  when (old.status is distinct from new.status and new.status in ('rescued', 'not_found'))
  execute function public.notify_outcome();

-- Only the trigger runs it.
revoke execute on function public.notify_outcome() from public, anon, authenticated;
