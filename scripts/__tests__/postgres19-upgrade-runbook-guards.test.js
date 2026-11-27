const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  realpathSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

const runbookPath = resolve(__dirname, '../../docs/deployment/POSTGRES_19_MAJOR_UPGRADE_RUNBOOK.md');
const runbook = readFileSync(runbookPath, 'utf8');

function bashBlock(heading) {
  return runbook.split(`\n${heading}\n`)[1].match(/```bash\n([\s\S]+?)\n```/)[1];
}

const inventory = bashBlock('### Source database inventory');
const preserve = bashBlock('## Preserve PG18 and initialize PG19');
const rollback = bashBlock('## Roll back to PG18');
const restore = bashBlock('## Restore globals, then the database');
const dump = bashBlock('## Dump and validate');

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

test('a fresh dump creates recovery artifacts and a rerun preserves them', (t) => {
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
  assert.match(result.stdout, /erp_db\.dump: OK/);
  assert.match(result.stdout, /globals\.sql: OK/);
  assertRefused(dir, database + dump, /Recovery artifact already exists: erp_db.dump/);
});

test('preservation removes only empty PG19 directories and archives the PG18 data', (t) => {
  const dir = fixtureDirectory(t);
  mkdirSync(join(dir, active, '19/docker'), { recursive: true });
  writeFileSync(join(dir, active, 'PG_VERSION'), '18\n');
  writeFileSync(join(dir, active, 'control-fixture'), 'preserve');
  const result = execute(dir, preserve);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /postgres-18-preupgrade\.tar: OK/);
  assert.deepEqual(readdirSync(join(dir, saved)).sort(), ['PG_VERSION', 'control-fixture']);
  assert.deepEqual(readdirSync(join(dir, active)), []);
  assert.equal(readFileSync(join(dir, 'ownership-command'), 'utf8'), 'chown 70:70 ./data/postgres\n');
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
  assert.equal(readFileSync(join(dir, 'compose-calls'), 'utf8'), 'up -d --wait --renew-anon-volumes postgres\nup -d backend\n');
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

// Operator handoff: the preparing shell generates scripts from the runbook, and
// each script runs in a separate process that inherits none of that shell's state.
const handoffHeading = '### Operator handoff for root blocks';
const oldDefinition = bashBlock('## Quiesce and inventory').match(/^old\(\) \{.*\}$/m)[0];

const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;

function shim(f, name, body) {
  writeFileSync(join(f.bin, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
}

function calls(f, name) {
  const path = join(f.dir, name);
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function handoffFixture(t) {
  const dir = fixtureDirectory(t);
  const f = {
    dir,
    deployment: join(dir, 'deployment dir'),
    recovery: join(dir, 'recovery'),
    bin: join(dir, 'bin'),
  };
  for (const path of [join(f.deployment, active), f.recovery, f.bin]) mkdirSync(path, { recursive: true });
  writeFileSync(join(f.deployment, active, 'PG_VERSION'), '18\n');
  writeFileSync(join(f.deployment, active, 'control-fixture'), 'preserve');
  shim(f, 'sudo', `[[ $1 == -v ]] && exit 0
if [[ $1 == chown ]]; then printf '%s\\n' "$*" >> ${quote(join(dir, 'chown-calls'))}; exit 0; fi
exec "$@"`);
  shim(f, 'docker', `printf '%s\\n' "$*" >> ${quote(join(dir, 'docker-calls'))}
case "$*" in
  *' config') printf 'database: %s\\n' "\${DATABASE_NAME:-erp_db}" ;;
  *' ps -aq postgres') printf 'postgres-container\\n' ;;
esac`);
  return f;
}

function prepareHandoff(f, { session = {}, runbookFile = runbookPath, env = {} } = {}) {
  const names = {
    project: 'erp-fixture',
    old_file: 'compose.old.yml',
    recovery: f.recovery,
    runbook: runbookFile,
    ...session,
  };
  const assignments = Object.entries(names)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => `${name}=${quote(value)}`);
  const definition = 'old' in session ? '' : oldDefinition;
  const result = spawnSync(
    'bash',
    ['-c', ['set -euo pipefail', ...assignments, definition, bashBlock(handoffHeading)].join('\n')],
    { cwd: f.deployment, encoding: 'utf8', env: { PATH: `${f.bin}:${process.env.PATH}`, ...env } },
  );
  assert.ifError(result.error);
  return result;
}

// Runs the command the handoff printed for one script, the way the maintainer
// would: another directory, a clean environment, and errexit on in their shell.
function runInOperatorTerminal(f, handoff, name) {
  const command = handoff.stdout.split('\n')
    .find((line) => line.startsWith('bash ') && line.includes(`/${name}.sh `));
  assert.ok(command, `no handoff command for ${name}:\n${handoff.stdout}`);
  const result = spawnSync(
    'bash',
    ['--noprofile', '--norc', '-c', `set -e\numask 022\n${command}\necho terminal-still-open`],
    { cwd: f.dir, encoding: 'utf8', env: { PATH: `${f.bin}:${process.env.PATH}` } },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^terminal-still-open$/m);
  return result;
}

// Forgets the generator's own Compose calls, so tests see only the scripts' calls.
function prepared(f, options) {
  const result = prepareHandoff(f, options);
  assert.equal(result.status, 0, result.stderr);
  rmSync(join(f.dir, 'docker-calls'), { force: true });
  return result;
}

test('a failed archive after the PG18 rename stops initialization and keeps the saved cluster', (t) => {
  const f = handoffFixture(t);
  shim(f, 'tar', 'printf partial; exit 2');
  const result = runInOperatorTerminal(f, prepared(f), 'preserve');
  assert.match(result.stdout, /^STOPPED: exit 2$/m);
  assert.deepEqual(readdirSync(join(f.deployment, saved)).sort(), ['PG_VERSION', 'control-fixture']);
  assert.equal(readFileSync(join(f.deployment, saved, 'control-fixture'), 'utf8'), 'preserve');
  assert.equal(existsSync(join(f.deployment, active)), false);
  assert.equal(existsSync(join(f.deployment, archiveChecksum)), false);
  assert.equal(calls(f, 'chown-calls'), '');
});

const mode = (path) => lstatSync(path).mode & 0o777;

test('the handoff scripts hold the exact runbook blocks after an explicit context', (t) => {
  const f = handoffFixture(t);
  prepared(f);
  const handoff = join(f.recovery, 'handoff');
  const context = readFileSync(join(handoff, 'context.sh'), 'utf8');
  assert.ok(context.startsWith('set -euo pipefail\numask 077\ncd '), context);
  assert.match(context, /^declare -- project="erp-fixture"$/m);
  assert.match(context, /^declare -- old_file="compose\.old\.yml"$/m);
  assert.match(context, /^old \(\)/m);
  for (const [name, block] of [
    ['preserve', preserve],
    ['rollback', rollback],
    ['rollback-mounts', bashBlock('### Verify restored PG18 mounts')],
  ]) {
    assert.equal(readFileSync(join(handoff, `${name}.sh`), 'utf8'), `${context}${block}\n`);
    assert.equal(mode(join(handoff, `${name}.sh`)), 0o600);
  }
});

test('the preflight confirms Compose, the project and sudo from a separate terminal', (t) => {
  const f = handoffFixture(t);
  const handoff = prepared(f);
  shim(f, 'sudo', `printf '%s\\n' "$*" >> ${quote(join(f.dir, 'sudo-calls'))}`);
  const result = runInOperatorTerminal(f, handoff, 'preflight');
  assert.doesNotMatch(result.stdout, /STOPPED/);
  assert.equal(
    calls(f, 'docker-calls'),
    'compose -p erp-fixture -f compose.old.yml config\n' +
    'compose -p erp-fixture -f compose.old.yml ps -aq postgres\n',
  );
  assert.equal(calls(f, 'sudo-calls'), '-v\n');
});

for (const [name, diagnostic, options, alter] of [
  ['an export the operator terminal does not have', /Compose resolves differently in this terminal/,
    { env: { DATABASE_NAME: 'exported_only_here' } }, () => {}],
  ['no postgres container', /No postgres container/, {}, (f) => shim(f, 'docker',
    `case "$*" in *' config') printf 'database: erp_db\\n' ;; esac`)],
  ['an unreachable Docker daemon', /daemon unreachable/, {}, (f) => shim(f, 'docker',
    `case "$*" in *' config') printf 'database: erp_db\\n' ;; *) echo 'daemon unreachable' >&2; exit 1 ;; esac`)],
  ['no sudo access', /not in sudoers/, {}, (f) => shim(f, 'sudo', `echo 'not in sudoers' >&2; exit 1`)],
]) {
  test(`the preflight stops on ${name}`, (t) => {
    const f = handoffFixture(t);
    const handoff = prepared(f, options);
    alter(f);
    const before = snapshot(f.deployment);
    const result = runInOperatorTerminal(f, handoff, 'preflight');
    assert.match(result.stdout, /^STOPPED: exit 1$/m);
    assert.match(result.stderr, diagnostic);
    assert.deepEqual(snapshot(f.deployment), before);
  });
}

test('preservation runs from a separate terminal with its own umask and directory', (t) => {
  const f = handoffFixture(t);
  const result = runInOperatorTerminal(f, prepared(f), 'preserve');
  assert.doesNotMatch(result.stdout, /STOPPED/);
  assert.match(result.stdout, /postgres-18-preupgrade\.tar: OK/);
  assert.deepEqual(readdirSync(join(f.deployment, saved)).sort(), ['PG_VERSION', 'control-fixture']);
  assert.deepEqual(readdirSync(join(f.deployment, active)), []);
  assert.equal(mode(join(f.deployment, archive)), 0o600);
  assert.equal(mode(join(f.deployment, archiveChecksum)), 0o600);
  assert.equal(calls(f, 'chown-calls'), 'chown 70:70 ./data/postgres\n');
});

function cutOverFixture(t) {
  const f = handoffFixture(t);
  const handoff = prepared(f);
  runInOperatorTerminal(f, handoff, 'preserve');
  mkdirSync(join(f.deployment, active, '19/docker'), { recursive: true });
  writeFileSync(join(f.deployment, active, '19/docker/PG_VERSION'), '19\n');
  return { f, handoff };
}

test('rollback runs from a separate terminal with the handed-over Compose function', (t) => {
  const { f, handoff } = cutOverFixture(t);
  const result = runInOperatorTerminal(f, handoff, 'rollback');
  assert.doesNotMatch(result.stdout, /STOPPED/);
  assert.equal(readFileSync(join(f.deployment, active, 'PG_VERSION'), 'utf8'), '18\n');
  assert.equal(
    readFileSync(join(f.deployment, 'data/postgres-19-rollback/19/docker/PG_VERSION'), 'utf8'),
    '19\n',
  );
  assert.equal(
    calls(f, 'docker-calls'),
    'compose -p erp-fixture -f compose.old.yml up -d --wait --renew-anon-volumes postgres\n' +
    'compose -p erp-fixture -f compose.old.yml up -d backend\n',
  );
});

test('a corrupt archive stops rollback before either cluster moves or Compose runs', (t) => {
  const { f, handoff } = cutOverFixture(t);
  writeFileSync(join(f.deployment, archive), 'corrupt');
  const before = snapshot(f.deployment);
  const result = runInOperatorTerminal(f, handoff, 'rollback');
  assert.match(result.stdout, /^STOPPED: exit 1$/m);
  assert.match(result.stdout, /postgres-18-preupgrade\.tar: FAILED/);
  assert.deepEqual(snapshot(f.deployment), before);
  assert.equal(calls(f, 'docker-calls'), '');
});

test('a failed PG18 start during rollback does not start the backend', (t) => {
  const { f, handoff } = cutOverFixture(t);
  shim(f, 'docker', `printf '%s\\n' "$*" >> ${quote(join(f.dir, 'docker-calls'))}; exit 17`);
  const result = runInOperatorTerminal(f, handoff, 'rollback');
  assert.match(result.stdout, /^STOPPED: exit 17$/m);
  assert.equal(
    calls(f, 'docker-calls'),
    'compose -p erp-fixture -f compose.old.yml up -d --wait --renew-anon-volumes postgres\n',
  );
});

function mountFixture(t, { extraMount = false } = {}) {
  const f = handoffFixture(t);
  const mounts = [
    { Type: 'volume', Name: 'parent-volume', Destination: '/var/lib/postgresql' },
    {
      Type: 'bind',
      Source: realpathSync(join(f.deployment, active)),
      Destination: '/var/lib/postgresql/data/pgdata',
    },
    ...(extraMount ? [{ Type: 'bind', Source: '/other', Destination: '/var/lib/postgresql/data' }] : []),
  ];
  writeFileSync(join(f.dir, 'inspect.json'), JSON.stringify([{ Mounts: mounts }]));
  writeFileSync(
    join(f.dir, 'volume.json'),
    JSON.stringify([{ Labels: { 'com.docker.volume.anonymous': '' } }]),
  );
  shim(f, 'docker', `case "$1 $2" in
  'compose -p') printf 'pg18-container\\n' ;;
  'inspect pg18-container') cat ${quote(join(f.dir, 'inspect.json'))} ;;
  'volume inspect') cat ${quote(join(f.dir, 'volume.json'))} ;;
  *) exit 2 ;;
esac`);
  return f;
}

test('the mount check runs from a separate terminal', (t) => {
  const f = mountFixture(t);
  const result = runInOperatorTerminal(f, prepared(f), 'rollback-mounts');
  assert.doesNotMatch(result.stdout, /STOPPED/);
  assert.match(result.stdout, /^true$/m);
});

for (const [name, diagnostic, options, alter] of [
  ['an extra mount', /Unexpected PG18 PostgreSQL mounts/, { extraMount: true }, () => {}],
  ['a nested mountpoint directory', null, {}, (f) => mkdirSync(join(f.deployment, active, 'data'))],
]) {
  test(`the mount check stops on ${name}`, (t) => {
    const f = mountFixture(t, options);
    alter(f);
    const result = runInOperatorTerminal(f, prepared(f), 'rollback-mounts');
    assert.match(result.stdout, /^STOPPED: exit 1$/m);
    if (diagnostic) assert.match(result.stderr, diagnostic);
    else assert.match(result.stdout, /^true$/m);
  });
}

function altered(f, from, to) {
  const path = join(f.dir, 'runbook.md');
  assert.ok(runbook.includes(from), from);
  writeFileSync(path, runbook.replace(from, to));
  return path;
}

const rollbackFence = `\`\`\`bash\n${rollback}\n\`\`\``;

for (const [name, diagnostic, options] of [
  ['no runbook path', /Set the path of this runbook/, { session: { runbook: undefined } }],
  ['a nonexistent runbook', /No such file or directory/, { session: { runbook: '/nonexistent/runbook.md' } }],
  ['no recovery directory name', /recovery: parameter null or not set/, { session: { recovery: undefined } }],
  ['a nonexistent recovery directory', /No such file or directory/, { session: { recovery: '/nonexistent' } }],
  ['no project', /project: parameter null or not set/, { session: { project: undefined } }],
  ['no old_file', /old_file: parameter null or not set/, { session: { old_file: undefined } }],
  ['no old() function', /old: command not found/, { session: { old: undefined } }],
  ['an existing handoff directory', /File exists/, { alter: (f) => {
    mkdirSync(join(f.recovery, 'handoff'));
    writeFileSync(join(f.recovery, 'handoff/preserve.sh'), 'earlier');
  } }],
  ['a missing section', /No bash block under ## Roll back to PG18/,
    { replace: ['\n## Roll back to PG18\n', '\n## Renamed\n'] }],
  ['a section without its block', /No bash block under ## Roll back to PG18/,
    { replace: [rollbackFence, 'The block is gone.'] }],
  ['a block that is not valid Bash', /syntax error/,
    { replace: [rollbackFence, '```bash\nif true; then\n```'] }],
]) {
  test(`handoff generation fails with ${name} and prints no command`, (t) => {
    const f = handoffFixture(t);
    options.alter?.(f);
    const runbookFile = options.replace ? altered(f, ...options.replace) : runbookPath;
    const before = snapshot(f.deployment);
    const result = prepareHandoff(f, { session: options.session, runbookFile });
    assert.notEqual(result.status, 0, result.stdout);
    assert.match(result.stderr, diagnostic);
    assert.doesNotMatch(result.stdout, /^bash /m);
    assert.deepEqual(snapshot(f.deployment), before);
    assert.match(calls(f, 'docker-calls'), /^(compose [^\n]* config\n)?$/);
    if (options.alter) {
      assert.equal(readFileSync(join(f.recovery, 'handoff/preserve.sh'), 'utf8'), 'earlier');
    }
  });
}
