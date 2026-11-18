const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');

const script = path.resolve(__dirname, '../cleanup-merged-pr.sh');
const topic = 'fix/1937-topic';

function fixture(t, mergeMethod = 'merge') {
  const dir = mkdtempSync(path.join(tmpdir(), 'cleanup-merged-pr-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const origin = path.join(dir, 'origin.git');
  const maintainer = path.join(dir, 'maintainer');
  const checkout = path.join(dir, 'checkout');
  const bin = path.join(dir, 'bin');
  const git = (cwd, ...args) => execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Test Author', GIT_AUTHOR_EMAIL: 'author@example.test',
      GIT_COMMITTER_NAME: 'Test Committer', GIT_COMMITTER_EMAIL: 'committer@example.test',
    },
  }).trim();

  git(dir, 'init', '--bare', '--initial-branch=main', origin);
  git(dir, 'clone', origin, maintainer);
  git(maintainer, 'commit', '--allow-empty', '-m', 'Base commit');
  git(maintainer, 'push', 'origin', 'main');
  git(maintainer, 'switch', '-c', topic);
  writeFileSync(path.join(maintainer, 'feature'), 'feature\n');
  git(maintainer, 'add', 'feature');
  git(maintainer, 'commit', '-m', 'Topic commit');
  const head = git(maintainer, 'rev-parse', 'HEAD');
  git(maintainer, 'push', 'origin', topic);
  git(dir, 'clone', origin, checkout);
  git(checkout, 'switch', topic);
  git(checkout, 'branch', 'unrelated', topic);
  git(checkout, 'push', 'origin', 'unrelated');

  git(maintainer, 'switch', 'main');
  if (mergeMethod === 'squash') {
    git(maintainer, 'merge', '--squash', topic);
    git(maintainer, 'commit', '-m', 'Squash merge topic');
  } else {
    git(maintainer, 'merge', '--no-ff', '--no-edit', topic);
  }
  const merge = git(maintainer, 'rev-parse', 'HEAD');
  writeFileSync(path.join(maintainer, 'main-only'), 'added to main\n');
  git(maintainer, 'add', 'main-only');
  git(maintainer, 'commit', '-m', 'Update main after merge');
  const main = git(maintainer, 'rev-parse', 'HEAD');
  git(maintainer, 'push', 'origin', 'main');

  mkdirSync(bin);
  writeFileSync(path.join(bin, 'gh'), '#!/usr/bin/env bash\n[[ "$1 $2 $3" == "pr view 42" ]] || exit 1\nprintf "%s\\n" "$PR_METADATA"\n', { mode: 0o755 });

  return {
    checkout, head, main, merge,
    git: (...args) => git(checkout, ...args),
    origin: (...args) => git(origin, ...args),
    run: (metadata = ['MERGED', 'main', topic, head, 'false', merge]) => spawnSync('bash', [script, '42'], {
      cwd: checkout,
      encoding: 'utf8',
      timeout: 10000,
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, PR_METADATA: metadata.join('\t') },
    }),
  };
}

function assertCleaned(f) {
  assert.equal(f.git('branch', '--show-current'), 'main');
  assert.equal(f.git('rev-parse', 'HEAD'), f.main);
  assert.equal(f.git('branch', '--list', topic), '');
  assert.equal(f.origin('branch', '--list', topic), '');
  assert.equal(f.git('rev-parse', 'unrelated'), f.head);
  assert.equal(f.origin('rev-parse', 'unrelated'), f.head);
}

test('updates main and removes only the merged topic branch', t => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assertCleaned(f);
});

test('cleans up a squash-merged branch after origin already deleted it', t => {
  const f = fixture(t, 'squash');
  f.origin('branch', '-D', topic);

  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assertCleaned(f);
});

test('creates main from origin in a topic-only checkout', t => {
  const f = fixture(t);
  f.git('branch', '-D', 'main');
  f.git('branch', '-dr', 'origin/main');
  f.git('config', 'remote.origin.fetch', `+refs/heads/${topic}:refs/remotes/origin/${topic}`);

  const result = f.run();
  assert.equal(result.status, 0, result.stderr);
  assertCleaned(f);
});

