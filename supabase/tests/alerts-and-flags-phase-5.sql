-- Run after 0018_flags.sql and 0019_guest_flag_limit.sql. All fixtures are rolled back.
begin;

insert into auth.users (id, is_anonymous) values
  ('00000000-0000-4000-8000-00000000000a', false),  -- the reporter
  ('00000000-0000-4000-8000-00000000000b', false),  -- a Google user
  ('00000000-0000-4000-8000-00000000000c', true);   -- a guest

-- Far out at sea, so no real user is alerted about these reports.
insert into public.reports (id, reporter_id, location, urgency)
select ('00000000-0000-4000-8000-0000000000a' || n)::uuid, '00000000-0000-4000-8000-00000000000a',
  'SRID=4326;POINT(130.0 5.0)', 'critical'
from generate_series(1, 6) n;

set local role authenticated;

do $$
declare
  reporter constant uuid := '00000000-0000-4000-8000-00000000000a';
  google constant uuid := '00000000-0000-4000-8000-00000000000b';
  guest constant uuid := '00000000-0000-4000-8000-00000000000c';
  r1 constant uuid := '00000000-0000-4000-8000-0000000000a1';
  r2 constant uuid := '00000000-0000-4000-8000-0000000000a2';
  seen integer;
begin
  -- A Google user flags someone else's report.
  perform set_config('request.jwt.claims',
    json_build_object('sub', google, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  insert into public.flags (report_id, flagged_by, reason) values (r1, google, 'Wrong place');

  -- They cannot read it back, nor anyone else's.
  select count(*) into seen from public.flags;
  if seen <> 0 then raise exception 'FAIL: a flagger read % flags back', seen; end if;

  -- Once per report.
  begin
    insert into public.flags (report_id, flagged_by, reason) values (r1, google, 'Something else');
    raise exception 'FAIL: the same user flagged the same report twice';
  exception when unique_violation then null;
  end;

  -- Not in someone else's name.
  begin
    insert into public.flags (report_id, flagged_by, reason) values (r2, guest, 'Wrong place');
    raise exception 'FAIL: a flag was sent in another user''s name';
  exception when insufficient_privilege then null;
  end;

  -- A reason, and not an essay.
  begin
    insert into public.flags (report_id, flagged_by, reason) values (r2, google, '');
    raise exception 'FAIL: a flag with no reason was saved';
  exception when check_violation then null;
  end;
  begin
    insert into public.flags (report_id, flagged_by, reason) values (r2, google, repeat('x', 101));
    raise exception 'FAIL: a flag with a 101-letter reason was saved';
  exception when check_violation then null;
  end;

  -- A guest may flag too.
  perform set_config('request.jwt.claims',
    json_build_object('sub', guest, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  insert into public.flags (report_id, flagged_by, reason)
    values (r1, guest, 'Not a real animal or report');

  -- Nobody flags their own report.
  perform set_config('request.jwt.claims',
    json_build_object('sub', reporter, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  begin
    insert into public.flags (report_id, flagged_by, reason) values (r1, reporter, 'Wrong place');
    raise exception 'FAIL: a reporter flagged their own report';
  exception when insufficient_privilege then null;
  end;
end;
$$;

reset role;
do $$
begin
  -- Read as the database owner: both flags are there, with their reasons.
  if (select count(*) from public.flags
      where report_id = '00000000-0000-4000-8000-0000000000a1') <> 2 then
    raise exception 'FAIL: expected 2 saved flags, found %', (select count(*) from public.flags
      where report_id = '00000000-0000-4000-8000-0000000000a1');
  end if;
  if not exists (select 1 from public.flags
      where flagged_by = '00000000-0000-4000-8000-00000000000b' and reason = 'Wrong place') then
    raise exception 'FAIL: the saved flag lost its reason';
  end if;
  if has_table_privilege('anon', 'public.flags', 'INSERT')
    or has_table_privilege('anon', 'public.flags', 'SELECT') then
    raise exception 'FAIL: a signed-out visitor can reach flags';
  end if;
  if has_table_privilege('authenticated', 'public.flags', 'UPDATE')
    or has_table_privilege('authenticated', 'public.flags', 'DELETE') then
    raise exception 'FAIL: an app user can change or remove a flag';
  end if;
end;
$$;

-- A guest may flag 3 reports in any 24 hours. A Google user has no such limit.
set local role authenticated;
do $$
declare
  google constant uuid := '00000000-0000-4000-8000-00000000000b';
  guest constant uuid := '00000000-0000-4000-8000-00000000000c';
  r constant text := '00000000-0000-4000-8000-0000000000a';
begin
  -- The guest has flagged one report above. Two more are allowed; the time is the database's.
  perform set_config('request.jwt.claims',
    json_build_object('sub', guest, 'role', 'authenticated', 'is_anonymous', true)::text, true);
  insert into public.flags (report_id, flagged_by, reason, created_at)
    values ((r || '3')::uuid, guest, 'Wrong place', now() - interval '2 days');
  insert into public.flags (report_id, flagged_by, reason)
    values ((r || '4')::uuid, guest, 'Wrong place');
  begin
    insert into public.flags (report_id, flagged_by, reason)
      values ((r || '5')::uuid, guest, 'Wrong place');
    raise exception 'FAIL: a guest flagged a fourth report in 24 hours';
  exception when raise_exception then
    if sqlerrm <> 'guest_flag_limit' then raise; end if;
  end;

  -- A Google user flags as many as they like.
  perform set_config('request.jwt.claims',
    json_build_object('sub', google, 'role', 'authenticated', 'is_anonymous', false)::text, true);
  insert into public.flags (report_id, flagged_by, reason)
    select (r || n)::uuid, google, 'Wrong place' from generate_series(2, 6) n;
end;
$$;

reset role;
do $$
begin
  -- A guest cannot slip under the limit by dating a flag in the past.
  if exists (select 1 from public.flags
      where flagged_by = '00000000-0000-4000-8000-00000000000c'
        and created_at < now() - interval '1 hour') then
    raise exception 'FAIL: a guest chose when their flag was made';
  end if;
  -- A day later the guest may flag again.
  update public.flags set created_at = now() - interval '25 hours'
    where flagged_by = '00000000-0000-4000-8000-00000000000c';
end;
$$;

set local role authenticated;
do $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', '00000000-0000-4000-8000-00000000000c', 'role', 'authenticated', 'is_anonymous', true)::text, true);
  insert into public.flags (report_id, flagged_by, reason) values
    ('00000000-0000-4000-8000-0000000000a5', '00000000-0000-4000-8000-00000000000c', 'Wrong place');
end;
$$;
reset role;

select 'Phase 5 checks passed' as result;
rollback;
