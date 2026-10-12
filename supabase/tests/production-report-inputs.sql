begin;
set local statement_timeout = '30s';

create function pg_temp.check_report_input(patch jsonb, should_fail boolean)
returns void language plpgsql as $$
declare
  candidate public.reports;
  rejected boolean := false;
begin
  select * into candidate from jsonb_populate_record(null::public.reports,
    jsonb_build_object(
      'id', gen_random_uuid(), 'reporter_id', current_setting('pawpin.test_user'),
      'location', 'SRID=4326;POINT(0 -89)', 'animal_type', 'dog',
      'size', 'small', 'condition', 'healthy', 'urgency', 'just_sighted',
      'photos', jsonb_build_array('https://example.invalid/test.jpg'),
      'status', 'reported', 'no_animal_seen', false,
      'created_at', '2099-01-01T00:00:00Z', 'updated_at', '2099-01-01T00:00:00Z'
    ) || patch);
  begin
    insert into public.reports select candidate.*;
  exception when check_violation or not_null_violation or invalid_parameter_value then
    rejected := true;
  end;
  if rejected <> should_fail then
    raise exception using errcode = 'P0001', message = 'report_input_expectation_failed';
  end if;
  if not rejected and exists (
    select 1 from public.reports where id = candidate.id
      and (created_at <> now() or updated_at <> now())
  ) then
    raise exception 'report_timestamp_not_server_owned';
  end if;
end;
$$;

do $$
declare
  test_user uuid := gen_random_uuid();
begin
  insert into auth.users (id, is_anonymous, raw_user_meta_data)
    values (test_user, false, '{}');
  perform set_config('pawpin.test_user', test_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', test_user, 'role', 'authenticated', 'is_anonymous', false)::text, true);
end;
$$;

set local role authenticated;
select pg_temp.check_report_input('{"photos":[]}', true);
select pg_temp.check_report_input('{"photos":["1","2","3","4"]}', true);
select pg_temp.check_report_input('{"photos":[null]}', true);
select pg_temp.check_report_input('{"animal_type":" "}', true);
select pg_temp.check_report_input(jsonb_build_object('animal_type', repeat('x', 41)), true);
select pg_temp.check_report_input(jsonb_build_object('color', repeat('x', 41)), true);
select pg_temp.check_report_input(jsonb_build_object('landmark', repeat('x', 121)), true);
select pg_temp.check_report_input('{"size":"giant"}', true);
select pg_temp.check_report_input('{"condition":"unknown"}', true);
select pg_temp.check_report_input('{"location_accuracy_m":-1}', true);
select pg_temp.check_report_input('{"location_accuracy_m":"NaN"}', true);
select pg_temp.check_report_input('{"location_accuracy_m":"Infinity"}', true);
select pg_temp.check_report_input('{"location":"SRID=4326;POINT EMPTY"}', true);
select pg_temp.check_report_input('{"location":"SRID=4326;POINT(NaN NaN)"}', true);
select pg_temp.check_report_input('{}', false);
select pg_temp.check_report_input('{"animal_type":"rabbit","color":"spotted","size":null,"condition":null,"location_accuracy_m":null,"photos":["1","2","3"],"no_animal_seen":true}', false);
reset role;

-- Rollback also removes any asynchronous push requests enqueued by insert triggers.
rollback;
