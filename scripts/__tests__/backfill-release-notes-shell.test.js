const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const scriptPath = path.resolve(__dirname, '..', 'backfill-release-notes.cjs');

function readScript() {
  return fs.readFileSync(scriptPath, 'utf8');
}

test('backfill release notes invokes child processes without a shell', () => {
  const source = readScript();

  assert.match(source, /const \{ execFileSync \} = require\('child_process'\);/);
  assert.doesNotMatch(source, /\bexecSync\b/);
  assert.match(source, /execFileSync\(cmd, args,/);
});

test('backfill release notes passes git and gh arguments separately', () => {
  const source = readScript();

  assert.match(source, /run\('git', \['tag', '--sort=version:refname'\]\)/);
  assert.match(source, /run\('git', \['log', `\$\{previousTag\}\.\.\$\{currentTag\}`, '--format=%H %s'\]\)/);
  assert.match(source, /run\('gh', \['release', 'view', tag, '--json', 'body', '--jq', '\.body'\]\)/);
  assert.match(source, /run\('gh', \['release', 'edit', tag, '--notes-file', tmpFile\]\)/);
});
