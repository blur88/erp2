const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

const runbook = readFileSync(
  resolve(__dirname, '../../docs/deployment/POSTGRES_19_MAJOR_UPGRADE_RUNBOOK.md'),
  'utf8',
);

function bashBlock(section, index = 0) {
  return [...runbook.split(`\n## ${section}\n`)[1].matchAll(/```bash\n([\s\S]+?)\n```/g)][index][1];
}

const inventory = bashBlock('Quiesce and inventory', 1);
const preserve = bashBlock('Preserve PG18 and initialize PG19');
const rollback = bashBlock('Roll back to PG18');
const restore = bashBlock('Restore globals, then the database');
const dump = bashBlock('Dump and validate');

function fixtureDirectory(t) {
  const dir = mkdtempSync(join(tmpdir(), 'erp-pg19-guard-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function snapshot(dir) {
  return readdirSync(dir, { recursive: true }).sort().map((name) => {
    const path = join(dir, name);
    const stat = lstatSync(path);
    const contents = stat.isSymbolicLink() ? readlinkSync(path) :
      stat.isFile() ? readFileSync(path) : null;
    return [name, stat.mode, contents];
  });
}

function execute(dir, block, env = {}) {
  const result = spawnSync('bash', ['-c', `
    set -euo pipefail
    umask 077
    sudo() {
      if [[ "$1" == chown ]]; then printf '%s\\n' "$*" > ownership-command;
      else "$@"; fi
    }
    old() { : > unexpected-compose; }
    ${block}
  `], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
  assert.ifError(result.error);
  return result;
}

function assertRefused(dir, block, diagnostic, env) {
  const before = snapshot(dir);
  const result = execute(dir, block, env);
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout + result.stderr, diagnostic);
  assert.deepEqual(snapshot(dir), before);
}

const active = 'data/postgres';
const saved = 'data/postgres-18-preupgrade';
const archive = `${saved}.tar`;
const archiveChecksum = `${archive}.sha256`;
const checksum = (contents) => createHash('sha256').update(contents).digest('hex');

for (const [name, diagnostic, alter] of [
  ['wrong major', /Active data directory must be PG18/m, (dir) => writeFileSync(join(dir, active, 'PG_VERSION'), '19\n')],
  ['symlink at 19', /19 must not be a symlink/m, (dir) => symlinkSync('missing', join(dir, active, '19'))],
  ['symlink at 19/docker', /19\/docker must not be a symlink/m, (dir) => {
    mkdirSync(join(dir, active, '19'));
    symlinkSync('missing', join(dir, active, '19/docker'));
  }],
  ['extra entry in 19', /Unexpected entries in 19/m, (dir) => {
    mkdirSync(join(dir, active, '19/docker'), { recursive: true });
    writeFileSync(join(dir, active, '19/other'), 'preserve');
  }],
  ['nonempty 19/docker', /19\/docker must be empty/m, (dir) => {
    mkdirSync(join(dir, active, '19/docker'), { recursive: true });
    writeFileSync(join(dir, active, '19/docker/other'), 'preserve');
  }],
  ['saved directory collision', /Preservation destination already exists: .+postgres-18-preupgrade$/m, (dir) => mkdirSync(join(dir, saved))],
  ['dangling saved directory symlink', /Preservation destination already exists: .+postgres-18-preupgrade$/m, (dir) => symlinkSync('missing', join(dir, saved))],
  ['archive collision', /Preservation destination already exists: .+preupgrade\.tar$/m, (dir) => writeFileSync(join(dir, archive), 'existing')],
  ['dangling archive symlink', /Preservation destination already exists: .+preupgrade\.tar$/m, (dir) => symlinkSync('missing', join(dir, archive))],
  ['archive checksum collision', /Preservation destination already exists: .+preupgrade\.tar\.sha256$/m, (dir) => writeFileSync(join(dir, archiveChecksum), 'existing')],
  ['dangling archive checksum symlink', /Preservation destination already exists: .+preupgrade\.tar\.sha256$/m, (dir) => symlinkSync('missing', join(dir, archiveChecksum))],
]) {
  test(`PG18 preservation rejects ${name} without changing the cluster`, (t) => {
    const dir = fixtureDirectory(t);
    mkdirSync(join(dir, active), { recursive: true });
    writeFileSync(join(dir, active, 'PG_VERSION'), '18\n');
    writeFileSync(join(dir, active, 'control-fixture'), 'preserve');
    alter(dir);
    assertRefused(dir, preserve, diagnostic);
  });
}

for (const [name, diagnostic, alter] of [
  ['wrong active major', /Active data directory must be PG19/m, (dir) => writeFileSync(join(dir, active, '19/docker/PG_VERSION'), '18\n')],
  ['wrong saved major', /Saved data directory must be PG18/m, (dir) => writeFileSync(join(dir, saved, 'PG_VERSION'), '19\n')],
  ['changed archive', /postgres-18-preupgrade\.tar: FAILED/m, (dir) => writeFileSync(join(dir, archive), 'corrupt')],
  ['rollback directory collision', /Rollback destination already exists/m, (dir) => mkdirSync(join(dir, 'data/postgres-19-rollback'))],
  ['dangling rollback directory symlink', /Rollback destination already exists/m, (dir) => symlinkSync('missing', join(dir, 'data/postgres-19-rollback'))],
]) {
  test(`PG18 rollback rejects ${name} without moving either cluster`, (t) => {
    const dir = fixtureDirectory(t);
    mkdirSync(join(dir, active, '19/docker'), { recursive: true });
    mkdirSync(join(dir, saved));
    writeFileSync(join(dir, active, '19/docker/PG_VERSION'), '19\n');
    writeFileSync(join(dir, saved, 'PG_VERSION'), '18\n');
    writeFileSync(join(dir, archive), 'pristine');
    writeFileSync(join(dir, archiveChecksum), `${checksum('pristine')}  ./${archive}\n`);
    alter(dir);
    assertRefused(dir, rollback, diagnostic);
  });
}

const mockDatabase = `
  recovery="$PWD"
  pg_sql() {
    case "$*" in
      *server_version_num*) printf '%s\\n' "$FIXTURE_VERSION" ;;
      *data_directory*) printf '%s\\n' "$FIXTURE_DIRECTORY" ;;
      *datname*) printf '%s\\n' "$FIXTURE_DATABASES" ;;
      *rolname*) printf '%s\\n' "$FIXTURE_ROLE" ;;
      *)
        printf 'psql %s\\n' "$*" >> restore-calls
        cat > restored-globals
        ;;
    esac
  }
  pg19() {
    printf '%s\\n' "$*" >> restore-calls
    cat > restored-dump
  }
`;

const databaseFixture = {
  FIXTURE_VERSION: '190000',
  FIXTURE_DIRECTORY: '/var/lib/postgresql/19/docker',
  FIXTURE_DATABASES: 'postgres\ntemplate0\ntemplate1',
  FIXTURE_ROLE: 'erp_user',
};

function writeDumps(dir, globals, options = {}) {
  writeFileSync(join(dir, 'globals.sql'), globals);
  writeFileSync(join(dir, 'erp_db.dump'), 'dump');
  writeFileSync(join(dir, 'SHA256SUMS'), [
    `${options.originalChecksum ?? checksum(globals)}  globals.sql`,
    `${options.dumpChecksum ?? checksum('dump')}  erp_db.dump`,
    '',
  ].join('\n'));
}

const exactRole = 'CREATE ROLE "erp_user";\n';
for (const [name, diagnostic, options] of [
  ['wrong server major', /Restore target must be PG19/, { env: { FIXTURE_VERSION: '180007' } }],
  ['wrong data path', /Unexpected PG19 data directory/, { env: { FIXTURE_DIRECTORY: '/wrong' } }],
  ['existing application database', /Restore target must contain only maintenance and template databases/, { env: { FIXTURE_DATABASES: 'erp_db\npostgres\ntemplate0\ntemplate1' } }],
  ['missing bootstrap role', /erp_user must be a bootstrap superuser/, { env: { FIXTURE_ROLE: '' } }],
  ['original globals checksum mismatch', /globals\.sql: FAILED/, { originalChecksum: checksum('changed') }],
  ['database dump checksum mismatch', /erp_db\.dump: FAILED/, { dumpChecksum: checksum('changed') }],
  ['missing CREATE ROLE', /Expected exactly one canonical CREATE ROLE/, { globals: 'CREATE ROLE "other";\n' }],
  ['duplicate CREATE ROLE', /Expected exactly one canonical CREATE ROLE/, { globals: exactRole + exactRole }],
  ['alternate CREATE ROLE form', /Expected exactly one canonical CREATE ROLE/, { globals: 'create role erp_user;\n' }],
  ['alternate CREATE ROLE beside exact line', /Expected exactly one canonical CREATE ROLE/, { globals: exactRole + 'create role erp_user;\n' }],
  ['filtered globals checksum mismatch', /globals\.filtered\.sql: FAILED/, { filteredChecksum: checksum('other') }],
  ['unrelated filtered contents', /Filtered globals differ from the exact role filter/, { filteredChecksum: checksum('changed') }],
]) {
  test(`PG19 restore rejects ${name} without executing globals or database restore`, (t) => {
    const dir = fixtureDirectory(t);
    const globals = options.globals ?? exactRole;
    writeDumps(dir, globals, options);
    if (options.filteredChecksum) {
      writeFileSync(join(dir, 'globals.filtered.sql'), 'changed');
      writeFileSync(join(dir, 'globals.filtered.sha256'), `${options.filteredChecksum}  globals.filtered.sql\n`);
    }
    assertRefused(dir, mockDatabase + restore, diagnostic, { ...databaseFixture, ...options.env });
  });
}

for (const artifact of ['erp_db.dump', 'globals.sql', 'erp_db.toc', 'SHA256SUMS']) {
  test(`a new dump preserves an existing ${artifact}`, (t) => {
    const dir = fixtureDirectory(t);
    writeFileSync(join(dir, artifact), 'existing');
    assertRefused(dir, mockDatabase + dump, /Recovery artifact already exists/);
  });
  test(`a new dump preserves a dangling symlink at ${artifact}`, (t) => {
    const dir = fixtureDirectory(t);
    symlinkSync('missing', join(dir, artifact));
    assertRefused(dir, mockDatabase + dump, /Recovery artifact already exists/);
  });
}

test('a fresh dump creates private recovery artifacts and a rerun preserves them', (t) => {
  const dir = fixtureDirectory(t);
  const database = `
    recovery="$PWD"
    pg19() {
      case "$1" in
        pg_dump) printf 'fixture dump\\n' ;;
        pg_dumpall) printf 'fixture globals\\n' ;;
        pg_restore) cat ;;
        *) return 2 ;;
      esac
    }
  `;
  const result = execute(dir, database + dump);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /erp_db.dump: OK/);
  assert.match(result.stdout, /globals.sql: OK/);
  for (const artifact of ['erp_db.dump', 'globals.sql', 'erp_db.toc', 'SHA256SUMS']) {
    assert.equal(lstatSync(join(dir, artifact)).mode & 0o777, 0o600);
  }
  assertRefused(dir, database + dump, /Recovery artifact already exists: erp_db.dump/);
});

test('preservation removes only empty PG19 directories and archives the PG18 data', (t) => {
  const dir = fixtureDirectory(t);
  mkdirSync(join(dir, active, '19/docker'), { recursive: true });
  writeFileSync(join(dir, active, 'PG_VERSION'), '18\n');
  writeFileSync(join(dir, active, 'control-fixture'), 'preserve');
  const result = execute(dir, preserve);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /postgres-18-preupgrade.tar: OK/);
  assert.deepEqual(readdirSync(join(dir, saved)).sort(), ['PG_VERSION', 'control-fixture']);
  assert.deepEqual(readdirSync(join(dir, active)), []);
  assert.equal(readFileSync(join(dir, 'ownership-command'), 'utf8'), 'chown 70:70 ./data/postgres\n');
  assert.equal(lstatSync(join(dir, archive)).mode & 0o777, 0o600);
});

