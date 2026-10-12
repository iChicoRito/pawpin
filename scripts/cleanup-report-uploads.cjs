const fs = require('node:fs');
const path = require('node:path');
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function withCleanupLock(client, operation) {
  let acquired = false;
  try {
    await client.connect();
    acquired = (await client.query("select pg_try_advisory_lock(hashtextextended('pawpin.report-upload-cleanup', 0)) as acquired")).rows[0].acquired;
    if (!acquired) throw new Error('Another cleanup worker is active; stopped without deleting.');
    return await operation();
  } finally {
    if (acquired) await client.query("select pg_advisory_unlock(hashtextextended('pawpin.report-upload-cleanup', 0))").catch(() => {});
    await client.end();
  }
}

async function cleanup({ request, ids, apply = false, resume = [], resumeOnly = false, record = () => {}, log = console.log }) {
  if (!ids.length || ids.some((id) => !UUID.test(id))) throw new Error('Provide an explicit UUID fixture allowlist.');
  if (resume.length && (!apply || resume.some((item) => !UUID.test(item.report_id) || !UUID.test(item.cleanup_token)))) {
    throw new Error('Resume requires fixture deletion authorization and valid recorded claims.');
  }
  const settings = await request('/rest/v1/report_upload_settings?select=enabled,public_base&singleton=eq.true');
  if (!settings[0]?.enabled || !settings[0].public_base) throw new Error('Upload enforcement is not enabled; cleanup blocked.');
  for (const id of [...new Set(ids)]) {
    const recovery = resume.find((item) => item.report_id === id);
    if (resumeOnly && !recovery) { log(`SKIP ${id}: no unfinished recorded claim`); continue; }
    const leases = await request(`/rest/v1/report_uploads?select=report_id,reporter_id,state,expires_at&report_id=eq.${id}`);
    const lease = leases[0];
    let claim;
    if (recovery) {
      claim = await request('/rest/v1/rpc/resume_report_upload_cleanup', {
        p_report_id: id, p_cleanup_token: recovery.cleanup_token,
      });
      if (claim?.report_id === id && claim.finished) {
        record({ ...recovery, finished: true });
        log(`FINISHED ${id}: no outstanding claim`);
        continue;
      }
    }
    if (!lease || (!recovery && (lease.state !== 'pending' || Date.parse(lease.expires_at) > Date.now()))) {
      log(`SKIP ${id}: missing, active, finalized, or already claimed`);
      continue;
    }
    const prefix = `${lease.reporter_id}/${id}/`;
    if (!recovery) claim = await request('/rest/v1/rpc/claim_report_upload_cleanup', { p_report_id: id, p_dry_run: !apply });
    if (!claim) { log(`SKIP ${id}: server recheck refused`); continue; }
    if (claim.report_id !== id || (apply && !UUID.test(claim.cleanup_token)) || !Array.isArray(claim.paths) ||
        claim.paths.some((name) => ![1, 2, 3].some((n) => name === `${prefix}${n}.jpg`))) {
      throw new Error('Unexpected cleanup claim; no files deleted.');
    }
    if (!apply) {
      for (const name of claim.paths) log(`DRY RUN ${name}`);
      continue;
    }
    record(claim);
    for (const name of claim.paths) log(`DELETE ${name}`);
    if (claim.paths.length) await request('/storage/v1/object/report-photos', { prefixes: claim.paths }, 'DELETE');
    await request('/rest/v1/rpc/finish_report_upload_cleanup', {
      p_report_id: id, p_cleanup_token: claim.cleanup_token,
    });
    record({ ...claim, finished: true });
    log(`FINISHED ${id}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply-fixtures');
  if (args.some((arg) => arg !== '--apply-fixtures' && !arg.startsWith('--ids=') && !arg.startsWith('--resume='))) throw new Error('Unknown argument.');
  if (apply && process.env.PAWPIN_DELETE_TEST_UPLOADS !== '1') throw new Error('Fixture deletion requires explicit environment authorization.');
  const ids = (args.find((arg) => arg.startsWith('--ids='))?.slice(6) ?? '').split(',').filter(Boolean);
  const resumeFile = args.find((arg) => arg.startsWith('--resume='))?.slice(9);
  if (resumeFile && process.env.PAWPIN_CONFIRM_CLEANUP_QUIESCENT !== '1') {
    throw new Error('Resume blocked: operator must verify all prior Storage requests have stopped before confirming cleanup quiescence.');
  }
  const latest = new Map();
  if (resumeFile) {
    const entries = JSON.parse(fs.readFileSync(resumeFile, 'utf8'));
    if (!Array.isArray(entries)) throw new Error('Invalid recovery manifest.');
    for (const item of entries) latest.set(item.report_id, item);
  }
  const resume = [...latest.values()].filter((item) => !item.finished);
  if (resume.some((item) => !ids.includes(item.report_id))) throw new Error('Recovery claims must match explicit fixture allowlist.');
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new Error('Configure server-only Supabase credentials locally.');
  const request = async (route, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(`${url}${route}`, {
      method, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) throw new Error(`Maintenance request failed (${response.status}); stopped, inspect recovery manifest.`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  };
  const records = [];
  const manifest = path.join(process.env.LOCALAPPDATA || '', 'Temp', 'opencode', `pawpin-upload-cleanup-${Date.now()}.json`);
  const record = (claim) => {
    records.push(claim);
    fs.writeFileSync(manifest, JSON.stringify(records, null, 2), { mode: 0o600 });
    if (records.length === 1) console.log(`Recovery manifest: ${manifest}`);
  };
  const { createClient } = require('./database-test-client.cjs');
  await withCleanupLock(createClient(), () => cleanup({ request, ids, apply, resume, resumeOnly: Boolean(resumeFile), record }));
}

module.exports = { cleanup, withCleanupLock };
if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
