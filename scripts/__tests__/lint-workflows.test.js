const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lint-workflows-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const command = (name, body) => writeFileSync(path.join(dir, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
  command('shellcheck', 'exit 0');
  command('curl', 'exit "${CURL_STATUS:-0}"');
  command('tar', 'touch "$TAR_CALLED"\ncp "$FAKE_ACTIONLINT" "$4/actionlint"');
  command('fake-actionlint', 'test "$1" = -shellcheck && test "$2" = "$EXPECTED_SHELLCHECK" || exit 99\necho "ShellCheck enabled"\nexit "${LINT_STATUS:-0}"');
  return {
    dir, command,
    run(env = {}) {
      return spawnSync('bash', ['scripts/lint-workflows.sh'], {
        cwd: path.resolve(__dirname, '../..'), encoding: 'utf8',
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
  const f = fixture(t);
  f.command('curl', 'printf "corrupted archive" > "$4"');
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.equal(existsSync(path.join(f.dir, 'tar-called')), false);
});

test('lint explicitly enables ShellCheck and propagates actionlint failures', t => {
  const f = fixture(t);
  // The real checksum failure path is tested above; isolate the linter boundary here.
  f.command('sha256sum', 'cat >/dev/null\nexit 0');
  const result = f.run({ LINT_STATUS: '3' });
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stdout, /ShellCheck enabled/);
});

test('successful lint passes with ShellCheck enabled', t => {
  const f = fixture(t);
  f.command('sha256sum', 'cat >/dev/null\nexit 0');
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /ShellCheck enabled/);
});
