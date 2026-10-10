-- Run after 0014_profile_privacy.sql. All fixtures are rolled back.
begin;

insert into auth.users (id, is_anonymous, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', false, '{}'),
  ('00000000-0000-4000-8000-00000000000b', true, '{"guest_device_id":"000000000000000b"}');

set local role authenticated;

do $$
declare
  user_a constant uuid := '00000000-0000-4000-8000-00000000000a';
  as_a constant text := '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated","is_anonymous":false}';
  as_b constant text := '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated","is_anonymous":true}';
  found text;
  changed integer;
begin
  -- A user saves their own alert pass, last place, and alert distance.
  perform set_config('request.jwt.claims', as_a, true);
  update public.profiles
  set push_token = 'ExponentPushToken[test]',
    last_location = 'SRID=4326;POINT(121.0 14.6)',
    notification_radius_m = 10000,
    display_name = 'Test A'
  where id = user_a;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'FAIL: user could not save their own alert settings'; end if;

  select notification_radius_m::text into found from public.profiles where id = user_a;
  if found <> '10000' then raise exception 'FAIL: user cannot read back their own alert distance'; end if;

  -- The alert distance stays inside the choices the app offers.
  begin
    update public.profiles set notification_radius_m = 500 where id = user_a;
    raise exception 'FAIL: an alert distance under 1 km was saved';
  exception when check_violation then null;
  end;
  begin
    update public.profiles set notification_radius_m = 30000 where id = user_a;
    raise exception 'FAIL: an alert distance over 25 km was saved';
  exception when check_violation then null;
  end;

  -- Nobody reads an alert pass or a last place through the app, not even their own.
  begin
    perform push_token from public.profiles where id = user_a;
    raise exception 'FAIL: a user read a push token';
  exception when insufficient_privilege then null;
  end;
  begin
    perform last_location from public.profiles where id = user_a;
    raise exception 'FAIL: a user read a last location';
  exception when insufficient_privilege then null;
  end;

  -- Another user, a guest here.
  perform set_config('request.jwt.claims', as_b, true);
  begin
    perform push_token from public.profiles where id = user_a;
    raise exception 'FAIL: another user read a push token';
  exception when insufficient_privilege then null;
  end;
  begin
    perform last_location from public.profiles where id = user_a;
    raise exception 'FAIL: another user read a last location';
  exception when insufficient_privilege then null;
  end;

  -- What the report page shows about a reporter is still readable.
  select display_name into found from public.profiles where id = user_a;
  if found is distinct from 'Test A' then
    raise exception 'FAIL: another user cannot read a name';
  end if;
  perform avatar_url, created_at, role from public.profiles where id = user_a;

  -- Nobody changes someone else's row.
  update public.profiles set push_token = 'stolen', notification_radius_m = 1000 where id = user_a;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: a user changed another user''s profile'; end if;
end;
$$;

reset role;
do $$
begin
  if (select push_token from public.profiles where id = '00000000-0000-4000-8000-00000000000a')
    <> 'ExponentPushToken[test]' then
    raise exception 'FAIL: the saved push token is not on the row';
  end if;
end;
$$;

select 'Phase 1 checks passed' as result;
rollback;
