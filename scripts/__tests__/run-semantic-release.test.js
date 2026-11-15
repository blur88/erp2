const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runRelease(t, log, status) {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(path.join(dir, 'npx'), `#!/bin/bash\nprintf '%s\\n' '${log}'\nexit ${status}\n`, { mode: 0o755 });
  const output = path.join(dir, 'output');
  writeFileSync(output, '');
  const result = spawnSync('bash', ['-e', '-o', 'pipefail', path.resolve(__dirname, '../run-semantic-release.sh')], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, GITHUB_OUTPUT: output },
    encoding: 'utf8',
  });
  return { status: result.status, output: readFileSync(output, 'utf8') };
}

test('published release supplies the version and succeeds', t => {
  assert.deepEqual(runRelease(t, 'Published release 3.17.1 on default channel', 0), {
    status: 0, output: 'new_release_published=true\nnew_release_version=3.17.1\n',
  });
});

test('no release needed succeeds with empty version', t => {
  assert.deepEqual(runRelease(t, 'There are no relevant changes', 0), {
    status: 0, output: 'new_release_published=false\nnew_release_version=\n',
  });
});

test('release failure retains its exit code even with a published line', t => {
  assert.deepEqual(runRelease(t, 'Published release 3.17.1', 7), {
    status: 7, output: 'new_release_published=false\nnew_release_version=\n',
  });
});
