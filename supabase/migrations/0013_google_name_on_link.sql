-- PawPin: a guest now starts with a made-up name ("Guest4729"), given by the app when they sign
-- in. When that guest signs in with Google, the Google name takes its place. Before this, a name
-- the profile already had was kept, which was right while a guest's name was one they typed.
-- The photo rule is unchanged: a guest has no photo, so Google's fills the empty place.

create or replace function public.handle_new_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set
    display_name = coalesce(
      new.identity_data ->> 'full_name',
      new.identity_data ->> 'name',
      display_name
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
