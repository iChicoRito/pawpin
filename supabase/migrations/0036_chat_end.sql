-- PawPin: why a chat can no longer be written to. A thread closes when its claim ends, and a
-- claim ends in several ways; the app says which. One function decides, so the chat screen and
-- the Chats tab cannot disagree.
--
-- 'rescued' and 'not_found': the rescuer said how it ended. 'reporter_rescued': the reporter
-- helped the animal themselves. 'closed_by_admin' and 'closed': the report was taken down, with
-- or without an admin's reason. 'gave_up': the rescuer could not go. Null: still open.

create function public.chat_end(p_claim_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when c.status = 'on_the_way' then null
    -- resolve_report finishes the claim and sets the outcome together.
    when c.status = 'completed' then r.status::text
    -- From here the claim was cancelled. close_report writes a finished claim in the reporter's
    -- own name right after cancelling the rescuer's.
    when exists (select 1 from public.claims later where later.report_id = c.report_id
        and later.created_at > c.created_at and later.rescuer_id = r.reporter_id) then 'reporter_rescued'
    -- Someone else went after this rescuer: so this one had given up, whatever came of it since.
    when exists (select 1 from public.claims later where later.report_id = c.report_id
        and later.created_at > c.created_at) then 'gave_up'
    when r.status = 'closed' and r.close_reason is not null then 'closed_by_admin'
    when r.status = 'closed' then 'closed'
    else 'gave_up'
  end
  from public.claims c join public.reports r on r.id = c.report_id
  where c.id = p_claim_id;
$$;

revoke execute on function public.chat_end(uuid) from public, anon;
grant execute on function public.chat_end(uuid) to authenticated;

-- As 0035, with why each ended chat ended. A new column changes what the function hands back,
-- so it is dropped and made again.
drop function public.my_chats();

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
  unread boolean,
  ended text
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
    ),
    public.chat_end(c.id)
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
