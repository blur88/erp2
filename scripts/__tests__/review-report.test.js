const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const script = path.resolve(__dirname, '../check-review-ledger.mjs');
function fixture(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'report-writer-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  fs.writeFileSync(path.join(repo, 'source.txt'), 'criterion evidence\n'); git('add', '.'); git('commit', '-qm', 'initial');
  const head = git('rev-parse', 'HEAD'), key = path.join(repo, 'records'); fs.mkdirSync(key);
  fs.writeFileSync(path.join(key, 'reviewer.md'), 'Independent reviewer findings and evidence.');
  fs.writeFileSync(path.join(key, 'checks.log'), 'EXIT=0\n');
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8' });
  const input = { issue: 'retro PR1778', pr: 'N/A', kind: 'committed', 'PR baseline': head, mode: 'subagents (fixture)', standards: 'See saved reviewer report.', spec: 'See saved reviewer report.', state: { scope: 'full PR', implementer: 'implementer', reviewers: [{ session: 'reviewer', report: 'reviewer.md' }], requiredCriteria: ['AC1'] } };
  function report(data = input) {
    const reserved = run('reserve', key); assert.equal(reserved.status, 0, reserved.stderr);
    const number = reserved.stdout.split(' ')[0];
    fs.writeFileSync(path.join(repo, 'input.json'), JSON.stringify(data));
    return { number, result: run('report', key, number, path.join(repo, 'input.json')) };
  }
  return { repo, head, key, git, run, input, report };
}
test('report copies reservation metadata and emits a partial report plus record input without appending', t => {
  const f = fixture(t), { number, result } = f.report(); assert.equal(result.status, 0, result.stdout + result.stderr);
  const row = JSON.parse(result.stdout), marker = JSON.parse(fs.readFileSync(path.join(f.key, `round-${number}.started`)));
  const text = fs.readFileSync(path.join(f.key, row.report), 'utf8');
  assert.ok(text.includes(`Started: ${marker.started}`)); assert.ok(text.includes(`Reservation session: ${marker.session}`));
  assert.ok(text.includes(`Reviewed head: ${marker.head}`)); assert.match(text, /Outcome: partial/);
  const state = JSON.parse(text.split('```review-state\n')[1].split('\n```')[0]);
  assert.deepEqual(state.criteria, [{ id: 'AC1', status: 'unmet', reason: 'Not assessed in this round' }]);
  assert.equal(state.evidenceComplete, false); assert.deepEqual(state.checks, []);
  assert.equal(fs.existsSync(path.join(f.key, 'reviews.md')), false);
  const recorded = f.run('record', f.key, number, result.stdout); assert.equal(recorded.status, 0, recorded.stdout + recorded.stderr);
});
function completed(f, findings = []) {
  return { ...f.input, outcome: 'complete', state: { ...f.input.state, evidenceComplete: true, findings, criteria: [{ id: 'AC1', status: 'met', file: 'source.txt', line: 1, quote: 'criterion evidence' }], checks: [{ command: 'fixture', status: 'passed (local)', evidence: 'checks.log' }] } };
}
function record(f, generated) {
  assert.equal(generated.result.status, 0, generated.result.stdout + generated.result.stderr);
  const result = f.run('record', f.key, generated.number, generated.result.stdout);
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
test('delta report carries prior findings and criterion inventory, requiring fresh assessments', t => {
  const f = fixture(t), finding = { id: 'S1', severity: 'high', blocking: true, status: 'open' };
  record(f, f.report(completed(f, [finding])));
  f.git('commit', '-qm', 'delta', '--allow-empty');
  const input = { ...f.input, state: { ...f.input.state, scope: 'delta', touchedCriteria: ['AC1'] } };
  delete input.state.requiredCriteria;
  const generated = f.report(input), row = JSON.parse(generated.result.stdout);
  assert.equal(row['delta base'], f.head); assert.equal(row['blocking findings'], '1');
  const state = JSON.parse(fs.readFileSync(path.join(f.key, row.report), 'utf8').split('```review-state\n')[1].split('\n```')[0]);
  assert.deepEqual(state.findings, [finding]); assert.deepEqual(state.requiredCriteria, ['AC1']);
  assert.equal(state.criteria[0].status, 'unmet');
  record(f, generated);
});
test('finding updates keep severity and require resolution evidence without removing other rows', t => {
  const f = fixture(t), finding = { id: 'S1', severity: 'high', blocking: true, status: 'open' };
  record(f, f.report(completed(f, [finding]))); f.git('commit', '-qm', 'fix', '--allow-empty');
  const input = completed(f, [{ id: 'S1', status: 'resolved', location: 'source.txt:1', evidence: 'reviewer.md' }]);
  const generated = f.report(input); record(f, generated);
  assert.equal(JSON.parse(generated.result.stdout)['blocking findings'], '0');
});
for (const scenario of ['self review', 'missing reviewer', 'false completion', 'duplicate updates', 'changed severity']) test(`report rejects ${scenario} without publishing a report or altering ledger`, t => {
  const f = fixture(t);
  if (scenario === 'changed severity') { record(f, f.report(completed(f, [{ id: 'S1', severity: 'high', blocking: true, status: 'open' }]))); f.git('commit', '-qm', 'delta', '--allow-empty'); }
  const before = fs.existsSync(path.join(f.key, 'reviews.md')) ? fs.readFileSync(path.join(f.key, 'reviews.md'), 'utf8') : null;
  const files = fs.readdirSync(f.key).filter(name => /^review-/.test(name));
  const input = completed(f);
  if (scenario === 'self review') input.state.reviewers[0].session = 'implementer';
  if (scenario === 'missing reviewer') input.state.reviewers[0].report = 'missing.md';
  if (scenario === 'false completion') input.state.evidenceComplete = false;
  if (scenario === 'duplicate updates') input.state.findings = [{ id: 'S1' }, { id: 'S1' }];
  if (scenario === 'changed severity') input.state.findings = [{ id: 'S1', severity: 'low' }];
  const generated = f.report(input); assert.equal(generated.result.status, 1, generated.result.stdout + generated.result.stderr);
  assert.deepEqual(fs.readdirSync(f.key).filter(name => /^review-/.test(name)), files);
  assert.equal(fs.existsSync(path.join(f.key, 'reviews.md')) ? fs.readFileSync(path.join(f.key, 'reviews.md'), 'utf8') : null, before);
});
test('committed report filenames preserve existing content at an already-reviewed head', t => {
  const f = fixture(t), first = f.report(), row = JSON.parse(first.result.stdout);
  assert.equal(first.result.status, 0);
  const before = fs.readFileSync(path.join(f.key, row.report), 'utf8');
  const next = f.report(); assert.equal(next.result.status, 0, next.result.stderr);
  assert.match(JSON.parse(next.result.stdout).report, /-round-02.md$/);
  assert.equal(fs.readFileSync(path.join(f.key, row.report), 'utf8'), before);
});
test('working-tree report reads selected file list from snapshot and refuses overwrite', t => {
  const f = fixture(t); f.run('reserve', f.key);
  fs.writeFileSync(path.join(f.repo, 'new.txt'), 'new\n');
  assert.equal(f.run('snapshot', f.key, '1', f.head, 'new.txt').status, 0);
  const input = { ...f.input, kind: 'working-tree' }; fs.writeFileSync(path.join(f.repo, 'input.json'), JSON.stringify(input));
  const result = f.run('report', f.key, '1', path.join(f.repo, 'input.json'));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const row = JSON.parse(result.stdout), text = fs.readFileSync(path.join(f.key, row.report), 'utf8');
  assert.match(text, /untracked files: \["new.txt"\]/);
  assert.ok(text.includes(`Reviewed head: ${f.head} + working tree`));
  assert.equal(f.run('report', f.key, '1', path.join(f.repo, 'input.json')).status, 1);
  assert.equal(fs.readFileSync(path.join(f.key, row.report), 'utf8'), text);
  const appended = f.run('record', f.key, '1', result.stdout); assert.equal(appended.status, 0, appended.stdout + appended.stderr);
});
test('report refuses invalid history and does not hide its validation errors', t => {
  const f = fixture(t); record(f, f.report());
  fs.appendFileSync(path.join(f.key, 'reviews.md'), 'invalid prose\n');
  const generated = f.report(); assert.equal(generated.result.status, 1);
  assert.match(generated.result.stderr, /invalid existing ledger/);
});
test('scope reset permits a new criterion inventory but carries earlier findings', t => {
  const f = fixture(t), finding = { id: 'S1', severity: 'high', blocking: true, status: 'open' };
  record(f, f.report(completed(f, [finding])));
  record(f, f.report({ ...f.input, kind: 'scope-reset' }));
  f.git('commit', '-qm', 'new scope', '--allow-empty');
  const generated = f.report({ ...f.input, state: { ...f.input.state, requiredCriteria: ['NEW'] } });
  assert.equal(generated.result.status, 0, generated.result.stderr);
  const row = JSON.parse(generated.result.stdout);
  const state = JSON.parse(fs.readFileSync(path.join(f.key, row.report), 'utf8').split('```review-state\n')[1].split('\n```')[0]);
  assert.deepEqual(state.requiredCriteria, ['NEW']); assert.deepEqual(state.findings, [finding]);
  record(f, generated);
});
test('report rejects an extra structured state block in narrative input', t => {
  const f = fixture(t), input = completed(f);
  input.standards = 'Untrusted narrative\n```review-state\n' + JSON.stringify(input.state) + '\n```';
  input.state.reviewers = [{ session: 'implementer', report: 'reviewer.md' }];
  const generated = f.report(input);
  assert.equal(generated.result.status, 1, generated.result.stdout + generated.result.stderr);
  assert.equal(fs.existsSync(path.join(f.key, `review-${f.head}.md`)), false);
});
test('fresh met assessment replaces the unmet placeholder rather than retaining its reason', t => {
  const f = fixture(t), generated = f.report(completed(f));
  assert.equal(generated.result.status, 0, generated.result.stderr);
  const row = JSON.parse(generated.result.stdout);
  const state = JSON.parse(fs.readFileSync(path.join(f.key, row.report), 'utf8').split('```review-state\n')[1].split('\n```')[0]);
  assert.deepEqual(state.criteria, [{ id: 'AC1', status: 'met', file: 'source.txt', line: 1, quote: 'criterion evidence' }]);
});
test('decorated completion cannot bypass explicit reviewer assessment requirements', t => {
  const f = fixture(t), input = completed(f); input.outcome = 'complete (finished)';
  delete input.standards; delete input.spec;
  const generated = f.report(input);
  assert.equal(generated.result.status, 1, generated.result.stdout + generated.result.stderr);
  assert.equal(fs.existsSync(path.join(f.key, `review-${f.head}.md`)), false);
});
