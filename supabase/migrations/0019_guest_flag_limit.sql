-- PawPin: a guest may flag 3 reports in any 24 hours, as a guest may send 3 reports (0005). Past
-- that the app asks them to sign in with Google. Guest accounts are free to make, so this slows
-- one person flagging everything in sight; it does not stop them, which is why a flag never
-- hides a report by itself. The app looks for the message 'guest_flag_limit'.

create function public.enforce_guest_flag_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The count below trusts created_at, so the caller must not be able to choose it.
  new.created_at := now();

  -- Two flags sent at the very same instant can both pass this count. Accepted, as in 0005.
  if coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    and (
      select count(*) from public.flags
      where flagged_by = new.flagged_by
        and created_at > now() - interval '24 hours'
    ) >= 3
  then
    raise exception 'guest_flag_limit';
  end if;

  return new;
end;
$$;

create trigger on_flag_created
  before insert on public.flags
  for each row execute function public.enforce_guest_flag_limit();

-- Only the trigger runs it.
revoke execute on function public.enforce_guest_flag_limit() from public, anon, authenticated;
