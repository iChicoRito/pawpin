-- Run after 0022_guest_creation_cooldown.sql. Fixtures and clock changes are rolled back.
begin;

delete from public.guest_devices where device_hash in (
  public.guest_device_key('dd96dec43fb81c97'),
  public.guest_device_key('123456789abcdef0'),
  public.guest_device_key('fedcba9876543210')
);

do $$
declare
  first_id uuid := gen_random_uuid();
  retry_at timestamptz;
begin
  if public.guest_creation_status('dd96dec43fb81c97') ->> 'retry_at' is not null then
    raise exception 'FAIL: new device is blocked';
  end if;

  insert into auth.users (id, is_anonymous, raw_user_meta_data)
  values (first_id, true, '{"full_name":"Guest1234","guest_device_id":"dd96dec43fb81c97"}');
  retry_at := (public.guest_creation_status('dd96dec43fb81c97') ->> 'retry_at')::timestamptz;
  if retry_at is distinct from now() + interval '72 hours' then
    raise exception 'FAIL: cooldown is not exactly 72 hours';
  end if;
  if exists (select 1 from auth.users where id = first_id and raw_user_meta_data ? 'guest_device_id') then
    raise exception 'FAIL: raw device ID retained in user metadata';
  end if;
  if (select display_name from public.profiles where id = first_id) is distinct from 'Guest1234' then
    raise exception 'FAIL: guest profile creation changed';
  end if;

  begin
    insert into auth.users (id, is_anonymous, raw_user_meta_data)
    values (gen_random_uuid(), true, '{"guest_device_id":"DD96DEC43FB81C97"}');
    raise exception 'FAIL: repeated device created a guest';
  exception when check_violation then
    if sqlerrm <> 'guest_creation_cooldown' then raise; end if;
  end;

  -- Deleting an account or reinstalling cannot remove its independent device cooldown.
  delete from auth.users where id = first_id;
  if (public.guest_creation_status('dd96dec43fb81c97') ->> 'retry_at')::timestamptz is distinct from retry_at then
    raise exception 'FAIL: account deletion reset cooldown';
  end if;

  begin
    insert into auth.users (id, is_anonymous) values (gen_random_uuid(), true);
    raise exception 'FAIL: missing device ID bypassed creation gate';
  exception when invalid_parameter_value then null;
  end;
  begin
    insert into auth.users (id, is_anonymous, raw_user_meta_data)
    values (gen_random_uuid(), true, '{"guest_device_id":"not-a-device"}');
    raise exception 'FAIL: malformed device ID bypassed creation gate';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.guest_creation_status('0000000000000000');
    raise exception 'FAIL: zero device ID accepted';
  exception when invalid_parameter_value then null;
  end;

  -- Another device and permanent accounts are unaffected.
  insert into auth.users (id, is_anonymous, raw_user_meta_data)
  values (gen_random_uuid(), true, '{"guest_device_id":"123456789abcdef0"}');
  insert into auth.users (id, is_anonymous) values (gen_random_uuid(), false);

  -- The boundary is inclusive: exactly 72 hours later permits a new guest.
  update public.guest_devices set next_allowed_at = now()
  where device_hash = public.guest_device_key('dd96dec43fb81c97');
  if public.guest_creation_status('dd96dec43fb81c97') ->> 'retry_at' is not null then
    raise exception 'FAIL: expiry boundary still blocked';
  end if;
  insert into auth.users (id, is_anonymous, raw_user_meta_data)
  values (gen_random_uuid(), true, '{"guest_device_id":"dd96dec43fb81c97"}');

  -- A failed user insert must roll back its cooldown reservation.
  begin
    insert into auth.users (id, is_anonymous, raw_user_meta_data) values
      (null, true, '{"guest_device_id":"fedcba9876543210"}');
  exception when not_null_violation then null;
  end;
  if public.guest_creation_status('fedcba9876543210') ->> 'retry_at' is not null then
    raise exception 'FAIL: failed signup consumed cooldown';
  end if;

  if has_table_privilege('anon', 'public.guest_devices', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.guest_devices', 'SELECT,INSERT,UPDATE,DELETE')
    or has_function_privilege('anon', 'public.guest_device_key(text)', 'EXECUTE') then
    raise exception 'FAIL: clients can access private cooldown data';
  end if;
end;
$$;

set local role anon;
select public.guest_creation_status('dd96dec43fb81c97');
do $$
begin
  begin
    update public.guest_devices set next_allowed_at = now();
    raise exception 'FAIL: anonymous caller reset cooldowns';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
set local role authenticated;
select public.guest_creation_status('dd96dec43fb81c97');
do $$
begin
  begin
    delete from public.guest_devices;
    raise exception 'FAIL: authenticated caller deleted cooldowns';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

rollback;
