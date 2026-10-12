-- Additive reservation foundation. Existing clients and Storage policies stay unchanged.
-- File restrictions, attachment validation, and cleanup need a later activation migration.
begin;

create table public.report_uploads (
  report_id uuid primary key,
  reporter_id uuid not null references public.profiles on delete cascade,
  photo_count integer not null check (photo_count between 1 and 3),
  expires_at timestamptz not null,
  state text not null default 'pending' check (state in ('pending', 'finalized', 'cleaning')),
  created_at timestamptz not null default now()
);
create index report_uploads_owner_idx on public.report_uploads (reporter_id, expires_at)
  where state = 'pending';
alter table public.report_uploads enable row level security;
revoke all on public.report_uploads from public, anon, authenticated;
grant select on public.report_uploads to authenticated;
create policy "Users can read their own upload reservations"
  on public.report_uploads for select to authenticated
  using (reporter_id = (select auth.uid()));

create function public.prepare_report_upload(p_report_id uuid, p_photo_count integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  owner_id uuid;
  existing public.report_uploads;
  expiry timestamptz := now() + interval '24 hours';
  occupied bigint;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  if p_report_id is null or p_photo_count is null or p_photo_count not between 1 and 3 then
    raise exception using errcode = '23514', message = 'invalid_report_upload';
  end if;
  perform 1 from public.profiles where id = caller for update;
  if not found then
    raise exception using errcode = '42501', message = 'profile_required';
  end if;
  select reporter_id into owner_id from public.reports where id = p_report_id;
  if found then
    if owner_id <> caller then
      raise exception using errcode = '42501', message = 'report_upload_not_owned';
    end if;
    return jsonb_build_object('saved', true);
  end if;
  select * into existing from public.report_uploads where report_id = p_report_id for update;
  if found then
    if existing.reporter_id <> caller then
      raise exception using errcode = '42501', message = 'report_upload_not_owned';
    end if;
    if existing.state <> 'pending' then
      raise exception 'report_upload_unavailable';
    end if;
  end if;
  if coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    select
      (select count(*) from public.reports where reporter_id = caller
        and created_at > now() - interval '24 hours') +
      (select count(*) from public.report_uploads u where u.reporter_id = caller
        and u.report_id <> p_report_id and u.state = 'pending' and u.expires_at > now()
        and not exists (select 1 from public.reports r where r.id = u.report_id))
    into occupied;
    if occupied >= 3 then raise exception 'guest_report_limit'; end if;
  end if;
  insert into public.report_uploads (report_id, reporter_id, photo_count, expires_at)
    values (p_report_id, caller, p_photo_count, expiry)
    on conflict (report_id) do update set photo_count = excluded.photo_count,
      expires_at = excluded.expires_at
    where public.report_uploads.reporter_id = caller and public.report_uploads.state = 'pending';
  if not found then
    raise exception using errcode = '42501', message = 'report_upload_not_owned';
  end if;
  return jsonb_build_object('saved', false, 'expires_at', expiry);
end;
$$;

create function public.release_report_upload(p_report_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  existing public.report_uploads;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'not_authenticated';
  end if;
  perform 1 from public.profiles where id = caller for update;
  select * into existing from public.report_uploads where report_id = p_report_id for update;
  if not found then return; end if;
  if existing.reporter_id <> caller then
    raise exception using errcode = '42501', message = 'report_upload_not_owned';
  end if;
  if existing.state = 'pending' and not exists (select 1 from public.reports where id = p_report_id) then
    update public.report_uploads set expires_at = now() where report_id = p_report_id;
  end if;
end;
$$;

revoke all on function public.prepare_report_upload(uuid, integer) from public, anon, authenticated;
revoke all on function public.release_report_upload(uuid) from public, anon, authenticated;
grant execute on function public.prepare_report_upload(uuid, integer) to authenticated;
grant execute on function public.release_report_upload(uuid) to authenticated;

commit;
