-- PawPin: a rescuer can be on the way to one animal at a time. Before this, one person could
-- claim every report nearby and keep other rescuers away from all of them.
-- The app looks for the message 'already_on_the_way'.

-- The rule itself. The check in claim_report below gives the clear message; this holds even if
-- two claims by the same person arrive at the very same moment.
create unique index claims_one_per_rescuer_idx on public.claims (rescuer_id)
  where status = 'on_the_way';

-- As in 0007, with one more refusal. Same name and arguments, so who may run it stays as set there.
create or replace function public.claim_report(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception 'guest_cannot_claim';
  end if;

  -- Finish or give up the first rescue before starting another.
  if exists (
    select 1 from public.claims
    where rescuer_id = (select auth.uid()) and status = 'on_the_way'
  ) then
    raise exception 'already_on_the_way';
  end if;

  -- The update locks the row, so of two claims sent at the same moment only one finds the report
  -- still 'reported'.
  update public.reports set status = 'responding'
  where id = p_report_id and status = 'reported';
  if not found then
    raise exception 'report_not_open';
  end if;

  insert into public.claims (report_id, rescuer_id)
  values (p_report_id, (select auth.uid()));
end;
$$;
