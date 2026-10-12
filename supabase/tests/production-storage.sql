begin;
set local statement_timeout = '30s';

do $$
declare
  owner_id uuid := gen_random_uuid();
  other_id uuid := gen_random_uuid();
  report_id uuid := gen_random_uuid();
  legacy_id uuid := gen_random_uuid();
begin
  insert into auth.users (id, is_anonymous) values (owner_id, false), (other_id, false);
  perform set_config('pawpin.storage_owner', owner_id::text, true);
  perform set_config('pawpin.storage_other', other_id::text, true);
  perform set_config('pawpin.storage_report', report_id::text, true);
  perform set_config('pawpin.storage_legacy', legacy_id::text, true);
  -- Grandfathered accepted reports remain readable without reservations or new objects.
  insert into public.reports (id, reporter_id, location, animal_type, urgency, photos)
    values (legacy_id, owner_id, 'SRID=4326;POINT(0 -89)', 'dog', 'just_sighted', array['https://legacy.invalid/photo.jpg']);
  perform public.configure_report_uploads('https://test.supabase.co/storage/v1/object/public/report-photos/', true);
  if not exists (select 1 from storage.buckets where id = 'report-photos' and public
    and file_size_limit = 5242880 and allowed_mime_types = array['image/jpeg']) then
    raise exception 'bucket restrictions not configured';
  end if;
end;
$$;

set local role authenticated;
do $$
declare
  owner_id uuid := current_setting('pawpin.storage_owner')::uuid;
  report_id uuid := current_setting('pawpin.storage_report')::uuid;
  prefix text := owner_id::text || '/' || report_id::text || '/';
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', owner_id,
    'role', 'authenticated', 'is_anonymous', false)::text, true);
  if public.report_upload_path_allowed(prefix || '1.jpg') then raise exception 'unreserved path allowed'; end if;
  perform public.prepare_report_upload(report_id, 3);
  if not public.report_upload_path_allowed(prefix || '1.jpg')
    or not public.report_upload_path_allowed(prefix || '3.jpg') then raise exception 'valid numbered path refused'; end if;
  if public.report_upload_path_allowed(prefix || '4.jpg')
    or public.report_upload_path_allowed(prefix || '1.png')
    or public.report_upload_path_allowed(prefix || '../1.jpg') then raise exception 'unexpected path allowed'; end if;
  begin
    insert into public.reports (id, reporter_id, location, animal_type, urgency, photos)
      values (report_id, owner_id, 'SRID=4326;POINT(0 -89)', 'dog', 'just_sighted',
        array['https://wrong.invalid/1.jpg']);
    raise exception 'invalid attachments accepted';
  exception when check_violation then null;
  end;
  perform public.prepare_report_upload(report_id, 1);
  begin
    insert into public.reports (id, reporter_id, location, animal_type, urgency, photos)
      values (report_id, owner_id, 'SRID=4326;POINT(0 -89)', 'dog', 'just_sighted',
        array['https://test.supabase.co/storage/v1/object/public/report-photos/' || prefix || '1.jpg']);
    raise exception 'missing storage object accepted';
  exception when check_violation then null;
  end;
  begin
    update public.reports set photos = array['https://changed.invalid/photo.jpg']
      where id = current_setting('pawpin.storage_legacy')::uuid;
    raise exception 'accepted photos changed';
  exception when check_violation then null;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('pawpin.storage_other'),
    'role', 'authenticated', 'is_anonymous', false)::text, true);
  if public.report_upload_path_allowed(prefix || '1.jpg') then raise exception 'other account path allowed'; end if;
  begin
    perform public.claim_report_upload_cleanup(report_id);
    raise exception 'app role claimed maintenance work';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;

update public.report_uploads set expires_at = now() - interval '1 second'
  where report_id = current_setting('pawpin.storage_report')::uuid;
do $$
declare
  report_id uuid := current_setting('pawpin.storage_report')::uuid;
  claim jsonb;
begin
  claim := public.claim_report_upload_cleanup(report_id, true);
  if claim is null or not (claim ->> 'dry_run')::boolean
    or not exists (select 1 from public.report_uploads u where u.report_id = current_setting('pawpin.storage_report')::uuid
      and u.state = 'pending' and u.cleanup_token is null) then raise exception 'dry run mutated lease'; end if;
  claim := public.claim_report_upload_cleanup(report_id);
  if claim is null or jsonb_array_length(claim -> 'paths') <> 0 then raise exception 'empty expired fixture not claimable'; end if;
  if public.claim_report_upload_cleanup(report_id) is not null then raise exception 'duplicate cleanup worker claimed lease'; end if;
  if public.resume_report_upload_cleanup(report_id, (claim ->> 'cleanup_token')::uuid) -> 'paths' <> '[]'::jsonb then
    raise exception 'resume returned unexpected remaining objects';
  end if;
  begin
    perform public.resume_report_upload_cleanup(report_id, gen_random_uuid());
    raise exception 'wrong resume token accepted';
  exception when raise_exception then
    if sqlerrm <> 'cleanup_claim_mismatch' then raise; end if;
  end;
  begin
    perform public.configure_report_uploads('https://test.supabase.co/storage/v1/object/public/report-photos/', false);
    raise exception 'enforcement disabled during cleanup';
  exception when raise_exception then
    if sqlerrm <> 'upload_cleanup_in_progress' then raise; end if;
  end;
  perform set_config('request.jwt.claims', jsonb_build_object('sub', current_setting('pawpin.storage_owner'),
    'role', 'authenticated', 'is_anonymous', false)::text, true);
  begin
    perform public.prepare_report_upload(report_id, 1);
    raise exception 'draft renewed during cleanup';
  exception when raise_exception then
    if sqlerrm <> 'report_upload_unavailable' then raise; end if;
  end;
  begin
    perform public.finish_report_upload_cleanup(report_id, gen_random_uuid());
    raise exception 'wrong cleanup token accepted';
  exception when raise_exception then
    if sqlerrm <> 'cleanup_claim_mismatch' then raise; end if;
  end;
  perform public.finish_report_upload_cleanup(report_id, (claim ->> 'cleanup_token')::uuid);
  if not (public.resume_report_upload_cleanup(report_id, (claim ->> 'cleanup_token')::uuid) ->> 'finished')::boolean then
    raise exception 'finished timeout recovery not recognized';
  end if;
  perform public.prepare_report_upload(report_id, 1);
  begin
    perform public.resume_report_upload_cleanup(report_id, (claim ->> 'cleanup_token')::uuid);
    raise exception 'stale cleanup claim can touch a renewed draft';
  exception when raise_exception then
    if sqlerrm <> 'cleanup_claim_mismatch' then raise; end if;
  end;
  if not exists (select 1 from public.reports where id = current_setting('pawpin.storage_legacy')::uuid
    and photos = array['https://legacy.invalid/photo.jpg']) then raise exception 'legacy report changed'; end if;
end;
$$;

rollback;
