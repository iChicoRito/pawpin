-- PawPin: the Chats tab. One row for each thread the caller is part of, with who it is with and
-- its last message, in one read. It runs with the caller's own rights, so the read rules on
-- messages (0034) still decide what is handed back; the where clause below only narrows it to
-- the caller's own threads, which matters for an admin, who may read every message.

create function public.my_chats()
returns table (
  claim_id uuid,
  report_id uuid,
  animal_type text,
  photo text,
  is_open boolean,
  other_name text,
  other_avatar text,
  other_is_rescuer boolean,
  last_body text,
  last_at timestamptz,
  last_from_me boolean,
  unread boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    c.id,
    r.id,
    r.animal_type,
    r.photos[1],
    c.status = 'on_the_way',
    other.display_name,
    other.avatar_url,
    -- The caller is the reporter, so the other person is the rescuer.
    r.reporter_id = (select auth.uid()),
    last.body,
    last.created_at,
    last.sender_id = (select auth.uid()),
    exists (
      select 1 from public.notifications n
      where n.user_id = (select auth.uid()) and n.report_id = r.id
        and n.kind = 'message' and n.read_at is null
    )
  from public.claims c
  join public.reports r on r.id = c.report_id
  join public.profiles other on other.id =
    case when r.reporter_id = (select auth.uid()) then c.rescuer_id else r.reporter_id end
  left join lateral (
    select m.body, m.created_at, m.sender_id from public.messages m
    where m.claim_id = c.id order by m.created_at desc limit 1
  ) last on true
  where (select auth.uid()) in (c.rescuer_id, r.reporter_id)
    -- close_report writes a finished claim in the reporter's own name: nobody's thread.
    and c.rescuer_id <> r.reporter_id
    -- A thread that can still be written to, or one that was.
    and (c.status = 'on_the_way' or last.created_at is not null)
  order by coalesce(last.created_at, c.created_at) desc
  limit 50;
$$;

revoke execute on function public.my_chats() from public, anon;
grant execute on function public.my_chats() to authenticated;
