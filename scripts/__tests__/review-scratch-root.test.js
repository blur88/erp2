const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cpSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { createGitFixture } = require('../helpers/git-fixture.cjs');
const path = require('node:path');

const script = path.resolve(__dirname, '../review-scratch-root.sh');

function fixture(t) {
  const f = createGitFixture();
  t.after(f.cleanup);
  return { ...f, resolve: (cwd = f.root) => f.run(script, [], cwd) };
}

function succeeds(result, expected) {
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, `${expected}\n`);
  assert.equal(result.stderr, '');
}

test('ordinary checkout initializes the portable scratch layout', (t) => {
  const f = fixture(t);
  f.git(['init', '-q']);
  succeeds(f.resolve(), path.join(f.root, '.scratch'));
  assert.equal(f.git(['config', '--local', '--get', 'review.scratchRoot']), '../.scratch');
});

function linkedCheckout(f) {
  f.git(['init', '-q']);
  f.git(['-c', 'user.name=Test', '-c', 'user.email=test@example.com', 'commit', '--allow-empty', '-qm', 'Initial']);
  const linked = path.join(f.root, 'linked');
  f.git(['worktree', 'add', '-qb', 'linked', linked]);
  return linked;
}

function fails(result, message) {
  assert.notEqual(result.status, null, result.error?.message);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, '');
  assert.match(result.stderr, message);
}

test('uninitialized linked worktree fails without writing shared config', (t) => {
  const f = fixture(t);
  const linked = linkedCheckout(f);
  const before = readFileSync(path.join(f.root, '.git/config'));
  fails(f.resolve(linked), /Initialize review.scratchRoot from the primary/);
  assert.deepEqual(readFileSync(path.join(f.root, '.git/config')), before);
});

test('linked worktree reads the primary checkout setting without rewriting config', (t) => {
  const f = fixture(t);
  const linked = linkedCheckout(f);
  succeeds(f.resolve(), path.join(f.root, '.scratch'));
  const before = readFileSync(path.join(f.root, '.git/config'));
  succeeds(f.resolve(linked), path.join(f.root, '.scratch'));
  assert.deepEqual(readFileSync(path.join(f.root, '.git/config')), before);
});

test('separate storage named .git initializes review-scratch', (t) => {
  const f = fixture(t);
  const storage = path.join(f.root, 'storage', '.git');
  const checkout = path.join(f.root, 'checkout');
  mkdirSync(path.dirname(storage));
  f.git(['init', '-q', '--separate-git-dir', storage, checkout]);
  succeeds(f.resolve(checkout), path.join(storage, 'review-scratch'));
  assert.equal(f.git(['config', '--local', '--get', 'review.scratchRoot'], checkout), 'review-scratch');
});

test('bare repository initializes review-scratch', (t) => {
  const f = fixture(t);
  f.git(['init', '--bare', '-q']);
  succeeds(f.resolve(), path.join(f.root, 'review-scratch'));
  assert.equal(f.git(['config', '--local', '--get', 'review.scratchRoot']), 'review-scratch');
});

test('outside a repository fails before config access', (t) => {
  const f = fixture(t);
  const bin = path.join(f.root, 'bin');
  mkdirSync(bin);
  const calls = path.join(f.root, 'git-calls');
  writeFileSync(calls, '');
  const realGit = f.run('sh', ['-c', 'command -v git']).stdout.trim();
  writeFileSync(path.join(bin, 'git'), '#!/bin/sh\nprintf "%s\\n" "$1" >> "$GIT_CALLS"\nexec "$REAL_GIT" "$@"\n', { mode: 0o755 });
  fails(f.run(script, [], f.root, {
    PATH: `${bin}${path.delimiter}${process.env.PATH}`,
    REAL_GIT: realGit,
    GIT_CALLS: calls,
  }), /not a git repository/);
  assert.equal(readFileSync(calls, 'utf8'), 'rev-parse\n');
});

test('copied checkout resolves the stored layout relative to its new location', (t) => {
  const f = fixture(t);
  const original = path.join(f.root, 'original');
  const copy = path.join(f.root, 'copy');
  f.git(['init', '-q', original]);
  succeeds(f.resolve(original), path.join(original, '.scratch'));
  cpSync(original, copy, { recursive: true });
  const before = readFileSync(path.join(copy, '.git/config'));
  succeeds(f.resolve(copy), path.join(copy, '.scratch'));
  assert.deepEqual(readFileSync(path.join(copy, '.git/config')), before);
});

test('obsolete absolute config is rejected without rewriting it', (t) => {
  const f = fixture(t);
  f.git(['init', '-q']);
  f.git(['config', '--local', 'review.scratchRoot', '/obsolete/root']);
  const before = readFileSync(path.join(f.root, '.git/config'));
  fails(f.resolve(), /Unsupported review.scratchRoot/);
  assert.deepEqual(readFileSync(path.join(f.root, '.git/config')), before);
});

test('calling shell survives a script failure', (t) => {
  const f = fixture(t);
  const result = f.run('sh', ['-c', '"$1"; status=$?; printf "caller-alive:%s\\n" "$status"', 'caller', script]);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, 'caller-alive:1\n');
  assert.match(result.stderr, /not a git repository/);
});
