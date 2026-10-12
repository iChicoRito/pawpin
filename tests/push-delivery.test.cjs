const assert = require('node:assert/strict');
const fs = require('node:fs');
const { test } = require('node:test');

const migrationPath = 'supabase/migrations/0028_push_delivery_hardening.sql';
const readMigration = () => {
  assert.ok(fs.existsSync(migrationPath), 'Inactive push preparation migration must exist');
  return fs.readFileSync(migrationPath, 'utf8');
};

test('preparation installs no sender, trigger replacement, cron schedule, or activation path', () => {
  const sql = readMigration();
  assert.doesNotMatch(sql, /net\.http_post\s*\(|cron\.schedule\s*\(|create\s+(?:or\s+replace\s+)?function\s+public\.(?:alert_nearby|notify_outcome)/i);
  assert.match(sql, /revoke all on schema push_private from public, anon, authenticated/i);
  assert.match(sql, /unique \(report_id, user_id, event_kind\)/i);
});

test('response fixtures execute production SQL classifier through verified TLS rollback runner', {
  skip: process.env.PAWPIN_RUN_PUSH_DB_TESTS !== '1',
}, async () => {
  const { run } = require('../scripts/check-push-delivery.cjs');
  assert.equal(await run(), true);
});

test('transport migration exists and installs no active cron schedule or secret literal', () => {
  const file = 'supabase/migrations/0029_push_transport.sql';
  assert.ok(fs.existsSync(file), 'Transport preparation migration must exist');
  const sql = fs.readFileSync(file, 'utf8');
  assert.match(sql, /vault\.decrypted_secrets/);
  assert.match(sql, /net\.http_post/);
  assert.match(sql, /Authorization/);
  assert.doesNotMatch(sql, /^select\s+cron\.schedule/im);
  assert.doesNotMatch(sql, /vault\.create_secret\s*\(/i);
});
