const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

function createClient() {
  const url = process.env.SUPABASE_TEST_DB_URL || (
    process.env.PAWPIN_ALLOW_EXISTING_TEST_DB === '1' && process.env.SUPABASE_DB_URL
  );
  if (!url) throw new Error('Configure a test URL or explicitly authorize the existing test project.');
  if (!process.env.SUPABASE_DB_CA) throw new Error('SUPABASE_DB_CA must name the downloaded root certificate.');
  const root = process.env.PATH.split(path.delimiter)
    .map((entry) => path.resolve(entry, '..'))
    .find((entry) => fs.existsSync(path.join(entry, 'pg', 'package.json')));
  if (!root) throw new Error('Run through npm exec --package=pg --call="node ...".');
  const requirePg = createRequire(path.join(root, 'pg', 'package.json'));
  const config = requirePg('pg-connection-string').parse(url);
  const { Client } = requirePg('pg');
  return new Client({
    ...config,
    connectionTimeoutMillis: 15000,
    statement_timeout: 30000,
    ssl: { rejectUnauthorized: true, ca: fs.readFileSync(process.env.SUPABASE_DB_CA, 'utf8') },
  });
}

module.exports = { createClient };

if (require.main === module) {
  (async () => {
    const file = process.argv[2];
    if (!/^supabase\/(tests|migrations)\/[\w-]+\.sql$/.test(file || '')) {
      throw new Error('Specify one repository SQL test or migration path.');
    }
    if (file.includes('/migrations/') && process.env.PAWPIN_APPLY_MIGRATIONS !== '1') {
      throw new Error('Applying a migration requires PAWPIN_APPLY_MIGRATIONS=1.');
    }
    const client = createClient();
    try {
      await client.connect();
      await client.query(fs.readFileSync(file, 'utf8'));
      console.log(`PASS: ${file} (verified TLS)`);
    } finally {
      await client.end();
    }
  })().catch((error) => {
    console.error('SQL execution failed:', error.code || error.name);
    if (['P0001', '23514'].includes(error.code)) console.error('Assertion:', error.message);
    process.exitCode = 1;
  });
}
