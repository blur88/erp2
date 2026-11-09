const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const script = path.resolve(__dirname, '../check-review-ledger.mjs');
function fixture(t) {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim();
  git('init', '-q'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.invalid');
  git('commit', '-qm', 'initial', '--allow-empty');
  const head = git('rev-parse', 'HEAD');
  const key = path.join(repo, 'records'); fs.mkdirSync(key);
  const run = (...args) => spawnSync(process.execPath, [script, ...args], { cwd: repo, encoding: 'utf8' });
  return { repo, key, head, git, run };
}
test('reserve and status preserve a reservation without treating it as a failed round', (t) => {
  const f = fixture(t);
  assert.equal(f.run('reserve', f.key).status, 0);
  assert.match(f.run('status', f.key).stdout, /01.*codex|01.*claude-code/);
  assert.match(f.run(f.key).stdout, /reservation/);
});
function reviewed(f) {
  assert.equal(f.run('reserve', f.key).status, 0);
  const marker = JSON.parse(fs.readFileSync(path.join(f.key, 'round-01.started')));
  const report = `review-${f.head}.md`;
  const text = `# Review round 01
Issue / PR / key: #1731 / N/A / records
Kind: committed
PR baseline: ${f.head}
Delta base: N/A
Reviewed head: ${f.head}
Working tree included: no; untracked files: none; patch: N/A
Scope: full PR; mode: inline (fixture)
Verification: node --version: passed (local)
Verification gaps: none
## Standards
None.
## Spec
None.
Outcome: complete
`;
  fs.writeFileSync(path.join(f.key, report), text);
  const row = { kind: 'committed', 'PR baseline': f.head, 'delta base': 'N/A', mode: 'inline (fixture)', outcome: 'complete', 'blocking findings': 'none', report };
  assert.equal(f.run('record', f.key, '1', JSON.stringify(row)).status, 0);
  return { marker, report, text, row };
}
test('record copies marker identity, note stays outside the ledger, compare checks actual bytes', (t) => {
  const f = fixture(t), { marker } = reviewed(f);
  assert.equal(f.run(f.key).status, 0);
  assert.match(fs.readFileSync(path.join(f.key, 'reviews.md'), 'utf8'), new RegExp(marker.started.replace(/[+.]/g, '\\$&')));
  assert.equal(f.run('note', f.key, 'verification completed').status, 0);
  assert.ok(fs.readFileSync(path.join(f.key, 'notes.md'), 'utf8').includes(f.head));
  const patch = path.join(f.repo, 'saved.patch'); fs.writeFileSync(patch, '');
  assert.equal(f.run('compare', patch, f.head, f.head).status, 0);
  fs.writeFileSync(patch, 'different'); assert.equal(f.run('compare', patch, f.head, f.head).status, 1);
});
const badCases = [
  ['table prose', (f) => fs.appendFileSync(path.join(f.key, 'reviews.md'), 'orphan paragraph\n'), /table/],
  ['repeated table header', (f) => fs.appendFileSync(path.join(f.key, 'reviews.md'), '| round | kind | started | PR baseline | delta base | reviewed head | mode | outcome | blocking findings | report |\n'), /table/],
  ['missing column', (f) => editLedger(f, (s) => s.replace('| none | review-', '| review-')), /table/],
  ['short SHA', (f) => editLedger(f, (s) => s.replace(f.head, f.head.slice(0, 8))), /full SHA/],
  ['duplicate round', (f) => editLedger(f, (s) => s + s.split('\n')[2] + '\n'), /unique and increasing/],
  ['missing marker', (f) => fs.unlinkSync(path.join(f.key, 'round-01.started')), /marker/],
  ['different start', (f) => editLedger(f, (s) => s.replace(/\d{4}-\d\d-\d\dT[^ |]+/, '2000-01-01T00:00:00Z')), /started differs/],
  ['missing report', (f, r) => fs.unlinkSync(path.join(f.key, r.report)), /report missing/],
  ['old report', (f, r) => fs.utimesSync(path.join(f.key, r.report), 0, 0), /predates/],
  ['bad report name', (f, r) => { fs.renameSync(path.join(f.key, r.report), path.join(f.key, 'wrong.md')); editLedger(f, (s) => s.replace(r.report, 'wrong.md')); }, /report name/],
  ['missing header', (f, r) => fs.writeFileSync(path.join(f.key, r.report), r.text.replace('Kind: committed\n', '')), /header missing kind/],
  ['invalid session', (f) => editMarker(f, { session: 'same session' }), /invalid harness session/],
  ['bad fallback', (f) => editMarker(f, { fallback: true, hostname: null }), /fallback needs/],
  ['wrong marker head', (f) => editMarker(f, { head: 'a'.repeat(40) }), /differs from marker/],
  ['log contradiction', (f, r) => { fs.writeFileSync(path.join(f.key, 'bad.log'), 'not ok 1\nEXIT=1\n'); fs.appendFileSync(path.join(f.key, r.report), '\nVerification: pending [log](bad.log)\n'); }, /contradicts saved log/],
];
function editLedger(f, fn) { const p = path.join(f.key, 'reviews.md'); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); }
function editMarker(f, fields) { const p = path.join(f.key, 'round-01.started'); fs.writeFileSync(p, JSON.stringify({ ...JSON.parse(fs.readFileSync(p)), ...fields })); }
for (const [name, mutate, expected] of badCases) test(`checker rejects ${name}`, (t) => {
  const f = fixture(t), r = reviewed(f); mutate(f, r);
  const result = f.run(f.key); assert.equal(result.status, 1, result.stdout); assert.match(result.stdout, expected);
});
test('subagent duration warns without rejecting an otherwise valid round', (t) => {
  const f = fixture(t); reviewed(f); editLedger(f, (s) => s.replace('inline (fixture)', 'subagents'));
  const result = f.run(f.key); assert.equal(result.status, 0, result.stdout); assert.match(result.stdout, /within 60 s/);
});
test('invalid record is rejected without mutating the ledger', (t) => {
  const f = fixture(t), r = reviewed(f), before = fs.readFileSync(path.join(f.key, 'reviews.md'), 'utf8');
  assert.equal(f.run('record', f.key, '1', JSON.stringify(r.row)).status, 1);
  assert.equal(fs.readFileSync(path.join(f.key, 'reviews.md'), 'utf8'), before);
});
function nextRound(f, kind, outcome = 'complete', blocking = 'none') {
  const reserve = f.run('reserve', f.key); assert.equal(reserve.status, 0, reserve.stderr);
  const n = reserve.stdout.split(' ')[0];
  const report = `review-round-${n}.md`;
  fs.writeFileSync(path.join(f.key, report), `# Review round ${n}
Issue / PR / key: #1731 / 42 / records
Kind: ${kind}
PR baseline: ${f.head}
Delta base: N/A
Reviewed head: ${f.head}${kind === 'working-tree' ? ' + working tree' : ''}
Working tree included: ${kind === 'working-tree' ? 'yes' : 'no'}
Scope: full PR; mode: inline
Verification: node --version: passed (local)
Verification gaps: none
## Standards
None
## Spec
None
Outcome: ${outcome}
`);
  const row = { kind, 'PR baseline': f.head, 'delta base': 'N/A', mode: 'inline', outcome, 'blocking findings': blocking, report };
  return f.run('record', f.key, n, JSON.stringify(row));
}
test('pre-merge requires committed history, full scope, and starts after completion', (t) => {
  const f = fixture(t);
  assert.equal(nextRound(f, 'pre-merge').status, 1);
  assert.equal(fs.existsSync(path.join(f.key, 'reviews.md')), false);
  reviewedAfterReservation(f);
});
function reviewedAfterReservation(f) {
  // An abandoned reservation consumes its number; a fresh key isolates the next scenario.
  fs.rmSync(f.key, { recursive: true }); fs.mkdirSync(f.key); reviewed(f);
  assert.equal(nextRound(f, 'pre-merge').status, 0);
  const p = path.join(f.key, 'review-round-02.md');
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace('Scope: full PR', 'Scope: delta'));
  assert.match(f.run(f.key).stdout, /scope must be full PR/);
}
for (const kind of ['working-tree', 'scope-reset']) test(`${kind} never establishes a committed head`, (t) => {
  const f = fixture(t); assert.equal(nextRound(f, kind).status, 0);
  const result = nextRound(f, 'pre-merge'); assert.equal(result.status, 1); assert.match(result.stdout, /last reviewed commit/);
});
for (const outcome of ['partial', 'aborted']) test(`${outcome} committed rounds never establish a committed head`, (t) => {
  const f = fixture(t), r = reviewed(f); editLedger(f, (s) => s.replace('complete', outcome));
  const result = nextRound(f, 'pre-merge'); assert.equal(result.status, 1); assert.match(result.stdout, /last reviewed commit/);
});
test('scope reset clears earlier committed history', (t) => {
  const f = fixture(t); reviewed(f); assert.equal(nextRound(f, 'scope-reset').status, 0);
  assert.equal(nextRound(f, 'pre-merge').status, 1);
});
test('reserve races take distinct numbers and reports reserve numbers too', async (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.key, 'review-old.md'), '# Review round 08\n');
  const { spawn } = require('node:child_process'); const { once } = require('node:events');
  const children = Array.from({ length: 5 }, () => spawn(process.execPath, [script, 'reserve', f.key], { cwd: f.repo }));
  const codes = await Promise.all(children.map(async (child) => (await once(child, 'close'))[0]));
  assert.deepEqual(codes, [0, 0, 0, 0, 0]);
  assert.deepEqual(fs.readdirSync(f.key).filter((s) => s.endsWith('.started')), ['round-09.started', 'round-10.started', 'round-11.started', 'round-12.started', 'round-13.started']);
});
for (const env of [{ CLAUDE_CODE_SESSION_ID: '12345678-1234-1234-1234-123456789abc' }, { CODEX_THREAD_ID: '87654321-1234-1234-1234-123456789abc' }, {}]) test(`reserve reports harness identity: ${Object.keys(env)[0] ?? 'fallback'}`, (t) => {
  const f = fixture(t), cleanEnv = { ...process.env };
  for (const name of ['CLAUDE_CODE_SESSION_ID', 'CODEX_SESSION_ID', 'CODEX_THREAD_ID']) delete cleanEnv[name];
  const result = spawnSync(process.execPath, [script, 'reserve', f.key], { cwd: f.repo, env: { ...cleanEnv, ...env }, encoding: 'utf8' });
  assert.equal(result.status, 0);
  const data = JSON.parse(fs.readFileSync(path.join(f.key, 'round-01.started')));
  assert.equal(data.harness, env.CLAUDE_CODE_SESSION_ID ? 'claude-code' : 'codex');
  assert.ok(data.hostname); assert.ok(data.pid > 0);
  assert.equal(data.nativeId, Object.values(env)[0] ?? null);
});
function gateFixture(f) {
  f.git('switch', '-qc', 'feat/1731-ledger'); f.git('config', 'review.scratchRoot', '../.scratch');
  const key = path.join(f.repo, '.scratch', '1731'); fs.mkdirSync(key, { recursive: true }); f.key = key;
}
const hook = path.resolve(__dirname, '../review-pr-hook.mjs');
for (const scenario of ['missing', 'invalid', 'head mismatch', 'valid']) test(`create hook: ${scenario}`, (t) => {
  const f = fixture(t); gateFixture(f);
  if (scenario !== 'missing') reviewed(f);
  if (scenario === 'invalid') fs.appendFileSync(path.join(f.key, 'reviews.md'), 'prose');
  if (scenario === 'head mismatch') f.git('commit', '-qm', 'new', '--allow-empty');
  for (const command of ['gh pr create', 'gh -R owner/repo pr create', "'gh' 'pr' 'create'", 'true && gh pr create']) {
    const result = spawnSync(process.execPath, [hook], { cwd: f.repo, encoding: 'utf8', input: JSON.stringify({ tool_input: { command } }) });
    assert.equal(result.status, scenario === 'valid' ? 0 : 2, result.stdout + result.stderr);
  }
});
for (const scenario of ['no pre-merge', 'partial', 'aborted', 'blocking', 'head mismatch', 'missing match', 'different match', 'checks failed', 'allowed']) test(`merge gate: ${scenario}`, (t) => {
  const f = fixture(t); gateFixture(f); reviewed(f);
  if (scenario !== 'no pre-merge') assert.equal(nextRound(f, 'pre-merge', ['partial', 'aborted'].includes(scenario) ? scenario : 'complete', scenario === 'blocking' ? '1' : 'none').status, 0);
  const bin = path.join(f.repo, 'bin'); fs.mkdirSync(bin);
  const calls = path.join(f.repo, 'calls');
  fs.writeFileSync(path.join(bin, 'gh'), `#!/bin/sh\nprintf '%s\\n' "$*" >> '${calls}'\ncase "$2" in\nview) printf '%s\\n' '{"headRefOid":"${scenario === 'head mismatch' ? 'a'.repeat(40) : f.head}"}' ;;\nchecks) exit ${scenario === 'checks failed' ? '1' : '0'} ;;\nesac\n`, { mode: 0o755 });
  const flags = scenario === 'missing match' ? [] : ['--match-head-commit', scenario === 'different match' ? 'b'.repeat(40) : scenario === 'head mismatch' ? 'a'.repeat(40) : f.head];
  const result = spawnSync(process.execPath, [script, 'merge', '42', ...flags], { cwd: f.repo, encoding: 'utf8', env: { ...process.env, PATH: bin + path.delimiter + process.env.PATH } });
  assert.equal(result.status, scenario === 'allowed' ? 0 : 1, result.stdout + result.stderr);
  const log = fs.readFileSync(calls, 'utf8');
  assert.equal(log.includes('pr merge'), scenario === 'allowed');
  if (scenario === 'allowed') assert.match(log, /pr checks 42 --required --watch\npr checks 42 --watch\npr merge 42 --match-head-commit/);
});
for (const [name, change, expected] of [
  ['embedded UUID prose', (f) => editMarker(f, { session: 'same session 12345678-1234-1234-1234-123456789abc garbage' }), /invalid harness session/],
  ['report kind mismatch', (f, r) => fs.writeFileSync(path.join(f.key, r.report), r.text.replace('Kind: committed', 'Kind: pre-merge')), /report kind differs/],
  ['report round mismatch', (f, r) => fs.writeFileSync(path.join(f.key, r.report), r.text.replace('round 01', 'round 99')), /report round differs/],
  ['TAP failure despite zero exit', (f, r) => { fs.writeFileSync(path.join(f.key, 'tap.log'), '# run-gate\n--- output ---\nnot ok 1\n--- end output ---\nEXIT=0\n'); fs.appendFileSync(path.join(f.key, r.report), '\nVerification: passed (local) [log](tap.log)\n'); }, /contradicts saved log/],
]) test(`checker rejects ${name}`, (t) => {
  const f = fixture(t), r = reviewed(f); change(f, r); const result = f.run(f.key);
  assert.equal(result.status, 1, result.stdout); assert.match(result.stdout, expected);
});
test('committed reconciliation can reference its byte-identical working-tree report', (t) => {
  const f = fixture(t);
  assert.equal(nextRound(f, 'working-tree').status, 0);
  fs.writeFileSync(path.join(f.key, 'review-round-01.patch'), '');
  assert.equal(f.run('reserve', f.key).status, 0);
  const row = { kind: 'committed', 'PR baseline': f.head, 'delta base': 'round-01 saved state', mode: 'inline', outcome: 'complete', 'blocking findings': 'none', report: 'review-round-01.md' };
  const result = f.run('record', f.key, '2', JSON.stringify(row));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  editLedger(f, (s) => s.replace('| none | review-round-01.md |', '| 1 | review-round-01.md |'));
  assert.match(f.run(f.key).stdout, /carry working-tree blocking findings/);
  fs.writeFileSync(path.join(f.key, 'review-round-01.patch'), 'different');
  assert.match(f.run(f.key).stdout, /reconciliation must match/);
});
