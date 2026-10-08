-- PawPin: live changes. Supabase Realtime sends a table's changes to the phones that listen,
-- but only for tables in its publication. The app listens to reports: a claim, a give-up, an
-- outcome, and a new report all change a row there, so claims needs no listener of its own.
-- Who receives a change is still decided by the access rules on reports.

do $$
begin
  -- Checked first, so running this twice does not fail.
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reports'
  ) then
    alter publication supabase_realtime add table public.reports;
  end if;
end;
$$;
