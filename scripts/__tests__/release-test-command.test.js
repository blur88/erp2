const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('test:release fails when no release test files are found', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'release-tests-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.copyFileSync(path.resolve(__dirname, '../../package.json'), path.join(directory, 'package.json'));

  const result = spawnSync('npm', ['run', 'test:release'], {
    cwd: directory,
    encoding: 'utf8',
  });

  assert.ifError(result.error);
  assert.equal(result.status, 1, result.stdout + result.stderr);
});
