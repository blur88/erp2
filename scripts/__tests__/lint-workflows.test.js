const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, mkdtempSync, readdirSync, writeFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function fixture(t, { verifyChecksum = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lint-workflows-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const command = (name, body) => writeFileSync(path.join(dir, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  command('shellcheck', 'echo "unexpected PATH ShellCheck" >&2\nexit 99');
  command('fake-shellcheck', 'if [[ "$1" == --version ]]; then echo "version: 0.11.0"; fi');
  command('curl', 'touch "$4"\nif [[ "$2" == */shellcheck-* ]]; then exit "${SHELLCHECK_CURL_STATUS:-0}"; fi\nexit "${CURL_STATUS:-0}"');
  if (!verifyChecksum) {
    command('sha256sum', 'read -r digest archive\nif [[ "$archive" == */shellcheck.tar.xz ]]; then exit "${SHELLCHECK_CHECKSUM_STATUS:-0}"; fi');
  }
  command('tar', [
    'case "$2" in',
    '  */actionlint.tar.gz) touch "$TAR_CALLED"; cp "$FAKE_ACTIONLINT" "$4/actionlint" ;;',
    '  */shellcheck.tar.xz) touch "$SHELLCHECK_TAR_CALLED"; cp "$FAKE_SHELLCHECK" "$4/shellcheck" ;;',
    '  *) exit 99 ;;',
    'esac',
  ].join('\n'));
  command('fake-actionlint', [
    'test "$1" = -shellcheck && test "$2" = "${0%/*}/shellcheck" || exit 99',
    '"$2" --embedded || exit "$?"',
    'echo "ShellCheck enabled"',
  ].join('\n'));
  return {
    dir, command,
    run(env = {}, cwd = path.resolve(__dirname, '../..')) {
      return spawnSync('bash', [path.resolve(__dirname, '../lint-workflows.sh')], {
        cwd, encoding: 'utf8',
        env: {
          ...process.env, PATH: `${dir}:${process.env.PATH}`,
          TMPDIR: dir,
          SHELLCHECK_TAR_CALLED: path.join(dir, 'shellcheck-tar-called'),
          FAKE_SHELLCHECK: path.join(dir, 'fake-shellcheck'),
          TAR_CALLED: path.join(dir, 'tar-called'),
          FAKE_ACTIONLINT: path.join(dir, 'fake-actionlint'),
          ...env,
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

test('an embedded ShellCheck finding fails workflow lint', t => {
  const f = fixture(t);
  f.command('fake-shellcheck', 'if [[ "$1" == --embedded ]]; then echo "embedded lint finding" >&2; exit 3; fi');
  const result = f.run();
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stderr, /embedded lint finding/);
});

test('successful lint passes with ShellCheck enabled', t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ShellCheck enabled/);
  assert.match(result.stdout, /version: 0\.11\.0/);
  assert.equal(readdirSync(f.dir).some(name => name.startsWith('tmp.')), false);
});

test('standalone lint checks tracked shell scripts in both script trees', t => {
  const f = fixture(t);
  const trackedScripts = ['scripts/root.sh', 'backend/scripts/lib/pg transport.sh'];
  const paths = [...trackedScripts, 'scripts/untracked.sh', 'scripts/notes.txt', 'other/outside.sh'];
  for (const file of paths) {
    const target = path.join(f.dir, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, '#!/bin/bash\n');
  }
  for (const args of [['init', '--template='], ['add', '-f', '--', ...trackedScripts, 'scripts/notes.txt', 'other/outside.sh']]) {
    const result = spawnSync('git', args, { cwd: f.dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
  f.command('fake-shellcheck', '[[ "$1" == -x ]] || exit 0\ntest "$2" = -P && test "$3" = SCRIPTDIR && test "$4" = -- || exit 99\nfor arg; do\n  case "$arg" in *.sh) printf "%s\\n" "$arg";; esac\ndone');

  const result = f.run({}, f.dir);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.split('\n').filter(line => line.endsWith('.sh')).sort(), trackedScripts.sort());
});

test('a standalone ShellCheck finding fails lint even when actionlint passes', t => {
  const f = fixture(t);
  f.command('fake-shellcheck', '[[ "$1" == -x ]] || exit 0\necho "standalone lint finding" >&2\nexit 1');

  const result = f.run();

  assert.match(result.stdout, /ShellCheck enabled/);
  assert.match(result.stderr, /standalone lint finding/);
  assert.ok(Number.isInteger(result.status) && result.status > 0, result.stderr);
});

for (const [failure, status, env] of [
  ['download failure', 22, { SHELLCHECK_CURL_STATUS: '22' }],
  ['checksum mismatch', 1, { SHELLCHECK_CHECKSUM_STATUS: '1' }],
]) {
  test(`ShellCheck ${failure} stops lint before extraction and cleans up downloads`, t => {
    const f = fixture(t);
    const result = f.run(env);

    assert.equal(result.status, status, result.stderr);
    assert.equal(existsSync(path.join(f.dir, 'shellcheck-tar-called')), false);
    assert.equal(readdirSync(f.dir).some(name => name.startsWith('tmp.')), false);
  });
}

test('an unsupported platform fails before downloading tools', t => {
  const f = fixture(t);
  f.command('uname', 'echo "Linux aarch64"');
  f.command('curl', 'exit 99');

  const result = f.run();

  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, /unsupported platform \(Linux aarch64\).*Linux x86_64/);
});
