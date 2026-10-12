begin;

create or replace function public.enforce_guest_report_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  if coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    -- Per-user lock serializes the count and insert without blocking other guests.
    perform 1 from public.profiles where id = new.reporter_id for update;
    if (select count(*) from public.reports
      where reporter_id = new.reporter_id and created_at > now() - interval '24 hours') >= 3 then
      raise exception 'guest_report_limit';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.enforce_guest_flag_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.created_at := now();
  if coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    perform 1 from public.profiles where id = new.flagged_by for update;
    if (select count(*) from public.flags
      where flagged_by = new.flagged_by and created_at > now() - interval '24 hours') >= 3 then
      raise exception 'guest_flag_limit';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_guest_report_limit() from public, anon, authenticated;
revoke all on function public.enforce_guest_flag_limit() from public, anon, authenticated;

commit;
