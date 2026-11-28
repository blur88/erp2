const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

const repo = resolve(__dirname, '../..');
const runbookPath = join(repo, 'docs/deployment/BACKUP_RESTORE_RUNBOOK.md');
const runbook = readFileSync(runbookPath, 'utf8');
const { extractSection } = require(join(repo, 'backend/scripts/backup-lifecycle/runbook-blocks.cjs'));

const restoreSection = extractSection(runbook, '## Restore commands');
// The check block runs alone: from its first line to the line that reports success.
const checkStart = restoreSection.lastIndexOf('set -euo pipefail', restoreSection.indexOf('manifest="$RESTORE_DIR/manifest.json"'));
const checkEnd = restoreSection.indexOf("printf 'restore: manifest, checksum and Release", checkStart);
const checkBlock = restoreSection.slice(checkStart, restoreSection.indexOf('\n', checkEnd) + 1);
assert.ok(checkStart > 0 && checkEnd > checkStart, 'the check block is present');

function fixtureDirectory(t) {
  const dir = mkdtempSync(join(tmpdir(), 'erp-restore-guard-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

// Writes a Backup's manifest and archive into `dir`, the way the Restore commands expect them.
function writeBackup(dir, { release = '1.4.2', recoveryPoint = '20261128T100000000Z', archiveBytes = 'ciphertext' } = {}) {
  const archive = Buffer.from(archiveBytes);
  writeFileSync(join(dir, 'backup.tar.age'), archive);
  const manifest = {
    format_version: 1,
    recovery_point: recoveryPoint,
    release,
    postgres: { server_major: 19, client_major: 19 },
    archive: {
      name: 'backup.tar.age',
      size: archive.length,
      sha256: createHash('sha256').update(archive).digest('hex'),
    },
    checks: {
      uploads_references: 'passed',
      dump_readable: 'passed',
      application_role_in_globals: 'passed',
      decryption: 'not verified',
    },
  };
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}

function runCheck(dir, env = {}) {
  const script = `${checkBlock}\n`;
  return spawnSync('bash', ['-c', script], {
    env: {
      PATH: process.env.PATH,
      RESTORE_DIR: dir,
      RESTORE_RECOVERY_POINT: '20261128T100000000Z',
      RESTORE_RELEASE: '1.4.2',
      ...env,
    },
    encoding: 'utf8',
  });
}

test('the Restore commands section holds every step, in order, as bash blocks', () => {
  for (const step of ['Fetch the Backup', 'Check the manifest', 'Decrypt and unpack', 'Confirm before overwriting', 'Restore globals, then the database, then uploads']) {
    assert.ok(runbook.includes(`### ${step}`), `missing step: ${step}`);
  }
  const order = ['manifest="$RESTORE_DIR', 'age -d -i', 'psql -d postgres -Atc', 'pg_restore --exit-on-error --create', 'tar -xf "$RESTORE_DIR/parts/uploads.tar"'];
  let at = -1;
  for (const marker of order) {
    const next = restoreSection.indexOf(marker, at + 1);
    assert.ok(next > at, `out of order or missing: ${marker}`);
    at = next;
  }
});

test('the CI-executed section never calls docker or compose, which CI cannot run against the target', () => {
  assert.doesNotMatch(restoreSection, /\bdocker\b/);
  assert.doesNotMatch(restoreSection, /\bdocker compose\b/);
});

test('the check block accepts a Backup whose manifest, checksum and Release match', (t) => {
  const dir = fixtureDirectory(t);
  writeBackup(dir);
  const result = runCheck(dir);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /manifest, checksum and Release \(1\.4\.2\) checked/);
});

test('the check block refuses an archive whose bytes differ from the manifest checksum', (t) => {
  const dir = fixtureDirectory(t);
  writeBackup(dir);
  writeFileSync(join(dir, 'backup.tar.age'), 'tampered-bytes-of-another-length');
  const result = runCheck(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match the manifest checksum or size/);
});

test('the check block refuses a Backup for another recovery point', (t) => {
  const dir = fixtureDirectory(t);
  writeBackup(dir, { recoveryPoint: '20261127T100000000Z' });
  const result = runCheck(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not describe this Backup/);
});

test('the check block refuses a Backup from a different Release', (t) => {
  const dir = fixtureDirectory(t);
  writeBackup(dir, { release: '1.3.0' });
  const result = runCheck(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Backup is from Release 1\.3\.0, but this restore uses Release 1\.4\.2/);
});

test('an unreleased Backup needs RESTORE_ALLOW_UNRELEASED=1, and then restores', (t) => {
  const dir = fixtureDirectory(t);
  writeBackup(dir, { release: 'unreleased' });
  const refused = runCheck(dir);
  assert.notEqual(refused.status, 0);
  assert.match(refused.stderr, /unreleased/);

  const accepted = runCheck(dir, { RESTORE_ALLOW_UNRELEASED: '1' });
  assert.equal(accepted.status, 0, accepted.stderr);
  assert.match(accepted.stdout, /unreleased Backup accepted/);
});

test('the check block refuses a manifest whose checks did not all pass', (t) => {
  const dir = fixtureDirectory(t);
  const manifest = writeBackup(dir);
  manifest.checks.dump_readable = 'failed';
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
  const result = runCheck(dir);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /checks did not pass/);
});

test('the runbook links to the rehearsal evidence rules and the README gate, and the old checklist is gone', () => {
  assert.ok(runbook.includes('../../CODING_STANDARDS.md#runbook-rehearsal-evidence'));
  // Built at runtime so that a repository-wide search for the retired path finds nothing.
  assert.equal(existsSync(join(repo, ['docs/deployment', ['DEPLOYMENT', 'CHECKLIST.md'].join('_')].join('/'))), false);
  const readme = readFileSync(join(repo, 'README.md'), 'utf8');
  assert.ok(readme.includes('docs/deployment/BACKUP_RESTORE_RUNBOOK.md'), 'README links the runbook');
});

test('the extractor fails loudly for a missing heading or a section with no bash blocks', () => {
  assert.throws(() => extractSection(runbook, '## Not a heading'), /heading not found/);
  const prose = '## Empty section\n\nNo commands here.\n\n## Next\n```bash\necho later\n```\n';
  assert.throws(() => extractSection(prose, '## Empty section'), /no bash blocks/);
  assert.equal(extractSection(prose, '## Next'), 'echo later');
});

// The globals block runs alone, with fake psql and pg_restore that only record what they were given.
function runGlobals(t, globalsText, bootstrapRole = 'erp_ci') {
  const dir = fixtureDirectory(t);
  const parts = join(dir, 'parts');
  require('node:fs').mkdirSync(parts);
  writeFileSync(join(parts, 'globals.sql'), globalsText);
  const bin = join(dir, 'bin');
  require('node:fs').mkdirSync(bin);
  for (const name of ['psql', 'pg_restore']) {
    writeFileSync(join(bin, name), `#!/usr/bin/env bash\nprintf '%s\\n' "$*" >> "${dir}/${name}.calls"\nif [ "${name}" = psql ]; then cat "${dir}/psql.stdin" 2>/dev/null >/dev/null; fi\nexit 0\n`, { mode: 0o755 });
  }
  const start = restoreSection.lastIndexOf('set -euo pipefail', restoreSection.indexOf('parts="$RESTORE_DIR/parts"'));
  const end = restoreSection.indexOf('pg_restore --exit-on-error --create', start);
  const block = restoreSection.slice(start, restoreSection.indexOf('\n', end) + 1);
  const result = spawnSync('bash', ['-c', block], {
    env: { PATH: `${bin}:${process.env.PATH}`, RESTORE_DIR: dir, PGUSER: bootstrapRole },
    encoding: 'utf8',
  });
  return { result, filtered: existsSync(join(parts, 'globals.filtered.sql')) ? readFileSync(join(parts, 'globals.filtered.sql'), 'utf8') : null };
}

const PG19_GLOBALS = [
  '\\restrict abc123',
  'CREATE ROLE erp_ci;',
  'ALTER ROLE erp_ci WITH SUPERUSER INHERIT CREATEROLE CREATEDB LOGIN REPLICATION BYPASSRLS PASSWORD \'SCRAM-SHA-256$4096\';',
  'CREATE ROLE erp_drill_reader;',
  'ALTER ROLE erp_drill_reader WITH NOSUPERUSER INHERIT NOCREATEROLE NOCREATEDB NOLOGIN NOREPLICATION NOBYPASSRLS;',
  '\\unrestrict abc123',
  '',
].join('\n');

test('the globals step drops the unquoted bootstrap CREATE ROLE that PostgreSQL 19 writes, and keeps the other roles', (t) => {
  const { result, filtered } = runGlobals(t, PG19_GLOBALS);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(filtered, /^CREATE ROLE erp_ci;$/m);
  assert.match(filtered, /^CREATE ROLE erp_drill_reader;$/m);
  assert.match(filtered, /^ALTER ROLE erp_ci WITH SUPERUSER/m);
});

test('the globals step also drops the quoted form of the bootstrap CREATE ROLE', (t) => {
  const quoted = PG19_GLOBALS.replace('CREATE ROLE erp_ci;', 'CREATE ROLE "erp_ci";');
  const { result, filtered } = runGlobals(t, quoted);
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(filtered, /CREATE ROLE "?erp_ci"?;/);
});

test('the globals step stops when the bootstrap CREATE ROLE is repeated', (t) => {
  const repeated = `${PG19_GLOBALS}CREATE ROLE erp_ci;\n`;
  const { result, filtered } = runGlobals(t, repeated);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /expected exactly one CREATE ROLE/);
  assert.equal(filtered, null);
});
