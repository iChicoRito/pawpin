-- PawPin: the reporter and the rescuer on the way can write to each other about that one report.
-- A thread belongs to a claim. It takes messages only while the claim is 'on_the_way'; after that
-- it can still be read. There is no way to write to a person outside a claim.
-- The app looks for the messages 'not_in_chat', 'chat_closed', 'empty_message', and 'too_fast'.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims on delete cascade,
  report_id uuid not null references public.reports on delete cascade,
  sender_id uuid not null references public.profiles on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index messages_claim_idx on public.messages (claim_id, created_at);
-- For the limit on how fast one person may write.
create index messages_sender_idx on public.messages (sender_id, created_at);

alter table public.messages enable row level security;

-- The two people of the thread, and an admin, who may need it to judge a flagged report.
create policy "The two people of a claim can view its messages"
  on public.messages for select to authenticated
  using (
    exists (select 1 from public.claims c
      where c.id = claim_id and c.rescuer_id = (select auth.uid()))
    or exists (select 1 from public.reports r
      where r.id = report_id and r.reporter_id = (select auth.uid()))
    or (select public.is_admin())
  );

-- Written only by send_message. Never changed, never deleted.
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

create function public.send_message(p_claim_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me constant uuid := (select auth.uid());
  words constant text := btrim(p_body);
  thread record;
  other uuid;
  made uuid;
  notice uuid;
  token text;
begin
  select c.report_id, c.rescuer_id, c.status, r.reporter_id,
    coalesce(nullif(r.animal_type, ''), 'animal') as animal
  into thread
  from public.claims c join public.reports r on r.id = c.report_id
  where c.id = p_claim_id;
  -- Also the answer for a claim that does not exist: nobody learns which ids are real.
  if not found or me is null or me not in (thread.rescuer_id, thread.reporter_id)
    or thread.rescuer_id = thread.reporter_id then
    raise exception 'not_in_chat';
  end if;
  if thread.status <> 'on_the_way' then
    raise exception 'chat_closed';
  end if;
  if words is null or char_length(words) not between 1 and 500 then
    raise exception 'empty_message';
  end if;
  if (select count(*) from public.messages
      where sender_id = me and created_at > now() - interval '1 minute') >= 20 then
    raise exception 'too_fast';
  end if;

  insert into public.messages (claim_id, report_id, sender_id, body)
  values (p_claim_id, thread.report_id, me, words)
  returning id into made;

  -- Whatever goes wrong with telling the other person, the message is kept.
  begin
    other := case when me = thread.rescuer_id then thread.reporter_id else thread.rescuer_id end;
    -- One line in their list per report: an unread one moves to now instead of a second being added.
    update public.notifications set created_at = now()
    where user_id = other and report_id = thread.report_id and kind = 'message' and read_at is null
    returning id into notice;
    if notice is null then
      notice := public.add_notification(other, thread.report_id, 'message');
    end if;

    select push_token into token from public.profiles where id = other;
    if token is not null then
      perform net.http_post(
        url := 'https://exp.host/--/api/v2/push/send',
        body := jsonb_build_array(jsonb_build_object(
          'to', token,
          'title', case when other = thread.reporter_id
            then 'Message about the ' || thread.animal || ' you reported'
            else 'Message about the ' || thread.animal || ' you are going to' end,
          'body', left(words, 100),
          'channelId', 'default',
          'sound', 'default',
          'priority', 'high',
          'data', jsonb_build_object('reportId', thread.report_id, 'notificationId', notice,
            'claimId', p_claim_id)
        )),
        headers := '{"Content-Type": "application/json"}'::jsonb
      );
    end if;
  exception when others then
    raise warning 'message notification failed';
  end;

  return made;
end;
$$;

revoke execute on function public.send_message(uuid, text) from public, anon;
grant execute on function public.send_message(uuid, text) to authenticated;
