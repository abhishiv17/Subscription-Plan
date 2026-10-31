/* eslint-disable @typescript-eslint/no-require-imports */
// Runs supabase/tests/database_test.sql against a database and checks its sentinel.
// The SQL always raises at the end, so every test row is rolled back.
// Needs SUPABASE_DB_URL (environment or .env.local): Supabase dashboard → Connect →
// Session pooler connection string, with the database password.
const { readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const { Client } = require('pg');
if (existsSync('.env.local')) process.loadEnvFile('.env.local');

const SENTINEL = 'ALL DATABASE TESTS PASSED';

(async () => {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) {
    console.log('SKIP database tests: SUPABASE_DB_URL is not set.');
    return;
  }
  const sql = readFileSync(path.join(__dirname, '..', 'supabase', 'tests', 'database_test.sql'), 'utf8');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.error('FAIL database tests: the script finished without its sentinel.');
    process.exitCode = 1;
  } catch (e) {
    if (e.message === SENTINEL) console.log('PASS ' + SENTINEL.toLowerCase() + ' (rolled back)');
    else { console.error(e.message); process.exitCode = 1; }
  } finally {
    await client.end();
  }
})();
