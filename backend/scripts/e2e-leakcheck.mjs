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
import { fileURLToPath } from 'node:url';

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
// 2: added excluded_counts (sampler tables reported, not diffed).
export const BASELINE_FORMAT_VERSION = 2;
export const MAX_EXAMPLES = 10;

// Tables with background writers that suites cannot prevent from appending.
// See snapshot(): excluded from capture, diff, and baseline.
export const EXCLUDED_TABLES = ['redis_memory_samples', 'redis_alert_state'];

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
  // jsonb_agg (not array_agg): node-pg returns a Postgres name[] column as
  // the raw text literal ("{id}") instead of a JS array, so .map on it
  // throws. jsonb is JSON-parsed by the driver, so these always arrive as
  // real arrays. Observed on a live database: pk_columns came back string.
  const { rows } = await client.query(`
    SELECT c.relname AS table_name,
           COALESCE(
             (SELECT jsonb_agg(a.attname ORDER BY k.ord)
                FROM pg_constraint pk
                CROSS JOIN LATERAL unnest(pk.conkey) WITH ORDINALITY AS k(attnum, ord)
                JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = k.attnum
               WHERE pk.conrelid = c.oid AND pk.contype = 'p'),
             '[]'::jsonb
           ) AS pk_columns,
           COALESCE(
             (SELECT jsonb_agg(a.attname)
                FROM pg_attribute a
               WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped),
             '[]'::jsonb
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
  const excludedCounts = {};
  for (const t of await tableInventory(client)) {
    // The baseline table describes the snapshot; it is never part of it.
    if (t.table_name === BASELINE_TABLE) continue;

    // Background telemetry no suite can prevent: the Redis sampler writes a
    // startup sample on every app boot (OnModuleInit) and a @Cron(EVERY_MINUTE)
    // tick in every long-lived suite app, each under a per-boot instanceId.
    // Measured: ~30 new rows per pass from ~30 suite boots. Comparing these
    // tables would fail every run, so they are excluded and documented as a
    // blind spot (spec Scope limits). No suite asserts global counts on them:
    // the redis-monitoring suite allow-lists only its own instance/run ids.
    // Counted, never diffed. A blind spot the report does not mention is one
    // nobody remembers, so the row count is captured and reported even though
    // it can never fail the gate.
    if (EXCLUDED_TABLES.includes(t.table_name)) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS n FROM "${t.table_name}"`,
      );
      excludedCounts[t.table_name] = rows[0].n;
      continue;
    }

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
  // Two separate values, deliberately not merged: `tables` is what gets stored
  // in the baseline snapshot and diffed, `excludedCounts` is display-only.
  // Folding the counts into `tables` would break validateSnapshotShape and put
  // undiffable data into the diff input.
  return { tables: result, excludedCounts };
}

async function appliedMigrations(client) {
  const { rows } = await client.query(
    'SELECT timestamp, name FROM migrations',
  );
  return rows;
}

export function formatReport(passLabel, diff, excluded) {
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

  // Always rendered, pass or fail. These tables are outside the pass/fail
  // decision entirely; showing their movement is what keeps the exclusion
  // visible to whoever reads a green report six months from now.
  if (excluded && Object.keys(excluded.current ?? {}).length > 0) {
    lines.push('');
    lines.push('  ignored (sampler, not suite-attributable):');
    for (const table of Object.keys(excluded.current).sort()) {
      const now = excluded.current[table];
      const base = excluded.baseline?.[table];
      if (typeof base === 'number') {
        const delta = now - base;
        const signed = delta > 0 ? `+${delta}` : `${delta}`;
        lines.push(`    ${table}: baseline ${base}, now ${now} (${signed})`);
      } else {
        lines.push(`    ${table}: now ${now} (no baseline count recorded)`);
      }
    }
    lines.push('    Excluded from the pass/fail decision by design.');
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
        excluded_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
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

    const { tables: snap, excludedCounts } = await snapshot(client);

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
         (id, format_version, migration_fingerprint, snapshot, excluded_counts)
       VALUES (1, $1, $2, $3, $4)`,
      [
        BASELINE_FORMAT_VERSION,
        fp,
        JSON.stringify(snap),
        JSON.stringify(excludedCounts),
      ],
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
    `SELECT format_version, migration_fingerprint, snapshot, excluded_counts
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
    excludedCounts: row.excluded_counts ?? {},
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
    const current = await snapshot(client);
    const diff = diffSnapshots(baseline.snapshot, current.tables);
    const report = formatReport(passLabel, diff, {
      baseline: baseline.excludedCounts,
      current: current.excludedCounts,
    });
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

// TypeORM records migrations.name as the CLASS name, which is
// <Name><timestamp> for a file named <timestamp>-<Name>.ts. Verified across
// all 15 current migrations: every class name ends with its filename
// timestamp, and the derived set matches the applied set exactly.
export function expectedMigrationNames(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => {
      const base = f.slice(0, -3);
      const idx = base.indexOf('-');
      const timestamp = base.slice(0, idx);
      const name = base.slice(idx + 1);
      return `${name}${timestamp}`;
    })
    .sort();
}

export function compareMigrationSets(applied, expected) {
  const a = new Set(applied);
  const e = new Set(expected);
  const pending = expected.filter((n) => !a.has(n)).sort();
  const unexpected = applied.filter((n) => !e.has(n)).sort();
  return { ok: pending.length === 0 && unexpected.length === 0, pending, unexpected };
}

function migrationsDir() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', 'src', 'database', 'migrations');
}