function assertBlocked(f, result, reason, localHead = f.head, remoteHead = f.head) {
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stderr, reason);
  assert.equal(f.git('branch', '--show-current'), topic);
  assert.equal(f.git('rev-parse', 'HEAD'), localHead);
  assert.equal(f.origin('rev-parse', `refs/heads/${topic}`), remoteHead);
}

test('preserves untracked work even when Git is configured to hide it', t => {
  const f = fixture(t);
  f.git('config', 'status.showUntrackedFiles', 'no');
  writeFileSync(path.join(f.checkout, 'local-work'), 'keep me\n');

  assertBlocked(f, f.run(), /uncommitted work/);
  assert.equal(f.git('status', '--porcelain', '--untracked-files=normal'), '?? local-work');
});

test('preserves an ignored file that would be overwritten by updating main', t => {
  const f = fixture(t);
  const localFile = path.join(f.checkout, 'main-only');
  appendFileSync(path.join(f.checkout, '.git', 'info', 'exclude'), '\nmain-only\n');
  writeFileSync(localFile, 'keep me\n');

  const result = f.run();
  assert.notEqual(result.status, 0, result.stdout);
  assert.match(result.stderr, /would be overwritten/);
  assert.equal(readFileSync(localFile, 'utf8'), 'keep me\n');
  assert.equal(f.git('rev-parse', `refs/heads/${topic}`), f.head);
  assert.equal(f.origin('rev-parse', `refs/heads/${topic}`), f.head);

  rmSync(localFile);
  const retry = f.run();
  assert.equal(retry.status, 0, retry.stderr);
  assertCleaned(f);
});

test('preserves local-only commits on the topic branch', t => {
  const f = fixture(t);
  f.git('commit', '--allow-empty', '-m', 'Local work');
  const localHead = f.git('rev-parse', 'HEAD');

  assertBlocked(f, f.run(), /local branch .* differs/, localHead);
});

test('preserves a topic branch updated on origin after the merge', t => {
  const f = fixture(t);
  f.origin('update-ref', `refs/heads/${topic}`, f.main);

  assertBlocked(f, f.run(), /on origin differs/, f.head, f.main);
});

test('preserves local main when it has a local-only commit', t => {
  const f = fixture(t);
  f.git('switch', 'main');
  f.git('commit', '--allow-empty', '-m', 'Local main work');
  const localMain = f.git('rev-parse', 'HEAD');
  f.git('switch', topic);

  assertBlocked(f, f.run(), /local main cannot fast-forward/);
  assert.equal(f.git('rev-parse', 'main'), localMain);
});

test('preserves both branches when main is checked out in another worktree', t => {
  const f = fixture(t);
  f.git('worktree', 'add', path.join(f.checkout, '..', 'other-worktree'), 'main');

  assertBlocked(f, f.run(), /main.*worktree/);
});

for (const startingBranch of [topic, 'main']) {
  test(`blocks cleanup from ${startingBranch} when the topic branch is checked out in another worktree`, t => {
    const f = fixture(t);
    const otherWorktree = path.join(f.checkout, '..', 'other-worktree');
    const localMain = f.git('rev-parse', 'refs/heads/main');
    f.git('switch', startingBranch);
    f.git('worktree', 'add', '--force', otherWorktree, topic);
    const localFile = path.join(otherWorktree, 'local-work');
    writeFileSync(localFile, 'keep me\n');

    const result = f.run();

    assert.equal(result.status, 1, result.stderr);
    assert.ok(result.stderr.includes(`branch ${topic} is checked out in another worktree`), result.stderr);
    assert.equal(f.git('branch', '--show-current'), startingBranch);
    assert.equal(f.git('rev-parse', 'refs/heads/main'), localMain);
    assert.equal(f.git('-C', otherWorktree, 'branch', '--show-current'), topic);
    assert.equal(f.git('-C', otherWorktree, 'rev-parse', 'HEAD'), f.head);
    assert.equal(f.origin('rev-parse', `refs/heads/${topic}`), f.head);
    assert.equal(readFileSync(localFile, 'utf8'), 'keep me\n');
  });
}

test('blocks cleanup while the PR is open', t => {
  const f = fixture(t);

  assertBlocked(f, f.run(['OPEN', 'main', topic, f.head, 'false', '']), /must be merged into main/);
});