test('restore writes the exact filtered globals once and reuses them on a fresh retry', (t) => {
  const dir = fixtureDirectory(t);
  const grants = 'ALTER ROLE "erp_user" WITH SUPERUSER;\nCREATE ROLE "rehearsal_reader";\n';
  const original = exactRole + grants;
  writeDumps(dir, original);
  const filtered = join(dir, 'globals.filtered.sql');
  const filteredChecksum = join(dir, 'globals.filtered.sha256');

  for (const retry of [false, true]) {
    const result = execute(dir, mockDatabase + restore, databaseFixture);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(join(dir, 'globals.sql'), 'utf8'), original);
    assert.equal(readFileSync(filtered, 'utf8'), grants);
    assert.equal(readFileSync(filteredChecksum, 'utf8'), `${checksum(grants)}  globals.filtered.sql\n`);
    assert.equal(
      readFileSync(join(dir, 'restore-calls'), 'utf8'),
      'psql -d postgres --single-transaction -f -\n' +
      'pg_restore --exit-on-error --create -h postgres -U erp_user -d postgres\n',
    );
    assert.equal(readFileSync(join(dir, 'restored-globals'), 'utf8'), grants);
    assert.equal(readFileSync(join(dir, 'restored-dump'), 'utf8'), 'dump');
    const earlier = 946684800;
    if (retry) {
      for (const file of [filtered, filteredChecksum]) {
        assert.equal(lstatSync(file).mtimeMs, earlier * 1000);
      }
    } else {
      for (const file of [filtered, filteredChecksum]) utimesSync(file, earlier, earlier);
      for (const file of ['restore-calls', 'restored-globals', 'restored-dump']) rmSync(join(dir, file));
    }
  }
});

