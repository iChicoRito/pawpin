const fs = require('node:fs');
const path = require('node:path');

// npm exec --yes --package=@electric-sql/pglite -- node tests/database-check.cjs
// An explicit PGlite install path also works. No remote database is used.
const packageRoot = process.env.PATH.split(path.delimiter)
  .map((entry) => path.resolve(entry, '..'))
  .find((entry) => fs.existsSync(path.join(entry, '@electric-sql', 'pglite', 'package.json')));
const packagePath = process.argv[2] && !process.argv[2].startsWith('--')
  ? process.argv[2]
  : packageRoot && path.join(packageRoot, '@electric-sql', 'pglite');
if (!packagePath) throw new Error('Run with npm exec --package=@electric-sql/pglite or pass its install path.');
const { PGlite } = require(packagePath);
const db = new PGlite();
const root = path.resolve(__dirname, '..', 'supabase');
const migration = (name) => fs.readFileSync(path.join(root, 'migrations', name), 'utf8');

(async () => {
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema extensions;
    grant usage on schema public, auth, extensions to anon, authenticated;
    create table auth.users (
      id uuid primary key,
      is_anonymous boolean not null default false,
      raw_user_meta_data jsonb not null default '{}'
    );
    create function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
    $$;
    create function auth.uid() returns uuid language sql stable as $$
      select (auth.jwt() ->> 'sub')::uuid;
    $$;
  `);
  // These checks exercise access rules and status transitions, not PostGIS or the cron scheduler.
  await db.exec(migration('0001_init.sql')
    .replace('create extension if not exists postgis with schema extensions;', '')
    .replace('create index reports_location_idx on public.reports using gist (location);', '')
    .replaceAll('extensions.geography(Point, 4326)', 'text'));
  await db.exec(migration('0005_guest_report_limit.sql'));
  await db.exec(migration('0007_claims.sql').split('-- The nearby search, as in 0006')[0]);
  await db.exec(migration('0009_one_claim_per_rescuer.sql'));
  await db.exec(migration('0010_closing_reports.sql').split('-- The scheduler.')[0]);
  await db.exec(migration('0011_own_report.sql'));
  if (!process.argv.includes('--baseline')) await db.exec(migration('0012_prebuild_safety.sql'));
  await db.exec(fs.readFileSync(path.join(root, 'tests', 'prebuild-safety.sql'), 'utf8'));
  console.log('Database access and rescue-transition checks passed (isolated PGlite).');
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => db.close());