async function cmdVerifyReusable() {
  const client = targetClient();
  await client.connect();
  try {
    const baseline = await loadBaseline(client);
    if (!baseline.ok) {
      console.error(`not reusable: ${baseline.reason}. Re-run with --fresh.`);
      return EXIT_PREREQ;
    }

    const appliedRows = await appliedMigrations(client);

    // Comparison 1: stored vs applied. Catches a baseline describing a
    // different schema than the database now has.
    const currentFp = migrationFingerprint(appliedRows);
    if (currentFp !== baseline.fingerprint) {
      console.error(
        'not reusable: the stored baseline fingerprint does not match the ' +
          "database's applied migrations. Re-run with --fresh.",
      );
      return EXIT_PREREQ;
    }

    // Comparison 2: applied vs expected-by-checkout. This is the only one
    // that sees a newly pulled migration — comparison 1 compares the
    // database to itself and stays green.
    const cmp = compareMigrationSets(
      appliedRows.map((r) => r.name),
      expectedMigrationNames(migrationsDir()),
    );
    if (!cmp.ok) {
      if (cmp.pending.length) {
        console.error(
          `not reusable: migrations pending in this checkout but not applied ` +
            `to the database: ${cmp.pending.join(', ')}. Re-run with --fresh.`,
        );
      }
      if (cmp.unexpected.length) {
        console.error(
          `not reusable: migrations applied to the database but absent from ` +
            `this checkout: ${cmp.unexpected.join(', ')}. Re-run with --fresh.`,
        );
      }
      return EXIT_PREREQ;
    }

    // Dirty-start: the database must currently match its own baseline.
    //
    // Drift here exits 1, NOT 2. The spec assigns exit 1 to every baseline
    // difference, and this is one — rows really are unaccounted for. It stops
    // execution all the same (the orchestrator treats any non-zero here as a
    // hard stop), but the code must not misreport a real finding as a mere
    // prerequisite problem: 2 reads as "nothing was checked", and something
    // was.
    const currentSnap = await snapshot(client);
    const diff = diffSnapshots(baseline.snapshot, currentSnap.tables);
    if (diff.hasDrift) {
      const report = formatReport('dirty-start', diff, {
        baseline: baseline.excludedCounts,
        current: currentSnap.excludedCounts,
      });
      console.error(report);
      writeReport('dirty-start', report);
      console.error('');
      console.error(
        'not reusable: the retained database has drifted from its baseline. ' +
        'Re-run with --fresh. The baseline is NOT being updated.',
      );
      return EXIT_FINDING;
    }

    // An uncomparable table means part of the database is a blind spot, so
    // this run cannot certify the database as reusable — proceeding would let
    // both passes report success while leaks in that table stayed invisible.
    // Abort before either pass. Drift, if also present, has already returned
    // EXIT_FINDING above, so exit 1 is preserved for a real difference and 2
    // is reserved for "could not look".
    if (diff.unsupportedTables.length > 0) {
      console.error(
        `not reusable: these tables have no primary key and cannot be ` +
          `compared, so leaks in them would be invisible: ` +
          `${diff.unsupportedTables.join(', ')}`,
      );
      return EXIT_PREREQ;
    }

    console.log('database is reusable: baseline and migrations match.');
    return 0;
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
  'verify-reusable': cmdVerifyReusable,
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
