#!/usr/bin/env node
// Leak-check helper for issue #1204. All database logic lives here; the bash
// orchestrator only sequences these commands.
//
// .mjs on purpose: backend/package.json has no "type": "module", so a .js
// file here would be loaded as CommonJS and `import` would throw.

import pg from 'pg';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

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

export const BASELINE_TABLE = 'e2e_leakcheck_baseline';
export const BASELINE_FORMAT_VERSION = 1;
export const MAX_EXAMPLES = 10;

// Best-effort human labels. First match wins, so a row prints as something a
// person can recognise instead of a bare uuid.
export const LABEL_COLUMNS = [
  'code',
  'number',
  'username',
  'sku',
  'reference',
  'name',
];

// Length-prefixed so composite keys cannot collide: ["a","b"] and ["a|b"]
// must be different identities.
//
// The NUL sentinel distinguishes a SQL NULL from the literal string
// "null". Keep it as the textual escape \u0000 — a raw NUL byte in a
// source file makes tools treat the file as binary.
export function identityKey(values) {
  return values
    .map((v) => {
      const s = v === null || v === undefined ? '\u0000null' : String(v);
      return `${s.length}:${s}`;
    })
    .join('|');
}

// Order-independent: the set of applied migrations is what matters, not the
// order pg happened to return them in.
export function migrationFingerprint(rows) {
  const canonical = rows
    .map((r) => `${r.timestamp}:${r.name}`)
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export function diffSnapshots(baseline, current) {
  const tables = [];
  const unsupportedTables = [];
  const names = new Set([...Object.keys(baseline), ...Object.keys(current)]);

  for (const table of [...names].sort()) {
    const b = baseline[table] ?? { rows: [] };
    const c = current[table] ?? { rows: [] };

    if (b.unsupported || c.unsupported) {
      unsupportedTables.push(table);
      continue;
    }

    const bById = new Map(b.rows.map((r) => [r.id, r]));
    const cById = new Map(c.rows.map((r) => [r.id, r]));

    const added = c.rows.filter((r) => !bById.has(r.id));
    // Labels for removed rows come from the baseline — the row no longer
    // exists, so a live lookup would return nothing.
    const removed = b.rows.filter((r) => !cById.has(r.id));

    if (added.length === 0 && removed.length === 0) continue;

    tables.push({
      table,
      added: added.slice(0, MAX_EXAMPLES),
      removed: removed.slice(0, MAX_EXAMPLES),
      addedTotal: added.length,
      removedTotal: removed.length,
    });
  }

  return { tables, unsupportedTables, hasDrift: tables.length > 0 };
}

// Connects to the target database itself, not the maintenance database.
function targetClient() {
  return new Client({
    host: env('DB_HOST', 'localhost'),
    port: parseInt(env('DB_PORT', '5432'), 10),
    user: env('DB_USERNAME', 'erp_user'),
    password: env('DB_PASSWORD', undefined),
    database: targetDb(),
  });
}

async function tableInventory(client) {
  const { rows } = await client.query(`
    SELECT c.relname AS table_name,
           COALESCE(
             (SELECT array_agg(a.attname ORDER BY k.ord)
                FROM pg_constraint pk
                CROSS JOIN LATERAL unnest(pk.conkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
               WHERE pk.conrelid = c.oid AND pk.contype = 'p'),
             ARRAY[]::name[]
           ) AS pk_columns,
           COALESCE(
             (SELECT array_agg(a.attname)
                FROM pg_attribute a
               WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped),
             ARRAY[]::name[]
           ) AS all_columns
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
     ORDER BY c.relname
  `);
  return rows;
}

export async function snapshot(client) {
  const result = {};
  for (const t of await tableInventory(client)) {
    // The baseline table describes the snapshot; it is never part of it.
    if (t.table_name === BASELINE_TABLE) continue;

    if (!t.pk_columns || t.pk_columns.length === 0) {
      // Flagged, never silently skipped — a PK-less table is a blind spot the
      // operator needs to know about.
      result[t.table_name] = { rows: [], unsupported: true };
      continue;
    }

    const labelCol = LABEL_COLUMNS.find((c) => t.all_columns.includes(c));
    const pkSel = t.pk_columns.map((c) => `"${c}"`).join(', ');
    const labelSel = labelCol ? `"${labelCol}"::text` : 'NULL::text';

    const { rows } = await client.query(
      `SELECT ${pkSel}, ${labelSel} AS __label FROM "${t.table_name}"`,
    );

    result[t.table_name] = {
      rows: rows.map((r) => ({
        id: identityKey(t.pk_columns.map((c) => r[c])),
        label: r.__label,
      })),
    };
  }
  return result;
}

async function appliedMigrations(client) {
  const { rows } = await client.query(
    'SELECT timestamp, name FROM migrations',
  );
  return rows;
}

export function formatReport(passLabel, diff) {
  const lines = [];
  if (!diff.hasDrift) {
    lines.push(`${passLabel}: no baseline drift.`);
  } else {
    lines.push(`${passLabel}: baseline drift detected.`);
    lines.push('');
    for (const t of diff.tables) {
      const parts = [];
      if (t.addedTotal) parts.push(`+${t.addedTotal}`);
      if (t.removedTotal) parts.push(`-${t.removedTotal}`);
      lines.push(`  ${t.table}: ${parts.join(' / ')}`);
      for (const r of t.added) {
        lines.push(`    + ${r.label ?? '(no label)'}  [${r.id}]`);
      }
      for (const r of t.removed) {
        lines.push(`    - ${r.label ?? '(no label)'}  [${r.id}]`);
      }
      if (t.addedTotal > t.added.length || t.removedTotal > t.removed.length) {
        lines.push(`    (examples capped at ${MAX_EXAMPLES})`);
      }
    }
    lines.push('');
    // Stated unconditionally and in the same words every time. This tool
    // compares database states and cannot attribute a row to a suite, so it
    // reports drift and lets a human attribute it.
    lines.push('  Possible causes:');
    lines.push('    - a suite left fixtures behind (the case this gate exists for)');
    lines.push(
      "    - the application's runtime seeds changed and the baseline predates",
    );
    lines.push('      them — re-run with --fresh');
    lines.push('    - the baseline was captured from a database that had');
    lines.push('      already drifted');
  }

  if (diff.unsupportedTables.length > 0) {
    lines.push('');
    lines.push(
      `  Unsupported (no primary key, not compared): ${diff.unsupportedTables.join(', ')}`,
    );
  }
  return lines.join('\n');
}

function writeReport(passLabel, text) {
  const dir = process.env.LEAKCHECK_REPORT_DIR;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  // Written as each phase completes, so diagnostics survive a later crash.
  fs.writeFileSync(path.join(dir, `${passLabel}.txt`), `${text}\n`);
}

async function cmdInit() {
  const client = targetClient();
  await client.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${BASELINE_TABLE} (
        id integer PRIMARY KEY CHECK (id = 1),
        format_version integer NOT NULL,
        migration_fingerprint text NOT NULL,
        snapshot jsonb NOT NULL,
        captured_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Never overwrite an existing baseline. An upsert here would silently
    // rebaseline — a previous run's leaked rows would become accepted state,
    // which is the exact failure this gate exists to prevent. Rebaselining is
    // only ever reachable through the explicit drop/rebuild path (--fresh),
    // which destroys the database and with it this row.
    const existing = await client.query(
      `SELECT 1 FROM ${BASELINE_TABLE} WHERE id = 1`,
    );
    if (existing.rowCount > 0) {
      console.error(
        'refusing to overwrite an existing baseline. Re-run with --fresh, ' +
          'which drops and rebuilds the database before capturing a new one.',
      );
      return EXIT_PREREQ;
    }

    const snap = await snapshot(client);

    // A snapshot containing an unsupported table cannot be a baseline: rows in
    // it would never be compared, so leaks there would be invisible while the
    // run still reported success. Incomplete verification must not exit 0.
    const unsupported = Object.entries(snap)
      .filter(([, v]) => v.unsupported)
      .map(([t]) => t);
    if (unsupported.length > 0) {
      console.error(
        `refusing to capture a baseline: these tables have no primary key ` +
          `and cannot be compared, so leaks in them would be invisible: ` +
          `${unsupported.join(', ')}`,
      );
      return EXIT_PREREQ;
    }

    const fp = migrationFingerprint(await appliedMigrations(client));
    await client.query(
      `INSERT INTO ${BASELINE_TABLE}
         (id, format_version, migration_fingerprint, snapshot)
       VALUES (1, $1, $2, $3)`,
      [BASELINE_FORMAT_VERSION, fp, JSON.stringify(snap)],
    );
    const tableCount = Object.keys(snap).length;
    console.log(`baseline captured: ${tableCount} tables, fingerprint ${fp.slice(0, 12)}`);
    return 0;
  } finally {
    await client.end();
  }
}

export async function loadBaseline(client) {
  const { rows } = await client.query(
    `SELECT format_version, migration_fingerprint, snapshot
       FROM ${BASELINE_TABLE} WHERE id = 1`,
  );
  if (rows.length === 0) return { ok: false, reason: 'no baseline recorded' };
  const row = rows[0];
  if (row.format_version !== BASELINE_FORMAT_VERSION) {
    return {
      ok: false,
      reason:
        `baseline format version ${row.format_version} != expected ` +
        `${BASELINE_FORMAT_VERSION}`,
    };
  }
  const structural = validateSnapshotShape(row.snapshot);
  if (!structural.ok) {
    return { ok: false, reason: `stored snapshot is malformed: ${structural.reason}` };
  }
  if (typeof row.migration_fingerprint !== 'string' || row.migration_fingerprint === '') {
    return { ok: false, reason: 'stored migration fingerprint is missing' };
  }
  return {
    ok: true,
    fingerprint: row.migration_fingerprint,
    snapshot: row.snapshot,
  };
}

// A structurally wrong snapshot must be a prerequisite failure, not a diff
// against garbage: diffSnapshots would treat a missing `rows` array as an
// empty table and report every real row as an addition — a fabricated finding.
export function validateSnapshotShape(snap) {
  if (snap === null || typeof snap !== 'object' || Array.isArray(snap)) {
    return { ok: false, reason: 'not an object' };
  }
  for (const [table, entry] of Object.entries(snap)) {
    if (entry === null || typeof entry !== 'object') {
      return { ok: false, reason: `"${table}" is not an object` };
    }
    if (!Array.isArray(entry.rows)) {
      return { ok: false, reason: `"${table}".rows is not an array` };
    }
    for (const r of entry.rows) {
      if (r === null || typeof r !== 'object' || typeof r.id !== 'string') {
        return { ok: false, reason: `"${table}" has a row without a string id` };
      }
    }
  }
  return { ok: true };
}

async function cmdCheck(passLabel) {
  if (!passLabel) {
    console.error('check requires a pass label, e.g. `check pass-1`');
    return EXIT_PREREQ;
  }
  const client = targetClient();
  await client.connect();
  try {
    const baseline = await loadBaseline(client);
    if (!baseline.ok) {
      console.error(`cannot check: ${baseline.reason}. Re-run with --fresh.`);
      return EXIT_PREREQ;
    }
    const diff = diffSnapshots(baseline.snapshot, await snapshot(client));
    const report = formatReport(passLabel, diff);
    console.log(report);
    writeReport(passLabel, report);

    // An unsupported table means part of the database was never compared, so
    // this run cannot claim the suites were clean. Incomplete verification
    // must never exit 0. Reported as a prerequisite failure (2), not a
    // finding (1) — nothing was found; something could not be looked at.
    if (diff.unsupportedTables.length > 0) {
      console.error(
        `incomplete verification: ${diff.unsupportedTables.length} table(s) ` +
          `have no primary key and were not compared.`,
      );
      return diff.hasDrift ? EXIT_FINDING : EXIT_PREREQ;
    }
    return diff.hasDrift ? EXIT_FINDING : 0;
  } finally {
    await client.end();
  }
}

const COMMANDS = {
  'db-exists': cmdDbExists,
  'db-create': cmdDbCreate,
  'db-drop': cmdDbDrop,
  init: cmdInit,
  check: () => cmdCheck(process.argv[3]),
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
