const fs = require('node:fs');
const { createClient } = require('./database-test-client.cjs');

(async () => {
  const client = createClient();
  try {
    await client.connect();
    await client.query('begin read only');
    const results = await client.query(fs.readFileSync('supabase/tests/production-release-preflight.sql', 'utf8'));
    for (const result of results) console.log(JSON.stringify(result.rows));
    await client.query('rollback');
    console.log('PASS: read-only release inventory; not production acceptance');
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error('Release inventory failed:', error.code || error.name);
  process.exitCode = 1;
});
