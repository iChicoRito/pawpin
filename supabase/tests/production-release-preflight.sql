-- Read-only release inventory. Boolean capabilities only; never select credentials or tokens.
select
  to_regprocedure('public.prepare_report_upload(uuid,integer)') is not null as upload_prepare_installed,
  to_regprocedure('public.release_report_upload(uuid)') is not null as upload_release_installed,
  to_regclass('public.report_upload_settings') is not null as upload_enforcement_installed,
  to_regclass('push_private.notification_jobs') is not null as push_jobs_installed,
  to_regclass('push_private.transport_control') is not null as push_transport_installed;

select public, file_size_limit, allowed_mime_types
  from storage.buckets where id = 'report-photos';

select role_name,
  has_schema_privilege(role_name, 'net', 'USAGE') as net_schema_usage,
  has_table_privilege(role_name, 'net.http_request_queue', 'SELECT') as queue_select,
  has_column_privilege(role_name, 'net.http_request_queue', 'headers', 'SELECT') as headers_select,
  has_table_privilege(role_name, 'net._http_response', 'SELECT') as response_select
  from unnest(array['anon', 'authenticated']) role_name;

select
  count(*) filter (where name ~ '/[1-3]\.jpg$') as numbered_objects,
  count(*) filter (where coalesce((metadata ->> 'size')::bigint, 0) > 5242880) as over_proposed_limit,
  max((metadata ->> 'size')::bigint) as largest_declared_bytes
  from storage.objects where bucket_id = 'report-photos';
