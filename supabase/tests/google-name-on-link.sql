-- Run after 0013_google_name_on_link.sql. All fixtures are rolled back.
begin;

-- A guest as the app makes one: anonymous, with a made-up name.
insert into auth.users (id, is_anonymous, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', true, '{"full_name":"Guest4729"}'),
  ('00000000-0000-4000-8000-00000000000b', true, '{"full_name":"Guest1111"}');

do $$
declare
  found text;
begin
  select display_name into found from public.profiles
  where id = '00000000-0000-4000-8000-00000000000a';
  if found is distinct from 'Guest4729' then
    raise exception 'FAIL: a new guest''s profile name is %, not Guest4729', found;
  end if;
end;
$$;

-- The guest signs in with Google: the Google name replaces the made-up one.
insert into auth.identities (id, user_id, provider, provider_id, identity_data) values
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000000a', 'google', 'test-google-a',
    '{"full_name":"Maria Santos","avatar_url":"https://example.com/a.png"}'),
  -- An identity that carries no name leaves the name that is there.
  (gen_random_uuid(), '00000000-0000-4000-8000-00000000000b', 'google', 'test-google-b', '{}');

do $$
declare
  found record;
begin
  select display_name, avatar_url into found from public.profiles
  where id = '00000000-0000-4000-8000-00000000000a';
  if found.display_name is distinct from 'Maria Santos' then
    raise exception 'FAIL: after Google, the profile name is %, not Maria Santos', found.display_name;
  end if;
  if found.avatar_url is distinct from 'https://example.com/a.png' then
    raise exception 'FAIL: after Google, the profile photo is %', found.avatar_url;
  end if;

  select display_name into found from public.profiles
  where id = '00000000-0000-4000-8000-00000000000b';
  if found.display_name is distinct from 'Guest1111' then
    raise exception 'FAIL: an identity with no name changed the name to %', found.display_name;
  end if;

  raise notice 'PASS: google-name-on-link';
end;
$$;

rollback;
