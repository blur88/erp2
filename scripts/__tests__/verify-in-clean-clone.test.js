const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const script = path.resolve(__dirname, '../verify-in-clean-clone.sh');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clean-clone-test-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const repo = path.join(directory, 'repo with spaces');
  const bin = path.join(directory, 'bin');
  const temporary = path.join(directory, 'tmp');
  for (const dir of [repo, bin, temporary]) fs.mkdirSync(dir);
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  git('init', '-q');
  git('config', 'user.name', 'Test');
  git('config', 'user.email', 'test@example.invalid');
  fs.mkdirSync(path.join(repo, 'scripts'));
  fs.mkdirSync(path.join(repo, 'backend'));
  fs.copyFileSync(script, path.join(repo, 'scripts/verify-in-clean-clone.sh'));
  fs.writeFileSync(path.join(repo, '.gitignore'), 'local-only\n');
  fs.writeFileSync(path.join(repo, 'backend/package.json'), '{}\n');
  git('add', '.');
  git('commit', '-qm', 'fixture');
  git('commit', '--allow-empty', '-qm', 'second commit');
  fs.writeFileSync(path.join(repo, 'local-only'), 'developer state');
  fs.writeFileSync(path.join(bin, 'npm'), '#!/bin/sh\n[ "$1" = ci ] && [ "$(basename "$PWD")" = backend ] || exit 99\nexit "${INSTALL_STATUS:-0}"\n', { mode: 0o755 });
  return {
    repo, git, temporary,
    run: (...args) => spawnSync('sh', [path.join(repo, 'scripts/verify-in-clean-clone.sh'), ...args], {
      cwd: path.join(repo, 'backend'), encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, TMPDIR: temporary },
    }),
  };
}

test('ignored local files cannot make a clean-clone check pass', (t) => {
  const f = fixture(t);
  assert.equal(spawnSync('sh', ['-c', 'test -f local-only'], { cwd: f.repo }).status, 0);
  const result = f.run('sh', '-c', 'test -f local-only');
  assert.equal(result.status, 1, result.stderr);
  assert.match(result.stdout, new RegExp(`Cloned SHA: ${f.git('rev-parse', 'HEAD')}`));
  assert.match(result.stdout, /Shallow: true/);
  assert.deepEqual(fs.readdirSync(f.temporary), []);
});

for (const status of [0, 37]) {
  test(`preserves command arguments and exit status ${status}, and cleans up`, (t) => {
    const f = fixture(t);
    const result = f.run('sh', '-c', 'test "$1" = "argument with spaces" || exit 98; test -f backend/package.json || exit 97; exit "$2"', 'check', 'argument with spaces', String(status));
    assert.equal(result.status, status, result.stderr);
    assert.deepEqual(fs.readdirSync(f.temporary), []);
  });
}

for (const state of ['modified', 'staged', 'untracked']) {
  test(`refuses a ${state} working tree before cloning`, (t) => {
    const f = fixture(t);
    if (state === 'modified') fs.appendFileSync(path.join(f.repo, '.gitignore'), 'changed\n');
    else fs.writeFileSync(path.join(f.repo, 'new-file'), 'change');
    if (state === 'staged') f.git('add', 'new-file');
    const result = f.run('sh', '-c', 'echo SHOULD_NOT_RUN');
    assert.equal(result.status, 2);
    assert.match(result.stderr, /dirty working tree.*commit or stash/);
    assert.doesNotMatch(result.stdout, /SHOULD_NOT_RUN|Cloned SHA/);
    assert.deepEqual(fs.readdirSync(f.temporary), []);
  });
}

test('requires a command', (t) => {
  const f = fixture(t);
  const result = f.run();
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Usage:/);
});

test('clones the current detached HEAD', (t) => {
  const f = fixture(t);
  f.git('checkout', '-q', '--detach', 'HEAD~1');
  const result = f.run('true');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, new RegExp(`Cloned SHA: ${f.git('rev-parse', 'HEAD')}`));
});

test('installation failure prevents the command and removes the clone', (t) => {
  const f = fixture(t);
  const npm = path.join(path.dirname(f.repo), 'bin/npm');
  fs.writeFileSync(npm, '#!/bin/sh\nexit 42\n');
  const result = f.run('sh', '-c', 'echo SHOULD_NOT_RUN');
  assert.equal(result.status, 42, result.stderr);
  assert.doesNotMatch(result.stdout, /SHOULD_NOT_RUN/);
  assert.deepEqual(fs.readdirSync(f.temporary), []);
});
