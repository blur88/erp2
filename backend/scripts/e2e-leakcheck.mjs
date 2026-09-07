#!/usr/bin/env node
// Leak-check helper for issue #1204. All database logic lives here; the bash
// orchestrator only sequences these commands.
//
// .mjs on purpose: backend/package.json has no "type": "module", so a .js
// file here would be loaded as CommonJS and `import` would throw.

import pg from 'pg';

const { Client } = pg;

// The one database this tool may destroy. The _test suffix alone is NOT a
// sufficient guard: it also matches erp_db_test, the normal e2e database.
export const LEAKCHECK_DB = 'erp_db_leakcheck_test';

const EXIT_FINDING = 1;
const EXIT_PREREQ = 2;

function env(name, fallback) {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function targetDb() {
  return env('DB_DATABASE', '');
}

// Connects to the `postgres` maintenance database — you cannot drop or create
// the database you are connected to.
function adminClient() {
  return new Client({
    host: env('DB_HOST', 'localhost'),
    port: parseInt(env('DB_PORT', '5432'), 10),
    user: env('DB_USERNAME', 'erp_user'),
    password: env('DB_PASSWORD', undefined),
    database: 'postgres',
  });
}

function assertDroppable(name) {
  if (name !== LEAKCHECK_DB) {
    console.error(
      `refusing to drop database "${name}": this tool only ever drops ` +
        `"${LEAKCHECK_DB}". A _test suffix is not sufficient — it would also ` +
        `match erp_db_test, the normal e2e database.`,
    );
    process.exit(EXIT_PREREQ);
  }
}

async function dbExists(client, name) {
  const r = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [
    name,
  ]);
  return r.rowCount > 0;
}

async function cmdDbExists() {
  const client = adminClient();
  await client.connect();
  try {
    return (await dbExists(client, targetDb())) ? 0 : 1;
  } finally {
    await client.end();
  }
}

async function cmdDbCreate() {
  const name = targetDb();
  const owner = env('DB_USERNAME', 'erp_user');
  const client = adminClient();
  await client.connect();
  try {
    if (await dbExists(client, name)) return 0;
    // Identifiers cannot be parameterized; these come from env, not user input.
    await client.query(`CREATE DATABASE "${name}" OWNER "${owner}"`);
    // Mirrors jest-e2e-global-setup.js so date-sensitive suites behave the same.
    await client.query(
      `ALTER DATABASE "${name}" SET timezone = 'America/Los_Angeles'`,
    );
    return 0;
  } finally {
    await client.end();
  }
}

async function cmdDbDrop() {
  const name = targetDb();
  assertDroppable(name);
  const client = adminClient();
  await client.connect();
  try {
    // A leftover connection makes DROP DATABASE fail, and a previous pass may
    // have left one behind.
    await client.query(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = $1 AND pid <> pg_backend_pid()`,
      [name],
    );
    await client.query(`DROP DATABASE IF EXISTS "${name}"`);
    return 0;
  } finally {
    await client.end();
  }
}

const COMMANDS = {
  'db-exists': cmdDbExists,
  'db-create': cmdDbCreate,
  'db-drop': cmdDbDrop,
};

async function main() {
  const cmd = process.argv[2];
  const fn = COMMANDS[cmd];
  if (!fn) {
    console.error(
      `unknown subcommand "${cmd ?? '(none)'}". ` +
        `Known: ${Object.keys(COMMANDS).join(', ')}`,
    );
    process.exit(EXIT_PREREQ);
  }
  process.exit(await fn());
}

// Guard so the unit spec can import LEAKCHECK_DB without running a command.
if (process.argv[1] && process.argv[1].endsWith('e2e-leakcheck.mjs')) {
  main().catch((err) => {
    console.error(`e2e-leakcheck: ${err.message}`);
    process.exit(EXIT_PREREQ);
  });
}
