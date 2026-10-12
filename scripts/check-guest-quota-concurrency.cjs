const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createClient } = require('./database-test-client.cjs');

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const guest = crypto.randomUUID();
const reporter = crypto.randomUUID();
const device = crypto.randomBytes(8).toString('hex');
const reports = Array.from({ length: 10 }, () => crypto.randomUUID());
const manifest = path.join(process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Temp', 'opencode') : os.tmpdir(), `pawpin-quota-${guest}.json`);
const point = 'SRID=4326;POINT(0 -89)';
let committed = false;

async function noRecipients(client) {
  // Hold location/token writes briefly while proving fixture inserts cannot send real pushes.
  await client.query('lock table public.profiles in share mode');
  const { rows } = await client.query(`select count(*)::int as recipients from public.profiles
    where push_token is not null and extensions.st_dwithin(last_location,
      $1::extensions.geography, notification_radius_m)`, [point]);
  assert.equal(rows[0].recipients, 0, 'Unsafe fixture location: would send real notifications');
}

async function insertReport(client, id, user) {
  await client.query(`insert into public.reports
    (id, reporter_id, location, animal_type, urgency, photos)
    values ($1, $2, $3, 'dog', 'just_sighted', array['https://example.invalid/quota-test.jpg'])`,
  [id, user, point]);
}

async function attempt(kind, reportId) {
  const client = createClient();
  try {
    await client.connect();
    await client.query('begin');
    await noRecipients(client);
    await client.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: guest, role: 'authenticated', is_anonymous: true })]);
    await client.query('set local role authenticated');
    if (kind === 'report') await insertReport(client, crypto.randomUUID(), guest);
    else await client.query('insert into public.flags (report_id, flagged_by, reason) values ($1,$2,$3)',
      [reportId, guest, 'isolated quota test']);
    await wait(150);
    await client.query('commit');
    return 'accepted';
  } catch (error) {
    await client.query('rollback').catch(() => {});
    if (error.message === `guest_${kind}_limit`) return 'limited';
    throw error;
  } finally {
    await client.end();
  }
}

(async () => {
  if (process.env.PAWPIN_RUN_QUOTA_TESTS !== '1') throw new Error('Set PAWPIN_RUN_QUOTA_TESTS=1 to authorize committed fixtures.');
  fs.writeFileSync(manifest, JSON.stringify({ guest, reporter, device, reports }, null, 2), { flag: 'wx' });
  console.log('Fixture cleanup manifest:', manifest);
  const admin = createClient();
  try {
    await admin.connect();
    await admin.query('begin');
    await noRecipients(admin);
    const existing = await admin.query('select 1 from public.guest_devices where device_hash = public.guest_device_key($1)', [device]);
    assert.equal(existing.rowCount, 0, 'Device fixture must not collide with existing ledger');
    await admin.query(`insert into auth.users (id, is_anonymous, raw_user_meta_data)
      values ($1, false, '{}'), ($2, true, jsonb_build_object('guest_device_id', $3::text))`, [reporter, guest, device]);
    for (const id of reports) await insertReport(admin, id, reporter);
    for (let i = 0; i < 2; i++) await insertReport(admin, crypto.randomUUID(), guest);
    for (const id of reports.slice(0, 2)) await admin.query(
      'insert into public.flags (report_id, flagged_by, reason) values ($1,$2,$3)', [id, guest, 'isolated quota baseline']);
    committed = true;
    await admin.query('commit');

    const violations = [];
    for (const [kind, targets] of [['report', reports.slice(2, 8)], ['flag', reports.slice(2, 8)]]) {
      const outcomes = await Promise.allSettled(targets.map((id) => attempt(kind, id)));
      const failure = outcomes.find((result) => result.status === 'rejected');
      if (failure) throw failure.reason;
      const results = outcomes.map((result) => result.value);
      const accepted = results.filter((r) => r === 'accepted').length;
      const limited = results.filter((r) => r === 'limited').length;
      console.log(`Six simultaneous ${kind} writes: ${accepted} accepted, ${limited} limited`);
      if (accepted !== 1 || limited !== 5) violations.push(kind);
    }
    assert.deepEqual(violations, [], 'Concurrent writes must respect remaining quota');
  } finally {
    let clean = false;
    try {
      await admin.query('rollback').catch(() => {});
      if (committed) {
        await admin.query('begin');
        await admin.query('delete from auth.users where id = any($1::uuid[])', [[guest, reporter]]);
        await admin.query('delete from public.guest_devices where device_hash = public.guest_device_key($1)', [device]);
        await admin.query('commit');
        const remains = await admin.query(`select
          (select count(*) from auth.users where id = any($1::uuid[])) +
          (select count(*) from public.profiles where id = any($1::uuid[])) +
          (select count(*) from public.reports where reporter_id = any($1::uuid[])) +
          (select count(*) from public.flags where flagged_by = any($1::uuid[])) +
          (select count(*) from public.guest_devices where device_hash = public.guest_device_key($2)) as count`,
        [[guest, reporter], device]);
        assert.equal(Number(remains.rows[0].count), 0, 'All fixture records must be removed');
        console.log('PASS: committed fixture users, profiles, reports, flags and cooldown ledger removed');
      }
      clean = true;
    } finally {
      await admin.end();
      if (clean) fs.unlinkSync(manifest);
    }
  }
})().catch((error) => {
  console.error('Concurrency check failed:', error.code || error.name,
    error instanceof assert.AssertionError ? error.message : 'See retained fixture manifest if cleanup failed');
  process.exitCode = 1;
});
