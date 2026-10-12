const assert = require('node:assert/strict');
const { test } = require('node:test');
const { cleanup, withCleanupLock } = require('../scripts/cleanup-report-uploads.cjs');
const id = '00000000-0000-4000-8000-000000000001';
const owner = '00000000-0000-4000-8000-000000000002';
const token = '00000000-0000-4000-8000-000000000003';
function harness({ lease = {}, claim, failure } = {}) {
  const calls = [], records = [];
  return {
    calls, records,
    options: { ids: [id], log: () => {}, record: (item) => records.push(item),
      request: async (route, body, method) => {
        calls.push({ route, body, method });
        if (route.includes('report_upload_settings')) return [{ enabled: true, public_base: 'https://test/' }];
        if (route.includes('report_uploads?')) return [{ reporter_id: owner, state: 'pending', expires_at: '2000-01-01', ...lease }];
        if (route.includes('/claim_')) return claim === undefined ? { report_id: id, cleanup_token: token, paths: [`${owner}/${id}/1.jpg`] } : claim;
        if (failure && route.includes(failure)) throw new Error('fixture failure');
        return null;
      },
    },
  };
}
test('dry run only previews through server recheck, explicit allowlist required', async () => {
  const { options, calls } = harness();
  await cleanup(options);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].body.p_dry_run, true);
  await assert.rejects(cleanup({ ...options, ids: [] }), /allowlist/);
});
test('approved deletion uses exact paths and finishes only after Storage succeeds', async () => {
  const { options, calls, records } = harness();
  await cleanup({ ...options, apply: true });
  assert.deepEqual(calls[3].body, { prefixes: [`${owner}/${id}/1.jpg`] });
  assert.equal(calls[3].method, 'DELETE');
  assert.match(calls[4].route, /finish_report_upload_cleanup/);
  assert.equal(records[1].finished, true);
});
test('active, finalized and cleaning leases skipped', async () => {
  for (const lease of [{ expires_at: '2099-01-01' }, { state: 'finalized' }, { state: 'cleaning' }]) {
    const { options, calls } = harness({ lease });
    await cleanup({ ...options, apply: true });
    assert.equal(calls.length, 2);
  }
});
test('server renewal/reference recheck can refuse candidate without deletion', async () => {
  const { options, calls } = harness({ claim: null });
  await cleanup({ ...options, apply: true });
  assert.equal(calls.length, 3);
});
test('ambiguous claim blocks deletion', async () => {
  const { options, calls } = harness({ claim: { report_id: id, cleanup_token: token, paths: ['legacy/photo.jpg'] } });
  await assert.rejects(cleanup({ ...options, apply: true }), /Unexpected/);
  assert.equal(calls.length, 3);
});
test('partial failure stops; preserves exact recovery claim and does not finalize', async () => {
  const { options, calls, records } = harness({ failure: '/storage/' });
  await assert.rejects(cleanup({ ...options, apply: true }), /fixture failure/);
  assert.equal(calls.length, 4);
  assert.equal(records.length, 1);
  assert.equal(records[0].cleanup_token, token);
});
test('resume uses exact saved token and current server paths, not a fresh claim', async () => {
  const { options, calls } = harness({ lease: { state: 'cleaning' } });
  const original = options.request;
  options.request = async (...args) => {
    if (args[0].includes('/resume_')) {
      calls.push({ route: args[0], body: args[1] });
      return { report_id: id, cleanup_token: token, paths: [`${owner}/${id}/2.jpg`] };
    }
    return original(...args);
  };
  await cleanup({ ...options, apply: true, resume: [{ report_id: id, cleanup_token: token }] });
  assert.match(calls[2].route, /resume_report_upload_cleanup/);
  assert.equal(calls[2].body.p_cleanup_token, token);
  assert.deepEqual(calls[3].body.prefixes, [`${owner}/${id}/2.jpg`]);
});
test('resume-only skips finished manifest IDs rather than claiming a newly expired lease', async () => {
  const { options, calls } = harness();
  await cleanup({ ...options, apply: true, resumeOnly: true });
  assert.equal(calls.length, 1);
});
test('exclusive cleanup lock refuses a second worker before any Storage request', async () => {
  let ran = false, ended = false;
  const client = { connect: async () => {}, query: async () => ({ rows: [{ acquired: false }] }),
    end: async () => { ended = true; } };
  await assert.rejects(withCleanupLock(client, async () => { ran = true; }), /Another cleanup worker/);
  assert.equal(ran, false);
  assert.equal(ended, true);
});
test('cleanup lock spans deletion and finish; errors release connection without releasing the claim', async () => {
  const events = [];
  const client = { connect: async () => events.push('connect'),
    query: async (sql) => { events.push(sql.includes('try_advisory') ? 'lock' : 'unlock'); return { rows: [{ acquired: true }] }; },
    end: async () => events.push('end') };
  await assert.rejects(withCleanupLock(client, async () => { events.push('storage'); throw new Error('timeout'); }), /timeout/);
  assert.deepEqual(events, ['connect', 'lock', 'storage', 'unlock', 'end']);
});