test('rollback sets PG19 aside, restarts PG18, and preserves the archive', (t) => {
  const dir = fixtureDirectory(t);
  mkdirSync(join(dir, active, '19/docker'), { recursive: true });
  mkdirSync(join(dir, saved));
  writeFileSync(join(dir, active, '19/docker/PG_VERSION'), '19\n');
  writeFileSync(join(dir, saved, 'PG_VERSION'), '18\n');
  writeFileSync(join(dir, archive), 'pristine');
  const digest = `${checksum('pristine')}  ./${archive}\n`;
  writeFileSync(join(dir, archiveChecksum), digest);
  const result = execute(dir, `old() { printf '%s\\n' "$*" >> compose-calls; }\n` + rollback);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(join(dir, active, 'PG_VERSION'), 'utf8'), '18\n');
  assert.equal(readFileSync(join(dir, 'data/postgres-19-rollback/19/docker/PG_VERSION'), 'utf8'), '19\n');
  assert.equal(readFileSync(join(dir, archive), 'utf8'), 'pristine');
  assert.equal(readFileSync(join(dir, archiveChecksum), 'utf8'), digest);
  assert.equal(readFileSync(join(dir, 'compose-calls'), 'utf8'), 'up -d --wait postgres\nup -d backend\n');
});

test('the PG18 inventory stops on an unexpected database before cutover', (t) => {
  const dir = fixtureDirectory(t);
  mkdirSync(join(dir, active), { recursive: true });
  writeFileSync(join(dir, active, 'PG_VERSION'), '18\n');
  const before = snapshot(dir);
  const mock = `
    recovery="$PWD"
    pg_sql() { printf '%s\\n' erp_db erp_gate_candidate erp_gate_reference \
      postgres template0 template1 unexpected_db; }
  `;
  const result = execute(dir, mock + inventory + '\nprintf cutover > cutover-started');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, /^\+unexpected_db$/m);
  assert.deepEqual(snapshot(dir).filter(([file]) => file !== 'databases.before'), before);
});
