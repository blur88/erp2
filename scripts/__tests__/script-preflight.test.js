const { test } = require('node:test');
const assert = require('node:assert/strict');
const { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { createGitFixture } = require('../helpers/git-fixture.cjs');

const backend = path.resolve(__dirname, '../../backend');

test('backend script tests stop at invalid pointers and run after the target is staged', (t) => {
  const f = createGitFixture();
  t.after(f.cleanup);
  f.git(['init', '-q']);
  const app = path.join(f.root, 'backend');
  mkdirSync(path.join(app, 'scripts'), { recursive: true });
  mkdirSync(path.join(app, 'node_modules/.bin'), { recursive: true });
  const source = JSON.parse(readFileSync(path.join(backend, 'package.json'), 'utf8'));
  writeFileSync(path.join(app, 'package.json'), JSON.stringify({
    name: 'preflight-fixture', private: true,
    scripts: { 'pretest:scripts': source.scripts['pretest:scripts'], 'test:scripts': source.scripts['test:scripts'] },
  }));
  copyFileSync(path.join(backend, 'scripts/check-agent-doc-paths.mjs'), path.join(app, 'scripts/check-agent-doc-paths.mjs'));
  const marker = path.join(f.root, 'bats-started');
  writeFileSync(path.join(app, 'node_modules/.bin/bats'), '#!/bin/sh\nprintf "%s\\n" "$@" > "$BATS_MARKER"\n', { mode: 0o755 });
  writeFileSync(path.join(f.root, 'AGENTS.md'), '[target](new-script.sh)\n');
  writeFileSync(path.join(f.root, 'CLAUDE.md'), '# Guidance\n');
  f.git(['add', 'AGENTS.md', 'CLAUDE.md', 'backend/package.json', 'backend/scripts/check-agent-doc-paths.mjs']);
  writeFileSync(path.join(f.root, 'new-script.sh'), '#!/bin/sh\n');
  const run = () => f.run('npm', ['run', 'test:scripts'], app, { BATS_MARKER: marker });
  const rejected = run();
  assert.notEqual(rejected.status, 0, rejected.stdout + rejected.stderr);
  assert.match(rejected.stdout + rejected.stderr, /missing path new-script.sh/);
  assert.equal(existsSync(marker), false, 'Bats must not start on an invalid pointer');
  assert.equal(f.git(['ls-files', '--', 'new-script.sh']), '', 'preflight must not stage files');
  f.git(['add', 'new-script.sh']);
  const accepted = run();
  assert.equal(accepted.status, 0, accepted.stdout + accepted.stderr);
  assert.equal(readFileSync(marker, 'utf8'), 'scripts/__tests__\n');
});
