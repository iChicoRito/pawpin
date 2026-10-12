const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createClient } = require('./database-test-client.cjs');

function withoutTransaction(sql) {
  return sql.replace(/^begin;\s*$/m, '').replace(/^commit;\s*$/m, '').replace(/^rollback;\s*$/m, '');
}

async function permissionInventory(client) {
  const result = await client.query(`select 'schema:'||nspname as object,md5(coalesce(nspacl::text,'')) as hash
    from pg_namespace where nspname in ('net','vault')
    union all select 'relation:'||n.nspname||'.'||c.relname,
      md5(coalesce(c.relacl::text,'')||coalesce(string_agg(a.attacl::text,',' order by a.attnum),''))
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
      left join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    where (n.nspname='net' and (c.relname in ('http_request_queue','_http_response') or c.relkind='S'))
      or (n.nspname='vault' and c.relname in ('secrets','decrypted_secrets'))
    group by n.nspname,c.relname,c.relacl::text order by object`);
  return result.rows;
}

async function stageUploads(client) {
  // No migration ledger: stage only absent preparation objects, never replay existing migrations.
  for (const [file, marker] of [
    ['0026_report_upload_safety.sql', 'public.report_uploads'],
    ['0027_report_upload_enforcement.sql', 'public.report_upload_settings'],
  ]) {
    const installed = await client.query('select to_regclass($1) as installed', [marker]);
    if (!installed.rows[0].installed) {
      await client.query(withoutTransaction(fs.readFileSync(`supabase/migrations/${file}`, 'utf8')));
    }
  }
}

async function run() {
  const client = createClient();
  try {
    await client.connect();
    await client.query('begin');
    await client.query("set local lock_timeout = '5s'");
    const extensions = await client.query("select extname, extversion from pg_extension where extname in ('pg_net', 'pg_cron') order by extname");
    assert.deepEqual(extensions.rows, [
      { extname: 'pg_cron', extversion: '1.6.4' }, { extname: 'pg_net', extversion: '0.20.4' },
    ], 'Authorized project extension versions must match documented preflight');
    const absent = await client.query("select to_regnamespace('push_private') as schema");
    assert.equal(absent.rows[0].schema, null, 'Only stage preparation on project where it is not already installed');
    const permissions = await permissionInventory(client);
    const uploadBaseline = await client.query("select to_regclass('public.report_uploads') as uploads, to_regclass('public.report_upload_settings') as settings");
    const triggerBaseline = await client.query("select tgname, tgenabled from pg_trigger where tgrelid = 'public.reports'::regclass and tgname in ('on_report_alert', 'on_report_outcome') order by tgname");
    await stageUploads(client);
    const baseline = await client.query(`select pg_get_functiondef('public.alert_nearby()'::regprocedure) as nearby,
      pg_get_functiondef('public.notify_outcome()'::regprocedure) as outcome,
      (select count(*)::int from cron.job) as schedules`);
    await client.query(fs.readFileSync('supabase/migrations/0028_push_delivery_hardening.sql', 'utf8'));
    await client.query(withoutTransaction(fs.readFileSync('supabase/tests/production-push-delivery.sql', 'utf8')));
    const peer = createClient();
    try {
      await peer.connect();
      await peer.query('begin');
      const held = await peer.query('select pg_try_advisory_xact_lock(7280028) as acquired');
      assert.equal(held.rows[0].acquired, false, 'Queue serialization lock must exclude another transaction');
      await peer.query('rollback');
    } finally {
      await peer.query('rollback').catch(() => {});
      await peer.end();
    }
    const after = await client.query(`select pg_get_functiondef('public.alert_nearby()'::regprocedure) as nearby,
      pg_get_functiondef('public.notify_outcome()'::regprocedure) as outcome,
      (select count(*)::int from cron.job) as schedules`);
    assert.deepEqual(after.rows, baseline.rows, 'Preparation must preserve direct triggers and schedules');
    await client.query(fs.readFileSync('supabase/migrations/0029_push_transport.sql', 'utf8'));
    await client.query(withoutTransaction(fs.readFileSync('supabase/tests/production-push-transport.sql', 'utf8')));
    // FK removal holds parent-table DDL locks until rollback. This staging transaction cannot
    // certify cross-session profile-row races; the earlier peer proves only advisory exclusion.
    const transport = await client.query("select mode,ever_activated,(select count(*)::int from cron.job) as schedules from push_private.transport_control where singleton");
    assert.deepEqual(transport.rows, [{ mode: 'legacy', ever_activated: false, schedules: baseline.rows[0].schedules }], 'Transport stays inactive, no cron scheduled');
    const security = await client.query('select push_private.security_ready() as ready');
    if (!security.rows[0].ready) console.log('BLOCKED: activation/probes require managed-owner pg_net/Vault permission hardening');
    await client.query('rollback');
    const removed = await client.query("select to_regclass('push_private.notification_jobs') as jobs");
    assert.equal(removed.rows[0].jobs, null, 'Staged infrastructure rolled back');
    const uploadRestored = await client.query("select to_regclass('public.report_uploads') as uploads, to_regclass('public.report_upload_settings') as settings");
    assert.deepEqual(uploadRestored.rows, uploadBaseline.rows, 'Pending upload preparation rolled back');
    const triggersRestored = await client.query("select tgname, tgenabled from pg_trigger where tgrelid = 'public.reports'::regclass and tgname in ('on_report_alert', 'on_report_outcome') order by tgname");
    assert.deepEqual(triggersRestored.rows, triggerBaseline.rows, 'Live trigger enablement restored');
    const definitionsRestored = await client.query(`select pg_get_functiondef('public.alert_nearby()'::regprocedure) as nearby,
      pg_get_functiondef('public.notify_outcome()'::regprocedure) as outcome,
      (select count(*)::int from cron.job) as schedules`);
    assert.deepEqual(definitionsRestored.rows, baseline.rows, 'Gated trigger wrappers rolled back');
    assert.deepEqual(await permissionInventory(client), permissions, 'Permission preparation rolled back without disturbing integrations');
    console.log('PASS: push fixtures and migration rollback (verified TLS, no HTTP)');
    return true;
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end();
  }
}

