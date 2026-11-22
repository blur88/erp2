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
  command('shellcheck', 'exit 0');
  command('curl', 'exit "${CURL_STATUS:-0}"');
  if (!verifyChecksum) {
    command('sha256sum', 'cat >/dev/null\nexit 0');
  }
  command('tar', 'touch "$TAR_CALLED"\ncp "$FAKE_ACTIONLINT" "$4/actionlint"');
  command('fake-actionlint', 'test "$1" = -shellcheck && test "$2" = "$EXPECTED_SHELLCHECK" || exit 99\necho "ShellCheck enabled"\nexit "${LINT_STATUS:-0}"');
  return {
    dir, command,
    run(env = {}, cwd = path.resolve(__dirname, '../..')) {
      return spawnSync('bash', [path.resolve(__dirname, '../lint-workflows.sh')], {
        cwd, encoding: 'utf8',
        env: {
          ...process.env, PATH: `${dir}:${process.env.PATH}`,
          TAR_CALLED: path.join(dir, 'tar-called'),
          FAKE_ACTIONLINT: path.join(dir, 'fake-actionlint'),
          EXPECTED_SHELLCHECK: path.join(dir, 'shellcheck'), ...env,
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
  f.command('shellcheck', 'for arg; do\n  case "$arg" in *.sh) printf "%s\\n" "$arg";; esac\ndone');

  const result = f.run({}, f.dir);

  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(result.stdout.split('\n').filter(line => line.endsWith('.sh')).sort(), trackedScripts.sort());
});

test('a standalone ShellCheck finding fails lint even when actionlint passes', t => {
  const f = fixture(t);
  f.command('shellcheck', 'echo "standalone lint finding" >&2\nexit 1');

  const result = f.run();

  assert.match(result.stdout, /ShellCheck enabled/);
  assert.match(result.stderr, /standalone lint finding/);
  assert.ok(Number.isInteger(result.status) && result.status > 0, result.stderr);
});

test('missing ShellCheck fails lint with an actionable error before downloading actionlint', t => {
  const f = fixture(t);
  rmSync(path.join(f.dir, 'shellcheck'));
  f.command('curl', 'touch "$CURL_CALLED"');
  const bash = spawnSync('bash', ['-c', 'command -v bash'], { encoding: 'utf8' }).stdout.trim();

  const result = spawnSync(bash, [path.resolve(__dirname, '../lint-workflows.sh')], {
    cwd: path.resolve(__dirname, '../..'), encoding: 'utf8',
    env: { ...process.env, PATH: f.dir, CURL_CALLED: path.join(f.dir, 'curl-called') },
  });

  assert.ok(Number.isInteger(result.status) && result.status > 0, `status ${result.status}`);
  assert.match(result.stderr, /shellcheck.*not found/i);
  assert.match(result.stderr, /install/i);
  assert.equal(existsSync(path.join(f.dir, 'curl-called')), false);
});
