// scripts/compose-smoke-decide.sh is the whole decision the Frontend CI job
// makes about the Compose smoke test (#1966): it prints `run=true` or
// `run=false` for $GITHUB_OUTPUT. Run against real git repositories shaped like
// what actions/checkout produces for each trigger.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync, copyFileSync, chmodSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { spawnSync } = require('node:child_process');

const scripts = path.resolve(__dirname, '..');

function repo(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'compose-decide-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  mkdirSync(path.join(dir, 'scripts'));
  for (const name of ['compose-smoke-decide.sh', 'compose-smoke-paths.sh']) {
    try {
      copyFileSync(path.join(scripts, name), path.join(dir, 'scripts', name));
      chmodSync(path.join(dir, 'scripts', name), 0o755);
    } catch {
      /* the decide script does not exist yet: the run below fails */
    }
  }
  const git = (...args) => {
    const r = spawnSync('git', ['-c', 'user.email=t@example.com', '-c', 'user.name=t', '-c', 'commit.gpgsign=false', ...args], { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return r.stdout;
  };
  const write = (file, text) => {
    mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    writeFileSync(path.join(dir, file), text);
  };
  git('init', '-q', '-b', 'main');
  write('README.md', 'base\n');
  git('add', '-A');
  git('commit', '-qm', 'base');
  return {
    git,
    write,
    // A pull request checkout: the PR's change merged into a base that has moved on.
    mergeCommit(changedFile) {
      git('checkout', '-q', '-b', 'pr');
      write(changedFile, 'change\n');
      git('add', '-A');
      git('commit', '-qm', 'pr');
      git('checkout', '-q', 'main');
      write('nginx/moved-on-main.conf', 'main moved\n'); // must not count as part of the PR
      git('add', '-A');
      git('commit', '-qm', 'main moved');
      git('merge', '-q', '--no-ff', 'pr', '-m', 'merge');
    },
    run(eventName, { failGitDiff = false } = {}) {
      const env = { ...process.env, EVENT_NAME: eventName };
      if (failGitDiff) {
        // A git on PATH that behaves normally except that `git diff` errors.
        const real = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
        const bin = path.join(dir, 'fake-bin');
        mkdirSync(bin);
        writeFileSync(path.join(bin, 'git'), `#!/bin/bash\n[ "$1" = diff ] && { echo 'fatal: bad object' >&2; exit 128; }\nexec ${real} "$@"\n`, { mode: 0o755 });
        env.PATH = `${bin}:${process.env.PATH}`;
      }
      return spawnSync('bash', ['scripts/compose-smoke-decide.sh'], { cwd: dir, encoding: 'utf8', env });
    },
  };
}

test('a manual dispatch has no base to diff against, so it runs the smoke test', t => {
  const r = repo(t).run('workflow_dispatch');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'run=true');
});

test('a pull request touching a listed path runs the smoke test', t => {
  const f = repo(t);
  f.mergeCommit('nginx/nginx.conf');
  const r = f.run('pull_request');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'run=true');
});

test('a pull request touching no listed path skips it, even if the base moved on a listed path', t => {
  const f = repo(t);
  f.mergeCommit('frontend/src/App.tsx');
  const r = f.run('pull_request');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'run=false');
});

test('a pull request HEAD that is not a two-parent merge has no base, so it runs the smoke test', t => {
  const f = repo(t);
  f.write('frontend/src/App.tsx', 'x\n');
  f.git('add', '-A');
  f.git('commit', '-qm', 'plain commit');
  const r = f.run('pull_request');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'run=true');
});

test('a pull request whose diff cannot be computed runs the smoke test rather than skipping it', t => {
  const f = repo(t);
  f.mergeCommit('frontend/src/App.tsx'); // would otherwise skip
  const r = f.run('pull_request', { failGitDiff: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'run=true');
  assert.match(r.stderr, /diff/i);
});

test('stdout carries only the output line, so it can be appended to $GITHUB_OUTPUT as is', t => {
  const f = repo(t);
  f.mergeCommit('deploy.sh');
  const r = f.run('pull_request');
  assert.match(r.stdout, /^run=(true|false)\n$/);
  assert.match(r.stderr, /deploy\.sh/, 'the reason is logged on stderr');
});
