-- PawPin: each notification from 0032 also reaches the phone, sent as 0017 sends an outcome.
-- 'rescued' and 'not_found' are left to 0017, which already pushes them; a second push from here
-- would ring twice. 'message' is pushed by the chat's own function, which knows the words.
-- None of these count in alert_log: they are about the person's own report or rescue.

create or replace function public.add_notification(p_user uuid, p_report uuid, p_kind text, p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  made uuid;
  token text;
  animal text;
begin
  insert into public.notifications (user_id, report_id, kind, reason)
  values (p_user, p_report, p_kind, p_reason)
  returning id into made;

  if p_kind in ('rescued', 'not_found', 'message') then
    return made;
  end if;

  -- Whatever goes wrong with the push, the notification is kept.
  begin
    select push_token into token from public.profiles where id = p_user;
    if token is null then
      return made;
    end if;
    -- As the reporter typed it: "dog", "cat", or their own word.
    select coalesce(nullif(animal_type, ''), 'animal') into animal
    from public.reports where id = p_report;

    perform net.http_post(
      url := 'https://exp.host/--/api/v2/push/send',
      body := jsonb_build_array(jsonb_build_object(
        'to', token,
        'title', case p_kind
          when 'on_the_way' then 'Someone is on the way to the ' || animal || ' you reported'
          when 'gave_up' then 'The rescuer could not go to the ' || animal || ' you reported'
          when 'closed_under_you' then 'The report of the ' || animal || ' you were going to has ended'
          else 'Your report of the ' || animal || ' was closed' end,
        'body', case p_kind
          when 'on_the_way' then 'A rescuer is going to it now.'
          when 'gave_up' then 'It is open again for someone else.'
          when 'closed_under_you' then 'You can go to another animal.'
          when 'closed_by_admin' then 'Reason: ' || p_reason || '.'
          else 'Nobody updated it for 72 hours.' end,
        -- The channel the app makes on Android (src/lib/alerts.ts).
        'channelId', 'default',
        'sound', 'default',
        'priority', 'high',
        -- The app opens this notification's page when the alert is tapped.
        'data', jsonb_build_object('reportId', p_report, 'notificationId', made)
      )),
      headers := '{"Content-Type": "application/json"}'::jsonb
    );
  exception when others then
    raise warning 'notification push failed';
  end;

  return made;
end;
$$;

-- CREATE OR REPLACE keeps who may run it: only the triggers (0032).
