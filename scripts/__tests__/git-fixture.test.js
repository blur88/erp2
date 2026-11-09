const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { createGitFixture } = require('../helpers/git-fixture.cjs');

test('nested non-repository fixture cannot discover or modify its parent repository', (t) => {
  const outer = createGitFixture();
  t.after(outer.cleanup);
  outer.git(['init', '-q']);
  const config = path.join(outer.root, '.git/config');
  const before = readFileSync(config);
  const inner = createGitFixture({ parent: outer.root, env: { ...process.env,
    GIT_DIR: path.join(outer.root, '.git'), GIT_WORK_TREE: outer.root,
    GIT_INDEX_FILE: path.join(outer.root, 'injected-index'),
    GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'review.scratchRoot', GIT_CONFIG_VALUE_0: '/injected',
  } });
  t.after(inner.cleanup);
  const result = inner.run('git', ['rev-parse', '--show-toplevel']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /not a git repository/);
  assert.deepEqual(readFileSync(config), before);
  inner.git(['init', '-q']);
  assert.equal(inner.git(['rev-parse', '--show-toplevel']), inner.root);
  assert.notEqual(inner.run('git', ['config', '--get', 'review.scratchRoot']).status, 0);
  assert.deepEqual(readFileSync(config), before);
});

test('fixture ignores global config and retains probe artifacts until explicit cleanup', (t) => {
  const outer = createGitFixture();
  t.after(outer.cleanup);
  const config = path.join(outer.root, 'global-config');
  writeFileSync(config, '[review]\n  scratchRoot = /injected\n');
  const f = createGitFixture({ env: { ...process.env, GIT_CONFIG_GLOBAL: config } });
  t.after(f.cleanup);
  f.git(['init', '-q']);
  assert.notEqual(f.run('git', ['config', '--get', 'review.scratchRoot']).status, 0);
  const output = path.join(f.root, 'probe-output');
  writeFileSync(output, f.run('git', ['rev-parse', '--show-toplevel']).stdout);
  assert.equal(readFileSync(output, 'utf8'), `${f.root}\n`);
});
