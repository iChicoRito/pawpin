const assert = require('node:assert/strict');
const fs = require('node:fs');
const { createClient } = require('./database-test-client.cjs');

function body(file) {
  return fs.readFileSync(file, 'utf8').replace(/^begin;$/m, '').replace(/\n(?:commit|rollback);\s*$/, '');
}

(async () => {
  const client = createClient();
  try {
    await client.connect();
    const original = (await client.query(`select
      to_regclass('public.report_uploads') is not null as reservations,
      to_regclass('public.report_upload_settings') is not null as enforcement`)).rows[0];
    await client.query('begin');
    if (!original.reservations) await client.query(body('supabase/migrations/0026_report_upload_safety.sql'));
    if (!original.enforcement) await client.query(body('supabase/migrations/0027_report_upload_enforcement.sql'));
    await client.query(body('supabase/tests/production-upload-reservations.sql'));
    await client.query(body('supabase/tests/production-storage.sql'));
    await client.query('rollback');
    const after = (await client.query(`select
      to_regclass('public.report_uploads') is not null as reservations,
      to_regclass('public.report_upload_settings') is not null as enforcement`)).rows[0];
    assert.deepEqual(after, original, 'Staged schema must be rolled back');
    console.log('PASS: reservation and Storage enforcement SQL suites; schema, settings and fixtures rolled back');
  } finally {
    await client.query('rollback').catch(() => {});
    await client.end();
  }
})().catch((error) => {
  console.error('Upload database checks failed:', error.code || error.name);
  if (['P0001', '23514'].includes(error.code)) console.error('Assertion:', error.message);
  process.exitCode = 1;
});
