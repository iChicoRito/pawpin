-- PawPin: keep a user's alert pass and last place to themselves, before the app starts saving them.
-- Until now every signed-in user, guests included, could read every column of profiles.

-- The columns the app shows: a reporter's name, photo, and join month, and a user's own role and
-- alert distance. push_token and last_location are left out, so nobody reads them through the app.
-- The database's own functions still can.
revoke select on public.profiles from authenticated;
grant select (id, display_name, avatar_url, role, notification_radius_m, created_at)
  on public.profiles to authenticated;

-- The alert distance is one of the app's choices, 1 km to 25 km.
alter table public.profiles
  add constraint profiles_radius_check check (notification_radius_m between 1000 and 25000);
