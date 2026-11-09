const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const script = path.resolve(__dirname, '../check-review-ledger.mjs');
function fixture(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'review-states-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(repo, 'source.txt'), 'criterion evidence\n');
  git('add', '.'); git('commit', '-qm', 'initial');
  const head = git('rev-parse', 'HEAD'), key = path.join(repo, 'records'); fs.mkdirSync(key);
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8' });
  function round(change = {}, kind = 'committed', outcome = 'complete') {
    const reserved = run('reserve', key); assert.equal(reserved.status, 0, reserved.stderr);
    const n = reserved.stdout.split(' ')[0], current = git('rev-parse', 'HEAD');
    if (kind === 'working-tree') assert.equal(run('snapshot', key, n, head).status, 0);
    const report = kind === 'committed' ? `review-${current}${fs.existsSync(path.join(key, `review-${current}.md`)) ? `-round-${n}` : ''}.md` : `review-round-${n}.md`;
    const data = { scope: 'full PR', implementer: 'implementer-session', reviewers: [{ session: 'reviewer-session', report }], requiredCriteria: ['AC1'], touchedCriteria: [], criteria: [{ id: 'AC1', status: 'met', file: 'source.txt', line: 1, quote: 'criterion evidence' }], findings: [], evidenceComplete: true, checks: [{ command: 'fixture', status: 'passed (local)', evidence: 'checks.log' }], ...change };
    fs.writeFileSync(path.join(key, 'checks.log'), 'EXIT=0\n');
    fs.writeFileSync(path.join(key, report), `# Review round ${n}\nIssue / PR / key: #1761 / N/A / records\nKind: ${kind}\nPR baseline: ${head}\nDelta base: ${data.scope === 'full PR' ? 'N/A' : head}\nReviewed head: ${current}${kind === 'working-tree' ? ' + working tree' : ''}\nWorking tree included: ${kind === 'working-tree' ? 'yes' : 'no'}\nScope: ${data.scope}; mode: subagents\nVerification: fixture passed (local)\n## Standards\nNone.\n## Spec\nSee structured evidence.\n\`\`\`review-state\n${JSON.stringify(data)}\n\`\`\`\n`);
    const row = { kind, 'PR baseline': head, 'delta base': data.scope === 'full PR' ? 'N/A' : head, mode: 'subagents', outcome, 'blocking findings': data.findings.filter(f => f.status === 'open' && f.blocking).length, report };
    return run('record', key, n, JSON.stringify(row));
  }
  return { repo, key, head, git, run, round, state: () => JSON.parse(run('state', key).stdout) };
}
test('complete delta coverage advances progression without full coverage, reuse or merge permission', t => {
  const f = fixture(t);
  assert.equal(f.round().status, 0);
  f.git('commit', '-qm', 'delta', '--allow-empty');
  const result = f.round({ scope: 'delta', touchedCriteria: ['AC1'] }); assert.equal(result.status, 0, result.stdout + result.stderr);
  const state = f.state();
  assert.equal(state.lastReviewedCommit, f.git('rev-parse', 'HEAD'));
  assert.equal(state.rounds.at(-1).completion, 'complete');
  assert.deepEqual(state.rounds.at(-1).coverage, { scope: 'delta', complete: true });
  assert.equal(state.rounds.at(-1).reuseEligible, false);
  assert.equal(state.rounds.at(-1).mergeEligible, false);
});
for (const [name, change, expected] of [
  ['self review', { reviewers: [{ session: 'implementer-session', report: 'checks.log' }] }, /independent reviewer/],
  ['missing criterion', { criteria: [] }, /criterion missing/],
  ['fabricated evidence', { criteria: [{ id: 'AC1', status: 'met', file: 'source.txt', line: 1, quote: 'invented' }] }, /unverifiable/],
  ['missing execution evidence', { evidenceComplete: false }, /lacks required evidence/],
  ['missing saved reviewer report', { reviewers: [{ session: 'reviewer', report: 'absent.md' }] }, /saved reports/],
]) test(`writer rejects ${name} without advancing history`, t => {
  const f = fixture(t), result = f.round(change);
  assert.equal(result.status, 1, result.stdout + result.stderr); assert.match(result.stdout, expected);
  assert.equal(f.state().lastReviewedCommit, null);
});
test('complete review with open findings advances progression and carries findings into deltas', t => {
  const f = fixture(t), finding = { id: 'S1', severity: 'high', blocking: true, status: 'open' };
  assert.equal(f.round({ findings: [finding] }).status, 0);
  assert.equal(f.state().lastReviewedCommit, f.head);
  assert.equal(f.state().rounds[0].reuseEligible, false);
  f.git('commit', '-qm', 'delta', '--allow-empty');
  const missing = f.round({ scope: 'delta', touchedCriteria: [] });
  assert.equal(missing.status, 1); assert.match(missing.stdout, /earlier finding missing/);
  assert.equal(f.state().lastReviewedCommit, f.head);
  const retained = f.round({ scope: 'delta', findings: [finding] });
  assert.equal(retained.status, 0, retained.stdout + retained.stderr);
});
test('earlier unmet criteria remain required in delta reports', t => {
  const f = fixture(t);
  assert.equal(f.round({ criteria: [{ id: 'AC1', status: 'unmet', reason: 'not built' }] }).status, 0);
  f.git('commit', '-qm', 'delta', '--allow-empty');
  const result = f.round({ scope: 'delta', criteria: [] });
  assert.equal(result.status, 1); assert.match(result.stdout, /criterion missing: AC1/);
});
test('requested re-review at the same head retains progression and cites owner request', t => {
  const f = fixture(t); assert.equal(f.round().status, 0);
  assert.equal(f.round().status, 1);
  fs.writeFileSync(path.join(f.key, 'request.md'), 'Owner requests full PR re-review of round 1.');
  const result = f.round({ rereview: { round: 1, authorization: 'request.md' } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(f.state().lastReviewedCommit, f.head);
});
for (const outcome of ['partial', 'aborted']) test(`${outcome} reviews do not advance history`, t => {
  const f = fixture(t); assert.equal(f.round({}, 'committed', outcome).status, 0);
  assert.equal(f.state().lastReviewedCommit, null);
});
for (const change of [
  { criteria: [{ id: 'AC1', status: 'unmet', reason: 'missing' }] },
  { evidenceComplete: false },
  { checks: [{ command: 'fixture', status: 'failed', evidence: 'checks.log' }] },
]) test(`pre-merge rejects eligibility with ${JSON.stringify(change)}`, t => {
  const f = fixture(t); assert.equal(f.round().status, 0);
  const result = f.round(change, 'pre-merge');
  if (result.status === 0) assert.equal(f.state().rounds.at(-1).mergeEligible, false);
  else assert.match(result.stdout, /required evidence/);
});
test('invalid complete records cannot establish the head for pre-merge', t => {
  const f = fixture(t); assert.equal(f.round().status, 0);
  const ledger = path.join(f.key, 'reviews.md');
  fs.writeFileSync(ledger, fs.readFileSync(ledger, 'utf8').replace('subagents', 'invalid'));
  fs.unlinkSync(path.join(f.key, 'round-01.started'));
  const result = f.round({}, 'pre-merge');
  assert.equal(result.status, 1); assert.match(result.stdout, /last reviewed commit/);
});
test('same-head re-review preserves the progression round used by later re-reviews', t => {
  const f = fixture(t); assert.equal(f.round().status, 0);
  fs.writeFileSync(path.join(f.key, 'request.md'), 'Owner requests round 1 again.');
  assert.equal(f.round({ rereview: { round: 1, authorization: 'request.md' } }).status, 0);
  const result = f.round({ rereview: { round: 1, authorization: 'request.md' } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
test('TAP failure in a saved check prevents reuse and merge even with exit zero', t => {
  const f = fixture(t); assert.equal(f.round().status, 0);
  fs.writeFileSync(path.join(f.key, 'checks.log'), 'not ok 1 actual failure\nEXIT=0\n');
  assert.equal(f.state().rounds[0].reuseEligible, false);
});
for (const scope of ['delta', 'inherited']) test(`first ${scope} review without full coverage cannot advance`, t => {
  const f = fixture(t), result = f.round({ scope, criteria: [], touchedCriteria: [] });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(f.state().lastReviewedCommit, null);
});

test('historical working-tree criterion evidence stays bound to its captured tree', t => {
  const f = fixture(t);
  assert.equal(f.round({}, 'working-tree').status, 0);
  fs.writeFileSync(path.join(f.repo, 'source.txt'), 'later edit\n');
  const result = f.run('state', f.key);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(JSON.parse(result.stdout).rounds[0].coverage.complete, true);
});
test('verified working-tree difference supports inherited progression but never Spec reuse', t => {
  const f = fixture(t); assert.equal(f.round({}, 'working-tree').status, 0);
  const manifest = JSON.parse(fs.readFileSync(path.join(f.key, 'review-round-01.snapshot.json')));
  fs.writeFileSync(path.join(f.repo, 'source.txt'), 'criterion evidence\ncommitted difference\n');
  f.git('add', 'source.txt'); f.git('commit', '-qm', 'difference');
  fs.writeFileSync(path.join(f.key, 'difference.patch'), f.git('diff', '--binary', '--full-index', '--no-ext-diff', '--no-textconv', manifest.tree, 'HEAD', '--') + '\n');
  const result = f.round({ scope: 'inherited', touchedCriteria: ['AC1'], inheritance: { round: 1, comparison: 'difference.patch' } });
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(f.state().lastReviewedCommit, f.git('rev-parse', 'HEAD'));
  assert.equal(f.state().rounds.at(-1).reuseEligible, false);
});
test('scope reset prevents inheritance from earlier working-tree coverage', t => {
  const f = fixture(t); assert.equal(f.round({}, 'working-tree').status, 0);
  assert.equal(f.round({}, 'scope-reset').status, 0);
  f.git('commit', '-qm', 'after reset', '--allow-empty');
  fs.writeFileSync(path.join(f.key, 'difference.patch'), '');
  const result = f.round({ scope: 'inherited', inheritance: { round: 1, comparison: 'difference.patch' } });
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.equal(f.state().lastReviewedCommit, null);
});
