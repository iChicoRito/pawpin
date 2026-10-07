-- PawPin: when a user changes their name (a guest naming themselves in the app), copy it into
-- their profile, which is where other users read names from.

create function public.handle_user_name_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The app limits names to 40 characters; left() guards against a longer value sent another way.
  update public.profiles
  set display_name = left(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 50)
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_name_changed
  after update on auth.users
  for each row
  when (
    (new.raw_user_meta_data ->> 'full_name') is distinct from (old.raw_user_meta_data ->> 'full_name')
  )
  execute function public.handle_user_name_change();
