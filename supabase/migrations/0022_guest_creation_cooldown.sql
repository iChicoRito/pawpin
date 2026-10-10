-- Android ID survives ordinary app reinstall/data clearing with the same signer and OS user.
-- ponytail: client-supplied IDs are spoofable; add attestation when distribution supports it.
create table public.guest_devices (
  device_hash text primary key,
  next_allowed_at timestamptz not null
);

alter table public.guest_devices enable row level security;
revoke all on public.guest_devices from public, anon, authenticated;

create function public.guest_device_key(device_id text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if device_id is null or device_id !~* '^[0-9a-f]{1,16}$' or device_id ~ '^0+$' then
    raise exception using errcode = '22023', message = 'guest_device_required';
  end if;
  return pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    pg_catalog.lpad(pg_catalog.lower(device_id), 16, '0'), 'UTF8')), 'hex');
end;
$$;
revoke all on function public.guest_device_key(text) from public, anon, authenticated;

-- Read-only status is available before authentication. The trigger, not this check, enforces it.
create function public.guest_creation_status(device_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  device_key text := public.guest_device_key(device_id);
  retry_at timestamptz;
begin
  select next_allowed_at into retry_at from public.guest_devices
  where device_hash = device_key and next_allowed_at > now();
  return pg_catalog.jsonb_build_object('retry_at', retry_at);
end;
$$;
revoke all on function public.guest_creation_status(text) from public, anon, authenticated;
grant execute on function public.guest_creation_status(text) to anon, authenticated;

create function public.enforce_guest_creation_cooldown()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  device_key text;
  reserved_until timestamptz;
begin
  if new.is_anonymous is not true then return new; end if;
  device_key := public.guest_device_key(new.raw_user_meta_data ->> 'guest_device_id');

  -- The conflicting row is locked. Only one concurrent signup can reserve this device.
  -- Reservation rolls back with a failed auth insert and survives account deletion.
  insert into public.guest_devices as devices (device_hash, next_allowed_at)
  values (device_key, now() + interval '72 hours')
  on conflict (device_hash) do update
    set next_allowed_at = excluded.next_allowed_at
    where devices.next_allowed_at <= now()
  returning next_allowed_at into reserved_until;

  if reserved_until is null then
    raise exception using errcode = '23514', message = 'guest_creation_cooldown';
  end if;

  -- Keep only a hash in the private ledger, never the raw Android ID in account metadata.
  new.raw_user_meta_data := new.raw_user_meta_data - 'guest_device_id';
  return new;
end;
$$;
revoke all on function public.enforce_guest_creation_cooldown() from public, anon, authenticated;

create trigger enforce_guest_creation_cooldown
before insert on auth.users
for each row execute function public.enforce_guest_creation_cooldown();
