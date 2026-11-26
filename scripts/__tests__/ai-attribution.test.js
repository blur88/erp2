const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { test } = require('node:test');

const checker = resolve(__dirname, '../check-ai-attribution.cjs');

function fixture(t) {
  const cwd = mkdtempSync(join(tmpdir(), 'ai-attribution-'));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.com');
  const commit = (message) => {
    git('commit', '-q', '--allow-empty', '-m', message);
    return git('rev-parse', 'HEAD');
  };
  const base = commit('Historical attribution\n\nCo-Authored-By: internal-model');
  const check = (pullRequest, body = '') => {
    const eventPath = join(cwd, 'event.json');
    const bodyPath = join(cwd, 'body.txt');
    writeFileSync(eventPath, JSON.stringify({ pull_request: pullRequest }));
    writeFileSync(bodyPath, body);
    return spawnSync(process.execPath, [checker, eventPath, bodyPath], {
      cwd,
      encoding: 'utf8',
    });
  };
  const pr = (head, ref = 'main', baseSha = base) => ({
    base: { ref, sha: baseSha },
    head: { sha: head },
  });
  return { git, commit, check, pr };
}

test('reports each attribution line in the current PR body', (t) => {
  const { commit, check, pr } = fixture(t);
  const result = check(pr(commit('Clean change')), [
    'Claude API rate limits',
    'Co-authored-by: Claude Opus 5.5 (1M context) <noreply@anthropic.com>',
    'co-authored-by: Gemini <noreply@google.com>',
    'CO-AUTHORED-BY: internal-model',
    'Co-Authored-By: Alias <noreply@anthropic.com>',
    'Co-Authored-By: Alias <noreply@google.com>',
    'Co-Authored-By: Claude Opus 5.5 <alias@example.com>',
    'Co-Authored-By: Gemini <alias@example.com>',
    'Co-Authored-By: Claude 3.5 Sonnet <alias@example.com>',
    '[Session](https://claude.ai/code/session-id)',
    'Claude-Session: session-id',
  ].join('\r\n'));
  assert.equal(result.status, 1, result.stderr);
  assert.equal(result.stderr, [
    ...Array.from({ length: 8 }, (_, index) => `PR body:${index + 2}: AI co-author trailer`),
    'PR body:10: Claude session link',
    'PR body:11: Claude session trailer',
    '',
  ].join('\n'));
});

test('checks topic commits and merge commits without scanning base history', (t) => {
  const { git, commit, check, pr } = fixture(t);
  git('branch', 'side');
  const topic = commit('Topic change\n\nCo-Authored-By: Claude');
  git('switch', '-q', 'side');
  commit('Side change');
  git('switch', '-q', 'main');
  git('merge', '--no-ff', '-m', 'Merge side\n\nhttps://claude.ai/code/session-id', 'side');
  const merge = git('rev-parse', 'HEAD');

  const result = check(pr(merge));
  assert.equal(result.status, 1);
  assert.deepEqual(result.stderr.trim().split('\n').sort(), [
    `${topic}:3: AI co-author trailer`,
    `${merge}:3: Claude session link`,
  ].sort());
});

test('excludes main history only for integration PRs', (t) => {
  const { git, commit, check, pr } = fixture(t);
  git('branch', 'upgrade/postgres-19');
  const main = commit('Pre-policy main change\n\nCo-Authored-By: Gemini');
  git('update-ref', 'refs/remotes/origin/main', main);
  git('switch', '-q', 'upgrade/postgres-19');
  const base = commit('Integration change');
  git('merge', '--no-ff', '-m', 'Sync main', 'main');
  const head = git('rev-parse', 'HEAD');

  const sync = check(pr(head, 'upgrade/postgres-19', base));
  assert.equal(sync.status, 0, sync.stderr);
  const ordinary = check(pr(head, 'main', base));
  assert.equal(ordinary.status, 1);
  assert.equal(ordinary.stderr, `${main}:3: AI co-author trailer\n`);

  const topic = commit('Topic change\n\nClaude-Session: session-id');
  const introduced = check(pr(topic, 'upgrade/postgres-19', base));
  assert.equal(introduced.status, 1);
  assert.equal(introduced.stderr, `${topic}:3: Claude session trailer\n`);
});

test('allows human attribution and technical discussion in commits and the body', (t) => {
  const { commit, check, pr } = fixture(t);
  const message = [
    'Handle Claude API rate limits',
    '',
    'Document Gemini and Claude tools.',
    'Co-Authored-By: Claude Martin <claude@example.com>',
    'Co-Authored-By: Alex Example <alex@example.com>',
  ].join('\n');
  const result = check(pr(commit(message)), message);
  assert.equal(result.status, 0, result.stderr);
});

test('skips an event without PR metadata and prints a notice', (t) => {
  const { check } = fixture(t);
  const result = check(undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /::notice::Skipping AI attribution check/);
});
