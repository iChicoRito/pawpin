-- Checks for 0004_report_photos.sql and 0005_guest_report_limit.sql.
-- Paste into the Supabase SQL Editor and run. Any wrong result stops with an error that starts
-- with FAIL. Everything is rolled back at the end, so nothing is saved.

begin;

-- Two throwaway users: A is a guest, B is a Google user. The Phase 1 trigger makes their profiles.
insert into auth.users (id, is_anonymous, raw_user_meta_data) values
  ('00000000-0000-4000-8000-00000000000a', true, '{"guest_device_id":"000000000000000a"}'),
  ('00000000-0000-4000-8000-00000000000b', false, '{}');

-- Act as guest A.
set local role authenticated;
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-00000000000a","role":"authenticated","is_anonymous":true}';

do $$
declare
  changed integer;
begin
  insert into storage.objects (bucket_id, name)
  values ('report-photos', '00000000-0000-4000-8000-00000000000a/test/1.jpg');

  update storage.objects set metadata = '{}'
  where bucket_id = 'report-photos' and name = '00000000-0000-4000-8000-00000000000a/test/1.jpg';
  get diagnostics changed = row_count;
  if changed <> 1 then
    raise exception 'FAIL: user A could not overwrite a file in their own folder';
  end if;

  begin
    insert into storage.objects (bucket_id, name)
    values ('report-photos', '00000000-0000-4000-8000-00000000000b/test/1.jpg');
    raise exception 'FAIL: user A added a file to user B''s folder';
  exception when insufficient_privilege then
    null;
  end;
end;
$$;

do $$
declare
  a constant uuid := '00000000-0000-4000-8000-00000000000a';
  changed integer;
begin
  insert into public.reports (reporter_id, location, urgency)
  values (a, 'SRID=4326;POINT(121.0 14.6)', 'just_sighted');
  insert into public.reports (reporter_id, location, urgency)
  values (a, 'SRID=4326;POINT(121.0 14.6)', 'just_sighted');
  -- A time sent by the caller must be ignored, or a guest could dodge the count with an old date.
  insert into public.reports (reporter_id, location, urgency, created_at)
  values (a, 'SRID=4326;POINT(121.0 14.6)', 'just_sighted', now() - interval '2 days');

  begin
    insert into public.reports (reporter_id, location, urgency)
    values (a, 'SRID=4326;POINT(121.0 14.6)', 'just_sighted');
    raise exception 'FAIL: a guest''s fourth report in 24 hours was accepted';
  exception when others then
    if sqlerrm <> 'guest_report_limit' then
      raise;
    end if;
  end;

  begin
    update public.reports set created_at = now() - interval '2 days' where reporter_id = a;
    raise exception 'FAIL: a guest changed created_at on their own report';
  exception when insufficient_privilege then
    null;
  end;

  update public.reports set landmark = 'Near the blue gate' where reporter_id = a;
  get diagnostics changed = row_count;
  if changed <> 3 then
    raise exception 'FAIL: a reporter could not edit their own reports';
  end if;
end;
$$;

-- As the database owner, make one of guest A's reports 25 hours old.
reset role;
update public.reports set created_at = now() - interval '25 hours'
where id = (
  select id from public.reports
  where reporter_id = '00000000-0000-4000-8000-00000000000a'
  limit 1
);

-- Guest A again: only 2 reports are inside 24 hours now, so one more is accepted.
set local role authenticated;
insert into public.reports (reporter_id, location, urgency)
values ('00000000-0000-4000-8000-00000000000a', 'SRID=4326;POINT(121.0 14.6)', 'just_sighted');

-- Act as Google user B: no limit.
set local request.jwt.claims =
  '{"sub":"00000000-0000-4000-8000-00000000000b","role":"authenticated","is_anonymous":false}';

do $$
begin
  for i in 1..4 loop
    insert into public.reports (reporter_id, location, urgency)
    values ('00000000-0000-4000-8000-00000000000b', 'SRID=4326;POINT(121.0 14.6)', 'just_sighted');
  end loop;
end;
$$;

reset role;
select 'Phase 1 checks passed' as result;

rollback;
