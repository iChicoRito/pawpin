-- PawPin Phase 4: when a Google identity is added to a user, copy the Google name and photo
-- into their profile. Covers a guest who links Google; their profile starts with no name.

create function public.handle_new_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- coalesce keeps a name or photo the user already has.
  update public.profiles
  set
    display_name = coalesce(
      display_name,
      new.identity_data ->> 'full_name',
      new.identity_data ->> 'name'
    ),
    avatar_url = coalesce(
      avatar_url,
      new.identity_data ->> 'avatar_url',
      new.identity_data ->> 'picture'
    )
  where id = new.user_id;
  return new;
end;
$$;

create trigger on_auth_identity_created
  after insert on auth.identities
  for each row execute function public.handle_new_identity();
