-- Run manually in the approved test project's SQL editor as its database owner.
-- This inventory changes no records. It does not prove that policies behave correctly.
begin transaction read only;
set local statement_timeout = '30s';

select extname, extversion
from pg_extension
where extname in ('postgis', 'pg_net', 'pg_cron')
order by extname;

select n.nspname as schema_name, c.relname as table_name,
  c.relrowsecurity as rls_enabled, c.relforcerowsecurity as rls_forced,
  r.rolname as app_role,
  has_table_privilege(r.oid, c.oid, 'SELECT') as can_select,
  has_table_privilege(r.oid, c.oid, 'INSERT') as can_insert,
  has_table_privilege(r.oid, c.oid, 'UPDATE') as can_update,
  has_table_privilege(r.oid, c.oid, 'DELETE') as can_delete
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
cross join pg_roles r
where n.nspname in ('public', 'storage') and c.relkind in ('r', 'p')
  and r.rolname in ('anon', 'authenticated')
order by schema_name, table_name, app_role;

-- Table-level grants alone miss the restricted profile/report column grants.
select n.nspname as schema_name, c.relname as table_name,
  a.attname as column_name, r.rolname as app_role,
  has_column_privilege(r.oid, c.oid, a.attnum, 'SELECT') as can_select,
  has_column_privilege(r.oid, c.oid, a.attnum, 'INSERT') as can_insert,
  has_column_privilege(r.oid, c.oid, a.attnum, 'UPDATE') as can_update
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid
cross join pg_roles r
where n.nspname = 'public' and c.relname in ('profiles', 'reports')
  and a.attnum > 0 and not a.attisdropped
  and r.rolname in ('anon', 'authenticated')
order by table_name, column_name, app_role;

select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

select id, public, file_size_limit, allowed_mime_types
from storage.buckets
order by id;

-- Hash definitions instead of exporting SQL bodies that could contain secrets.
-- Review mismatches privately against the corresponding source migrations.
select p.oid::regprocedure::text as function_signature,
  pg_get_userbyid(p.proowner) as owner, p.prosecdef as security_definer,
  p.proconfig as function_settings,
  md5(pg_get_functiondef(p.oid)) as definition_hash,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind in ('f', 'p')
  and not exists (
    select 1 from pg_depend d
    where d.classid = 'pg_proc'::regclass and d.objid = p.oid
      and d.deptype = 'e'
  )
order by function_signature;

select event_object_schema, event_object_table, trigger_name,
  event_manipulation, action_timing, action_statement
from information_schema.triggers
where event_object_schema = 'public'
order by event_object_table, trigger_name, event_manipulation;

-- Commands may embed credentials; report only schedule, enabled state, and hash.
do $$
declare
  jobs jsonb;
begin
  if to_regclass('cron.job') is null then
    raise notice 'Cron inventory: pg_cron is not installed';
  else
    execute 'select coalesce(jsonb_agg(jsonb_build_object(
      ''jobid'', jobid, ''schedule'', schedule, ''active'', active,
      ''command_hash'', md5(command)) order by jobid), ''[]''::jsonb) from cron.job'
      into jobs;
    raise notice 'Cron inventory: %', jobs;
  end if;
end;
$$;

rollback;
