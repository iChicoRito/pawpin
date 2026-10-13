-- PawPin: what happened to a person's reports and rescues, kept so the app can list it. Each
-- event leaves one row for the person it concerns. Nothing is pushed from here yet; the two
-- outcomes are still pushed by 0017. An admin's close now carries a reason.

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  report_id uuid not null references public.reports on delete cascade,
  -- 'message' is for the chat between reporter and rescuer, which comes later.
  kind text not null check (kind in ('on_the_way', 'gave_up', 'rescued', 'not_found',
    'closed_by_admin', 'closed_stale', 'closed_under_you', 'message')),
  -- Why an admin closed the report. Empty for every other kind.
  reason text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index notifications_user_idx on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

create policy "Users can view their own notifications"
  on public.notifications for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can mark their own notifications read"
  on public.notifications for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Rows are written only by the triggers below. The app reads them and marks them read.
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

-- Live changes, as 0008 does for reports. Who receives a row is decided by the rules above.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;

-- One of the app's short choices (the same list as a flag's reason), never an essay.
alter table public.reports
  add column close_reason text check (char_length(close_reason) between 1 and 100);

-- As 0020, with the reason. The old one-argument function is dropped first: two functions of the
-- same name would leave a call with one argument with no clear target. A call without a reason
-- still closes the report, and then the reporter is told nothing, as before.
drop function public.admin_close_report(uuid);

create function public.admin_close_report(p_report_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  update public.reports set status = 'closed', close_reason = nullif(btrim(p_reason), '')
  where id = p_report_id and status in ('reported', 'responding');
  if not found then
    raise exception 'cannot_close';
  end if;

  update public.claims set status = 'cancelled'
  where report_id = p_report_id and status = 'on_the_way';
end;
$$;

revoke execute on function public.admin_close_report(uuid, text) from public, anon;
grant execute on function public.admin_close_report(uuid, text) to authenticated;

-- Writes one notification and hands back its id.
create function public.add_notification(p_user uuid, p_report uuid, p_kind text, p_reason text default null)
returns uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, report_id, kind, reason)
  values (p_user, p_report, p_kind, p_reason)
  returning id;
$$;

revoke execute on function public.add_notification(uuid, uuid, text, text) from public, anon, authenticated;

-- A claim starts: the reporter is told someone is on the way. A claim is cancelled: by the rescuer
-- (cancel_claim), and the reporter is told they gave up; or by anyone else (the reporter, an admin,
-- or the 72-hour job ending the report), and the rescuer is told it ended under them.
create function public.notify_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporter uuid;
begin
  -- Whatever goes wrong in here, the claim is still saved.
  begin
    if tg_op = 'INSERT' then
      -- close_report writes a finished claim in the reporter's own name; that is not a rescuer coming.
      if new.status = 'on_the_way' then
        select reporter_id into reporter from public.reports where id = new.report_id;
        perform public.add_notification(reporter, new.report_id, 'on_the_way');
      end if;
    elsif old.status = 'on_the_way' and new.status = 'cancelled' then
      if (select auth.uid()) = new.rescuer_id then
        select reporter_id into reporter from public.reports where id = new.report_id;
        perform public.add_notification(reporter, new.report_id, 'gave_up');
      else
        perform public.add_notification(new.rescuer_id, new.report_id, 'closed_under_you');
      end if;
    end if;
  exception when others then
    raise warning 'notify_claim failed';
  end;

  return new;
end;
$$;

create trigger on_claim_notification
  after insert or update of status on public.claims
  for each row execute function public.notify_claim();

revoke execute on function public.notify_claim() from public, anon, authenticated;

-- How a report ended, told to its reporter. A reporter who ends their own report is told nothing.
create function public.notify_report()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Whatever goes wrong in here, the status is still saved.
  begin
    if new.status in ('rescued', 'not_found') then
      -- A rescuer is never the reporter, so the reporter here is "I helped it myself".
      if (select auth.uid()) is distinct from new.reporter_id then
        perform public.add_notification(new.reporter_id, new.id, new.status::text);
      end if;
    elsif new.status = 'closed' then
      if new.close_reason is not null then
        perform public.add_notification(new.reporter_id, new.id, 'closed_by_admin', new.close_reason);
      elsif (select auth.uid()) is null then
        -- Nobody is signed in: the hourly job (0010).
        perform public.add_notification(new.reporter_id, new.id, 'closed_stale');
      end if;
    end if;
  exception when others then
    raise warning 'notify_report failed';
  end;

  return new;
end;
$$;

create trigger on_report_notification
  after update of status on public.reports
  for each row
  when (old.status is distinct from new.status)
  execute function public.notify_report();

revoke execute on function public.notify_report() from public, anon, authenticated;
