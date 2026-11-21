const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, writeFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function fixture(t, { verifyChecksum = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lint-workflows-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const command = (name, body) => writeFileSync(path.join(dir, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  command('uname', 'case "$1" in -s) echo Linux;; -m) echo "${TEST_ARCH:-x86_64}";; esac');
  command('shellcheck', 'echo "unexpected PATH ShellCheck" >&2\nexit 98');
  command('pinned-shellcheck', 'exit 0');
  command('curl', 'exit "${CURL_STATUS:-0}"');
  if (!verifyChecksum) {
    command('sha256sum', 'read -r digest archive\ncase "$archive" in */shellcheck.tar.gz) exit "${SHELLCHECK_CHECKSUM_STATUS:-0}";; esac');
  }
  command('tar', [
    'case "$5" in',
    '  actionlint) touch "$TAR_CALLED"; cp "$FIXTURE_BIN/fake-actionlint" "$4/actionlint";;',
    '  shellcheck-v0.11.0/shellcheck) touch "$FIXTURE_BIN/shellcheck-extracted"; mkdir -p "$4/shellcheck-v0.11.0"; cp "$FIXTURE_BIN/pinned-shellcheck" "$4/$5";;',
    '  *) exit 97;;',
    'esac',
  ].join('\n'));
  command('fake-actionlint', 'test "$1" = -shellcheck && test "$2" = "${0%/*}/shellcheck-v0.11.0/shellcheck" || exit 99\necho "ShellCheck enabled"\nexit "${LINT_STATUS:-0}"');
  return {
    dir, command,
    run(env = {}, cwd = path.resolve(__dirname, '../..')) {
      return spawnSync('bash', [path.resolve(__dirname, '../lint-workflows.sh')], {
        cwd, encoding: 'utf8',
        env: {
          ...process.env, PATH: `${dir}:${process.env.PATH}`,
          TAR_CALLED: path.join(dir, 'tar-called'),
          FIXTURE_BIN: dir, ...env,
        },
      });
    },
  };
}

test('download failure fails lint without extracting or executing the archive', t => {
  const f = fixture(t);
  const result = f.run({ CURL_STATUS: '22' });
  assert.equal(result.status, 22);
  assert.equal(existsSync(path.join(f.dir, 'tar-called')), false);
});

test('checksum mismatch fails lint before extracting or executing the archive', t => {
  const f = fixture(t, { verifyChecksum: true });
  f.command('curl', 'printf "corrupted archive" > "$4"');
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(path.join(f.dir, 'tar-called')), false);
});

test('a ShellCheck checksum failure stops extraction and lint', t => {
  const f = fixture(t);
  const result = f.run({ SHELLCHECK_CHECKSUM_STATUS: '1' });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(existsSync(path.join(f.dir, 'shellcheck-extracted')), false);
  assert.doesNotMatch(result.stdout, /ShellCheck enabled/);
});

test('unsupported platforms fail with a platform diagnostic', t => {
  const f = fixture(t);
  const result = f.run({ TEST_ARCH: 'aarch64' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /unsupported platform.*Linux\/aarch64/i);
});

test('lint explicitly enables ShellCheck and propagates actionlint failures', t => {
  const f = fixture(t);
  const result = f.run({ LINT_STATUS: '3' });
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stdout, /ShellCheck enabled/);
});

test('successful lint passes with ShellCheck enabled', t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ShellCheck enabled/);
});

function trackFiles(directory, trackedPaths, untrackedPaths = []) {
  for (const file of [...trackedPaths, ...untrackedPaths]) {
    const target = path.join(directory, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, '#!/bin/bash\n');
  }
  for (const args of [['init', '--template='], ['add', '-f', '--', ...trackedPaths]]) {
    const result = spawnSync('git', args, { cwd: directory, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
}

test('standalone lint checks every tracked .sh file', t => {
  const f = fixture(t);
  const trackedScripts = [
    'setup.sh', 'deploy.sh', 'maintain.sh', 'scripts/root.sh',
    'backend/scripts/lib/pg transport.sh', 'nginx/05-validate-public-host.sh',
    'backend/docker-entrypoint.sh', 'frontend/docker-entrypoint.sh',
    'backend/add-audit-logging.sh', 'other/outside.sh', 'outside.sh',
  ];
  trackFiles(f.dir, [...trackedScripts, 'scripts/notes.txt'], ['other/untracked.sh', 'scripts/untracked.sh']);
  f.command('pinned-shellcheck', 'for arg; do\n  case "$arg" in --|-x|-P|SCRIPTDIR) ;; *) printf "%s\\n" "$arg";; esac\ndone');

  const result = f.run({}, f.dir);

  assert.equal(result.status, 0, result.stderr);
  const checkedFiles = result.stdout.trimEnd().split('\n').filter(line => line !== 'ShellCheck enabled');
  assert.deepEqual(checkedFiles.sort(), trackedScripts.sort());
});

test('a standalone ShellCheck finding fails lint even when actionlint passes', t => {
  const f = fixture(t);
  trackFiles(f.dir, ['other/finding.sh']);
  f.command('pinned-shellcheck', [
    'for arg; do',
    '  if [[ "$arg" == other/finding.sh ]]; then',
    '    echo "other/finding.sh: standalone lint finding" >&2',
    '    exit 1',
    '  fi',
    'done',
  ].join('\n'));

  const result = f.run({}, f.dir);

  assert.match(result.stdout, /ShellCheck enabled/);
  assert.match(result.stderr, /other\/finding\.sh: standalone lint finding/);
  assert.ok(Number.isInteger(result.status) && result.status > 0, result.stderr);
});