async function baselines() {
  let failures = 0;
  for (let phase = 1; phase <= 5; phase++) {
    const client = createClient();
    try {
      await client.connect();
      await client.query('begin');
      await client.query("set local lock_timeout = '5s'");
      await client.query('lock table public.profiles in share row exclusive mode');
      // Historical fixtures use fixed IDs/tokens and real-world coordinates. Refuse collisions.
      const safety = await client.query(`select exists(select 1 from auth.users
        where id::text like '00000000-0000-4000-8000-%') or exists(select 1 from public.profiles
        where push_token in ('tok-a','tok-b','tok-c','tok-e','tok-f','ExponentPushToken[test]'))
        or exists(select 1 from public.profiles where push_token is not null and (
          extensions.st_dwithin(last_location, 'SRID=4326;POINT(121.0 14.6)'::extensions.geography, notification_radius_m)
          or extensions.st_dwithin(last_location, 'SRID=4326;POINT(130.0 5.0)'::extensions.geography, notification_radius_m))) as unsafe`);
      assert.equal(safety.rows[0].unsafe, false, 'Historical fixture collides with existing account/recipient; blocked');
      // Historical assertions inspect a request queue. Use a session-local fake, never pg_net.
      await client.query(`create temporary table fixture_http_queue (
        id bigint generated always as identity primary key, method text not null, url text not null,
        headers jsonb not null, body bytea, timeout_milliseconds integer not null);
        create function pg_temp.fixture_http_post(url text, body jsonb default '{}'::jsonb,
          params jsonb default '{}'::jsonb, headers jsonb default '{"Content-Type":"application/json"}'::jsonb,
          timeout_milliseconds integer default 2000) returns bigint language sql as $$
          insert into pg_temp.fixture_http_queue(method,url,headers,body,timeout_milliseconds)
            values('POST',url,headers,convert_to(body::text,'UTF8'),timeout_milliseconds) returning id
        $$`);
      for (const name of ['alert_nearby', 'notify_outcome']) {
        const original = await client.query('select pg_get_functiondef($1::regprocedure) as definition', [`public.${name}()`]);
        assert.ok(original.rows[0].definition.includes('net.http_post('), 'Historical sender shape must be understood before mocking');
        await client.query(original.rows[0].definition.replaceAll('net.http_post(', 'pg_temp.fixture_http_post('));
      }
      const file = `supabase/tests/alerts-and-flags-phase-${phase}.sql`;
      await client.query(withoutTransaction(fs.readFileSync(file, 'utf8')).replaceAll('net.http_request_queue', 'pg_temp.fixture_http_queue'));
      console.log(`PASS: ${file} (rollback only)`);
    } catch (error) {
      failures++;
      console.error(`Baseline phase ${phase} failed:`, error.code || error.name);
      if (['23514', 'P0001'].includes(error.code) || error instanceof assert.AssertionError) console.error(error.message);
    } finally {
      await client.query('rollback').catch(() => {});
      await client.end();
    }
  }
  if (failures) throw new Error(`${failures} historical baseline suites blocked or incompatible`);
}

module.exports = { run };
if (require.main === module) (process.argv.includes('--baseline') ? baselines() : run()).catch((error) => {
  console.error('Push fixture check failed:', error.code || error.name);
  if (error.constraint) console.error('Constraint:', error.constraint);
  if (['P0001', '42702'].includes(error.code) || error instanceof assert.AssertionError) console.error(error.message);
  process.exitCode = 1;
});
