-- New reports start open. Their status changes only through the existing rescue/close RPCs.
alter policy "Users can create their own reports"
  on public.reports
  with check (reporter_id = (select auth.uid()) and status = 'reported');

-- Match claim_report, close_report and close_stale_reports: report lock before claim lock.
create or replace function public.cancel_claim(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform 1 from public.reports where id = p_report_id for update;

  update public.claims set status = 'cancelled'
  where report_id = p_report_id
    and rescuer_id = (select auth.uid())
    and status = 'on_the_way';
  if not found then
    raise exception 'no_active_claim';
  end if;

  update public.reports set status = 'reported' where id = p_report_id;
end;
$$;

create or replace function public.resolve_report(p_report_id uuid, p_outcome public.report_status)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_outcome not in ('rescued', 'not_found') then
    raise exception 'bad_outcome';
  end if;

  perform 1 from public.reports where id = p_report_id for update;

  update public.claims set status = 'completed'
  where report_id = p_report_id
    and rescuer_id = (select auth.uid())
    and status = 'on_the_way';
  if not found then
    raise exception 'no_active_claim';
  end if;

  update public.reports set status = p_outcome where id = p_report_id;
end;
$$;

-- CREATE OR REPLACE preserves the existing execute grants.
