-- Run with 0031 staged or deployed. Costs and exact node choices are intentionally not assertions.
begin;
do $$
declare
  rpc regprocedure := 'public.nearby_report_pages(double precision,double precision,integer,integer,double precision,uuid)'::regprocedure;
  claims text := current_setting('request.jwt.claims',true);
begin
  if (select prosecdef from pg_proc where oid=rpc) then raise exception 'FAIL: paging must be invoker'; end if;
  if (select proretset from pg_proc where oid=rpc) or (select prorettype from pg_proc where oid=rpc) <> 'jsonb'::regtype then
    raise exception 'FAIL: paging must return scalar JSON, not a truncatable set';
  end if;
  if has_function_privilege('anon',rpc,'execute') or not has_function_privilege('authenticated',rpc,'execute') then
    raise exception 'FAIL: signed-in paging permission';
  end if;
  if not exists (select 1 from pg_index where indexrelid='public.reports_location_idx'::regclass and indisvalid)
    or not exists (select 1 from pg_index where indexrelid='public.profiles_last_location_idx'::regclass and indisvalid) then
    raise exception 'FAIL: spatial indexes missing';
  end if;
  if not exists (select 1 from pg_index where indexrelid='public.claims_one_active_idx'::regclass and indisunique and indpred is not null)
    or not exists (select 1 from pg_index where indexrelid='public.claims_one_per_rescuer_idx'::regclass and indisunique and indpred is not null) then
    raise exception 'FAIL: active claim uniqueness missing';
  end if;
  if exists(select 1 from pg_class where oid in ('public.reports'::regclass,'public.claims'::regclass,'public.profiles'::regclass,'public.flags'::regclass) and not relrowsecurity) then
    raise exception 'FAIL: RLS disabled';
  end if;
  if has_table_privilege('anon','public.reports','select') or has_table_privilege('authenticated','public.claims','insert')
    or not has_table_privilege('authenticated','public.reports','select') then raise exception 'FAIL: table grants changed'; end if;
  perform 'public.nearby_reports(double precision,double precision,integer)'::regprocedure;
  if to_regclass('public.reports_reporter_history_idx') is null or to_regclass('public.flags_user_created_idx') is null
    or to_regclass('public.claims_completed_rescuer_idx') is null then raise exception 'FAIL: retained lookup indexes missing'; end if;
  if (select indnkeyatts from pg_index where indexrelid='public.reports_reporter_history_idx'::regclass) <> 3
    or (select indpred from pg_index where indexrelid='public.claims_completed_rescuer_idx'::regclass) is null then
    raise exception 'FAIL: retained index definition changed';
  end if;
  if pg_get_indexdef('public.reports_reporter_history_idx'::regclass) not like '%(reporter_id, created_at DESC, id DESC)%'
    or pg_get_indexdef('public.flags_user_created_idx'::regclass) not like '%(flagged_by, created_at)%'
    or pg_get_indexdef('public.claims_completed_rescuer_idx'::regclass) not like '%(rescuer_id, report_id)%completed%' then
    raise exception 'FAIL: retained index keys/predicate changed';
  end if;
  perform set_config('request.jwt.claims','{}',true);
  begin
    perform public.nearby_report_pages(0,0,1000);
    raise exception 'FAIL: missing identity allowed';
  exception when insufficient_privilege then null;
  end;
  perform set_config('request.jwt.claims','{"sub":"8f080009-0000-4000-8000-000000000001","role":"authenticated"}',true);
  begin
    perform public.nearby_report_pages(91,0,1000);
    raise exception 'FAIL: invalid latitude allowed';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.nearby_report_pages(0,0,-1);
    raise exception 'FAIL: negative radius allowed';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.nearby_report_pages(0,0,1000,0);
    raise exception 'FAIL: zero page size allowed';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.nearby_report_pages(0,0,1000,200,1,null);
    raise exception 'FAIL: partial cursor allowed';
  exception when invalid_parameter_value then null;
  end;
  perform set_config('request.jwt.claims',coalesce(claims,'{}'),true);
end;
$$;
rollback;
