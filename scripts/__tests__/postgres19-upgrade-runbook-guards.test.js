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
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

const runbook = readFileSync(
  resolve(__dirname, '../../docs/deployment/POSTGRES_19_MAJOR_UPGRADE_RUNBOOK.md'),
  'utf8',
);

function bashBlock(section) {
  return runbook.split(`\n## ${section}\n`)[1].match(/```bash\n([\s\S]+?)\n```/)[1];
}

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

function assertRefused(dir, block, env = {}) {
  const before = snapshot(dir);
  const result = spawnSync('bash', ['-c', `
    set -euo pipefail
    umask 077
    sudo() { "$@"; }
    old() { : > unexpected-compose; }
    ${block}
  `], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stderr);
  assert.deepEqual(snapshot(dir), before);
}

const active = 'data/postgres';
const saved = 'data/postgres-18-preupgrade';
const archive = `${saved}.tar`;
const archiveChecksum = `${archive}.sha256`;
const checksum = (contents) => createHash('sha256').update(contents).digest('hex');

for (const [name, alter] of [
  ['wrong major', (dir) => writeFileSync(join(dir, active, 'PG_VERSION'), '19\n')],
  ['symlink at 19', (dir) => symlinkSync('missing', join(dir, active, '19'))],
  ['symlink at 19/docker', (dir) => {
    mkdirSync(join(dir, active, '19'));
    symlinkSync('missing', join(dir, active, '19/docker'));
  }],
  ['extra entry in 19', (dir) => {
    mkdirSync(join(dir, active, '19/docker'), { recursive: true });
    writeFileSync(join(dir, active, '19/other'), 'preserve');
  }],
  ['nonempty 19/docker', (dir) => {
    mkdirSync(join(dir, active, '19/docker'), { recursive: true });
    writeFileSync(join(dir, active, '19/docker/other'), 'preserve');
  }],
  ['saved directory collision', (dir) => mkdirSync(join(dir, saved))],
  ['dangling saved directory symlink', (dir) => symlinkSync('missing', join(dir, saved))],
  ['archive collision', (dir) => writeFileSync(join(dir, archive), 'existing')],
  ['dangling archive symlink', (dir) => symlinkSync('missing', join(dir, archive))],
  ['archive checksum collision', (dir) => writeFileSync(join(dir, archiveChecksum), 'existing')],
  ['dangling archive checksum symlink', (dir) => symlinkSync('missing', join(dir, archiveChecksum))],
]) {
  test(`PG18 preservation rejects ${name} without changing the cluster`, (t) => {
    const dir = fixtureDirectory(t);
    mkdirSync(join(dir, active), { recursive: true });
    writeFileSync(join(dir, active, 'PG_VERSION'), '18\n');
    writeFileSync(join(dir, active, 'control-fixture'), 'preserve');
    alter(dir);
    assertRefused(dir, preserve);
  });
}

for (const [name, alter] of [
  ['wrong active major', (dir) => writeFileSync(join(dir, active, '19/docker/PG_VERSION'), '18\n')],
  ['wrong saved major', (dir) => writeFileSync(join(dir, saved, 'PG_VERSION'), '19\n')],
  ['changed archive', (dir) => writeFileSync(join(dir, archive), 'corrupt')],
  ['rollback directory collision', (dir) => mkdirSync(join(dir, 'data/postgres-19-rollback'))],
  ['dangling rollback directory symlink', (dir) => symlinkSync('missing', join(dir, 'data/postgres-19-rollback'))],
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
    assertRefused(dir, rollback);
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
      *) : > unexpected-psql ;;
    esac
  }
  pg19() { : > unexpected-pg19; }
`;

const exactRole = 'CREATE ROLE "erp_user";\n';
for (const [name, options] of [
  ['wrong server major', { env: { FIXTURE_VERSION: '180007' } }],
  ['wrong data path', { env: { FIXTURE_DIRECTORY: '/wrong' } }],
  ['existing application database', { env: { FIXTURE_DATABASES: 'erp_db\npostgres\ntemplate0\ntemplate1' } }],
  ['missing bootstrap role', { env: { FIXTURE_ROLE: '' } }],
  ['original globals checksum mismatch', { originalChecksum: checksum('changed') }],
  ['database dump checksum mismatch', { dumpChecksum: checksum('changed') }],
  ['missing CREATE ROLE', { globals: 'CREATE ROLE "other";\n' }],
  ['duplicate CREATE ROLE', { globals: exactRole + exactRole }],
  ['alternate CREATE ROLE form', { globals: 'create role erp_user;\n' }],
  ['alternate CREATE ROLE beside exact line', { globals: exactRole + 'create role erp_user;\n' }],
  ['filtered globals checksum mismatch', { filteredChecksum: checksum('other') }],
  ['unrelated filtered contents', { filteredChecksum: checksum('changed') }],
]) {
  test(`PG19 restore rejects ${name} without executing globals or database restore`, (t) => {
    const dir = fixtureDirectory(t);
    const globals = options.globals ?? exactRole;
    writeFileSync(join(dir, 'globals.sql'), globals);
    writeFileSync(join(dir, 'erp_db.dump'), 'dump');
    writeFileSync(join(dir, 'SHA256SUMS'), [
      `${options.originalChecksum ?? checksum(globals)}  globals.sql`,
      `${options.dumpChecksum ?? checksum('dump')}  erp_db.dump`,
      '',
    ].join('\n'));
    if (options.filteredChecksum) {
      writeFileSync(join(dir, 'globals.filtered.sql'), 'changed');
      writeFileSync(join(dir, 'globals.filtered.sha256'), `${options.filteredChecksum}  globals.filtered.sql\n`);
    }
    assertRefused(dir, mockDatabase + restore, {
      FIXTURE_VERSION: '190000',
      FIXTURE_DIRECTORY: '/var/lib/postgresql/19/docker',
      FIXTURE_DATABASES: 'postgres\ntemplate0\ntemplate1',
      FIXTURE_ROLE: 'erp_user',
      ...options.env,
    });
  });
}

for (const artifact of ['erp_db.dump', 'globals.sql', 'erp_db.toc', 'SHA256SUMS']) {
  test(`a new dump preserves an existing ${artifact}`, (t) => {
    const dir = fixtureDirectory(t);
    writeFileSync(join(dir, artifact), 'existing');
    assertRefused(dir, mockDatabase + dump);
  });
  test(`a new dump preserves a dangling symlink at ${artifact}`, (t) => {
    const dir = fixtureDirectory(t);
    symlinkSync('missing', join(dir, artifact));
    assertRefused(dir, mockDatabase + dump);
  });
}
