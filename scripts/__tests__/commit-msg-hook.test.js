// Verify the version-controlled commit-msg hook in a configured local clone (#2017).
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

const root = resolve(__dirname, '../..');
const installCommand = 'git config core.hooksPath .githooks';

// A scratch repository holding the shipped hook and detector, without hooks configured yet.
function clone(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'erp2-commit-msg-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  cpSync(join(root, '.githooks'), join(cwd, '.githooks'), { recursive: true });
  mkdirSync(join(cwd, 'scripts'));
  cpSync(join(root, 'scripts/ai-attribution.cjs'), join(cwd, 'scripts/ai-attribution.cjs'));
  const git = (...args) => spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_EDITOR: 'true' } });
  for (const args of [['init', '--quiet', '-b', 'main'], ['config', 'user.name', 'Hook Test'],
    ['config', 'user.email', 'hook@example.test'], ['config', 'commit.gpgsign', 'false']]) {
    execFileSync('git', args, { cwd });
  }
  const commit = (message, ...extra) => git('commit', '--quiet', '--allow-empty', '-m', message, ...extra);
  const subjects = () => git('log', '--format=%s').stdout.trim().split('\n').filter(Boolean);
  const install = () => execFileSync('sh', ['-c', installCommand], { cwd });
  return { cwd, git, commit, subjects, install };
}

const claude = 'Co-Authored-By: Claude <noreply@anthropic.com>';

test('the hook file is executable and the documented install command is the one tested here', () => {
  assert.ok(statSync(join(root, '.githooks/commit-msg')).mode & 0o111, 'hook must be executable');
  assert.ok(readFileSync(join(root, 'docs/agents/commit-attribution.md'), 'utf8').split('\n').some(line => line.trim() === installCommand));
});

test('a configured clone refuses a commit with AI attribution and creates no commit', t => {
  const { commit, subjects, install } = clone(t);
  install();
  const result = commit(`fix: add thing\n\n${claude}`);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /AI attribution is not allowed/);
  assert.match(result.stderr, /line 3: AI co-author trailer/);
  assert.deepEqual(subjects(), []);
});

test('a configured clone refuses Claude-Session and session URL lines', t => {
  const { commit, subjects, install } = clone(t);
  install();
  assert.notEqual(commit('fix: a\n\nClaude-Session: abc').status, 0);
  assert.notEqual(commit('fix: b\n\nhttps://claude.ai/code/session_01AbC').status, 0);
  assert.deepEqual(subjects(), []);
});

test('a configured clone accepts human co-authors and prose about AI tools', t => {
  const { commit, subjects, install } = clone(t);
  install();
  const result = commit('fix: add thing\n\nCo-Authored-By: Jane Doe <jane@example.test>\nWe compared Claude Code output by hand.');
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(subjects(), ['fix: add thing']);
});

test('the hook also guards amend and merge commits', t => {
  const { git, commit, subjects, install } = clone(t);
  install();
  assert.equal(commit('fix: base').status, 0);
  const amend = commit(`fix: base\n\n${claude}`, '--amend');
  assert.notEqual(amend.status, 0);
  assert.deepEqual(subjects(), ['fix: base']);
  assert.equal(git('switch', '--quiet', '-c', 'topic').status, 0);
  assert.equal(commit('fix: topic').status, 0);
  assert.equal(git('switch', '--quiet', 'main').status, 0);
  assert.equal(commit('fix: main').status, 0);
  const merge = git('merge', '--no-ff', 'topic', '-m', `Merge topic\n\n${claude}`);
  assert.notEqual(merge.status, 0);
});

test('a # line committed with -m is still judged, and text below the scissors line is not', t => {
  const { cwd, commit, subjects, install } = clone(t);
  install();
  assert.notEqual(commit(`fix: x\n\n# ${claude}`).status, 0);
  assert.deepEqual(subjects(), []);
  const file = join(cwd, 'message.txt');
  const hook = join(cwd, '.githooks/commit-msg');
  const run = text => {
    writeFileSync(file, text);
    return spawnSync(hook, [file], { cwd, encoding: 'utf8' });
  };
  assert.equal(run(`fix: x\n\n# ------------------------ >8 ------------------------\n+${claude.replace('Co', 'Co')}\n`).status, 0);
  assert.equal(run(`fix: x\n\n${claude}\n`).status, 1);
});

test('the hook fails closed on a missing, unreadable or extra argument', t => {
  const { cwd } = clone(t);
  const hook = join(cwd, '.githooks/commit-msg');
  for (const args of [[], [join(cwd, 'absent.txt')], ['a', 'b']]) {
    const result = spawnSync(hook, args, { cwd, encoding: 'utf8' });
    assert.equal(result.status, 1, args.join(' '));
    assert.match(result.stderr, /commit-msg:/);
  }
});

test('local enforcement is optional: an unconfigured clone and --no-verify both skip the hook', t => {
  const { commit, subjects, install } = clone(t);
  assert.equal(commit(`fix: unconfigured\n\n${claude}`).status, 0);
  install();
  assert.equal(commit(`fix: bypassed\n\n${claude}`, '--no-verify').status, 0);
  assert.deepEqual(subjects(), ['fix: bypassed', 'fix: unconfigured']);
});
