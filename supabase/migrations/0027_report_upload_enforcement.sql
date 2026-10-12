-- Install in compatibility mode. Only the server operator may activate enforcement.
begin;

create table public.report_upload_settings (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  public_base text
);
insert into public.report_upload_settings (singleton) values (true);
alter table public.report_upload_settings enable row level security;
revoke all on public.report_upload_settings from public, anon, authenticated;
grant select on public.report_upload_settings to service_role;
alter table public.report_uploads add column cleanup_token uuid;
grant select on public.report_uploads to service_role;

create function public.configure_report_uploads(p_public_base text, p_enabled boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.report_upload_settings where singleton for update;
  if exists (select 1 from public.report_uploads where state = 'cleaning') then
    raise exception 'upload_cleanup_in_progress';
  end if;
  if p_public_base is null or p_public_base !~ '^https://[a-z0-9-]+\.supabase\.co/storage/v1/object/public/report-photos/$' then
    raise exception using errcode = '22023', message = 'invalid_photo_public_base';
  end if;
  update public.report_upload_settings set public_base = p_public_base, enabled = p_enabled;
  if p_enabled then
    update storage.buckets set file_size_limit = 5242880, allowed_mime_types = array['image/jpeg']
      where id = 'report-photos';
    if not found then raise exception 'photo_bucket_missing'; end if;
  end if;
end;
$$;
revoke all on function public.configure_report_uploads(text, boolean) from public, anon, authenticated, service_role;

create function public.report_upload_path_allowed(p_name text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  lease public.report_uploads;
begin
  if auth.uid() is null then return false; end if;
  if not (select enabled from public.report_upload_settings where singleton) then
    return (storage.foldername(p_name))[1] = auth.uid()::text;
  end if;
  select u.* into lease from public.report_uploads u
    where u.reporter_id = auth.uid() and u.state = 'pending' and u.expires_at > now()
      and exists (select 1 from generate_series(1, u.photo_count) n
        where p_name = u.reporter_id::text || '/' || u.report_id::text || '/' || n::text || '.jpg')
    for update;
  if not found then return false; end if;
  return not exists (select 1 from public.reports where id = lease.report_id);
end;
$$;
revoke all on function public.report_upload_path_allowed(text) from public, anon, authenticated;
grant execute on function public.report_upload_path_allowed(text) to authenticated;

alter policy "Users can add photos to their own folder" on storage.objects
  with check (bucket_id = 'report-photos' and public.report_upload_path_allowed(name));
alter policy "Users can replace photos in their own folder" on storage.objects
  using (bucket_id = 'report-photos' and public.report_upload_path_allowed(name))
  with check (bucket_id = 'report-photos' and public.report_upload_path_allowed(name));

create function public.validate_report_attachments()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  settings public.report_upload_settings;
  lease public.report_uploads;
  object_name text;
begin
  select * into settings from public.report_upload_settings where singleton;
  if tg_op = 'INSERT' then
    perform 1 from public.profiles where id = new.reporter_id for update;
  end if;
  if not settings.enabled then
    if tg_op = 'INSERT' then
      update public.report_uploads set state = 'finalized'
        where report_id = new.id and reporter_id = new.reporter_id and state = 'pending';
    end if;
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.photos is not distinct from old.photos then return new; end if;
    raise exception using errcode = '23514', message = 'report_photos_immutable';
  end if;
  perform 1 from public.profiles where id = new.reporter_id for update;
  select * into lease from public.report_uploads where report_id = new.id for update;
  if not found or lease.reporter_id <> new.reporter_id or lease.state <> 'pending'
    or lease.expires_at <= now() or lease.photo_count <> cardinality(new.photos)
    or settings.public_base is null then
    raise exception using errcode = '23514', message = 'invalid_report_upload';
  end if;
  for i in 1..lease.photo_count loop
    object_name := new.reporter_id::text || '/' || new.id::text || '/' || i::text || '.jpg';
    if new.photos[i] is distinct from settings.public_base || object_name
      or not exists (select 1 from storage.objects where bucket_id = 'report-photos' and name = object_name) then
      raise exception using errcode = '23514', message = 'invalid_report_attachment';
    end if;
  end loop;
  update public.report_uploads set state = 'finalized' where report_id = new.id;
  return new;
end;
$$;
revoke all on function public.validate_report_attachments() from public, anon, authenticated;
create trigger on_report_attachments before insert or update of photos on public.reports
  for each row execute function public.validate_report_attachments();

create function public.claim_report_upload_cleanup(p_report_id uuid, p_dry_run boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  lease public.report_uploads;
  owner_id uuid;
  prefix text;
  base text;
  token uuid := gen_random_uuid();
  paths text[];
begin
  select public_base into base from public.report_upload_settings where singleton and enabled for share;
  if base is null then raise exception 'upload_cleanup_not_enabled'; end if;
  select reporter_id into owner_id from public.report_uploads where report_id = p_report_id;
  if not found then return null; end if;
  perform 1 from public.profiles where id = owner_id for update;
  select * into lease from public.report_uploads where report_id = p_report_id for update;
  if not found or lease.state <> 'pending' or lease.expires_at > now() then return null; end if;
  prefix := lease.reporter_id::text || '/' || lease.report_id::text || '/';
  if exists (select 1 from public.reports where id = p_report_id)
    or exists (select 1 from public.reports r, unnest(r.photos) photo where starts_with(photo, base || prefix))
    or exists (select 1 from storage.objects where bucket_id = 'report-photos' and starts_with(name, prefix)
      and name not in (prefix || '1.jpg', prefix || '2.jpg', prefix || '3.jpg')) then return null; end if;
  select coalesce(array_agg(name order by name), '{}'::text[]) into paths
    from storage.objects where bucket_id = 'report-photos' and starts_with(name, prefix);
  if p_dry_run then
    return jsonb_build_object('report_id', p_report_id, 'paths', paths, 'dry_run', true);
  end if;
  update public.report_uploads set state = 'cleaning', cleanup_token = token where report_id = p_report_id;
  return jsonb_build_object('report_id', p_report_id, 'paths', paths, 'cleanup_token', token);
end;
$$;

create function public.resume_report_upload_cleanup(p_report_id uuid, p_cleanup_token uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  lease public.report_uploads;
  owner_id uuid;
  prefix text;
  base text;
  paths text[];
begin
  select public_base into base from public.report_upload_settings where singleton and enabled for share;
  if base is null then raise exception 'upload_cleanup_not_enabled'; end if;
  select reporter_id into owner_id from public.report_uploads where report_id = p_report_id;
  if not found then return jsonb_build_object('report_id', p_report_id, 'finished', true); end if;
  perform 1 from public.profiles where id = owner_id for update;
  select * into lease from public.report_uploads where report_id = p_report_id for update;
  if not found then return jsonb_build_object('report_id', p_report_id, 'finished', true); end if;
  if lease.state <> 'cleaning' or lease.cleanup_token is distinct from p_cleanup_token then
    raise exception 'cleanup_claim_mismatch';
  end if;
  prefix := lease.reporter_id::text || '/' || lease.report_id::text || '/';
  if exists (select 1 from public.reports where id = p_report_id)
    or exists (select 1 from public.reports r, unnest(r.photos) photo where starts_with(photo, base || prefix))
    or exists (select 1 from storage.objects where bucket_id = 'report-photos' and starts_with(name, prefix)
      and name not in (prefix || '1.jpg', prefix || '2.jpg', prefix || '3.jpg')) then
    raise exception 'cleanup_objects_or_references_ambiguous';
  end if;
  select coalesce(array_agg(name order by name), '{}'::text[]) into paths
    from storage.objects where bucket_id = 'report-photos' and starts_with(name, prefix);
  return jsonb_build_object('report_id', p_report_id, 'paths', paths, 'cleanup_token', p_cleanup_token);
end;
$$;

create function public.finish_report_upload_cleanup(p_report_id uuid, p_cleanup_token uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  lease public.report_uploads;
  owner_id uuid;
  prefix text;
  base text;
begin
  select reporter_id into owner_id from public.report_uploads where report_id = p_report_id;
  if not found then raise exception 'cleanup_claim_missing'; end if;
  perform 1 from public.profiles where id = owner_id for update;
  select * into lease from public.report_uploads where report_id = p_report_id for update;
  if not found or lease.state <> 'cleaning' or lease.cleanup_token is distinct from p_cleanup_token then
    raise exception 'cleanup_claim_mismatch';
  end if;
  select public_base into base from public.report_upload_settings where singleton and enabled;
  if base is null then raise exception 'upload_cleanup_not_enabled'; end if;
  prefix := lease.reporter_id::text || '/' || lease.report_id::text || '/';
  if exists (select 1 from storage.objects where bucket_id = 'report-photos' and starts_with(name, prefix))
    or exists (select 1 from public.reports where id = p_report_id)
    or exists (select 1 from public.reports r, unnest(r.photos) photo where starts_with(photo, base || prefix)) then
    raise exception 'cleanup_objects_or_references_remain';
  end if;
  delete from public.report_uploads where report_id = p_report_id;
end;
$$;
revoke all on function public.claim_report_upload_cleanup(uuid, boolean) from public, anon, authenticated;
revoke all on function public.finish_report_upload_cleanup(uuid, uuid) from public, anon, authenticated;
revoke all on function public.resume_report_upload_cleanup(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_report_upload_cleanup(uuid, boolean) to service_role;
grant execute on function public.finish_report_upload_cleanup(uuid, uuid) to service_role;
grant execute on function public.resume_report_upload_cleanup(uuid, uuid) to service_role;

commit;
