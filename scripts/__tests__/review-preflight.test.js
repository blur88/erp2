const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createGitFixture } = require('../helpers/git-fixture.cjs');
const script = path.resolve(__dirname, '../review-preflight.mjs');
function fixture(t) {
  const f = createGitFixture(); t.after(f.cleanup);
  f.git(['init', '-q']); f.git(['config', 'user.name', 'Fixture']); f.git(['config', 'user.email', 'fixture@example.invalid']);
  fs.writeFileSync(path.join(f.root, 'AGENTS.md'), 'Repository conventions override generic skills.\n');
  fs.writeFileSync(path.join(f.root, 'CLAUDE.md'), 'Read [rules](AGENTS.md).\n');
  fs.writeFileSync(path.join(f.root, 'CODING_STANDARDS.md'), 'Review standards.\n');
  fs.writeFileSync(path.join(f.root, 'source.txt'), 'source\n');
  f.git(['add', '.']); f.git(['commit', '-qm', 'initial']);
  const head = f.git(['rev-parse', 'HEAD']);
  fs.writeFileSync(path.join(f.root, 'request.json'), JSON.stringify({ baseline: head, kind: 'committed', scope: 'full PR', harness: 'codex', agent: 'fixture-agent' }));
  const run = (...args) => f.run(process.execPath, [script, ...args]);
  return { ...f, head, run };
}
test('preflight loads guidance before resolving baseline and saves hashes plus content', t => {
  const f = fixture(t), r = f.run('load', 'request.json');
  assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(r.stdout);
  assert.equal(data.status, 'passed'); assert.equal(data.baseline, f.head);
  assert.ok(data.conventions.some(c => c.path.endsWith('/AGENTS.md') && c.content.includes('Repository conventions') && /^[a-f0-9]{64}$/.test(c.sha256)));
});
for (const [name, mutate] of [
  ['missing guidance', f => fs.unlinkSync(path.join(f.root, 'AGENTS.md'))],
  ['broken pointer', f => fs.appendFileSync(path.join(f.root, 'CLAUDE.md'), '[missing](missing.md)')],
  ['conflict', f => fs.appendFileSync(path.join(f.root, 'AGENTS.md'), '\n<<<<<<< ours\n')],
  ['symlink escape', f => { fs.unlinkSync(path.join(f.root, 'AGENTS.md')); fs.symlinkSync('/etc/passwd', path.join(f.root, 'AGENTS.md')); }],
]) test(`preflight rejects ${name}`, t => { const f = fixture(t); mutate(f); const r = f.run('load', 'request.json'); assert.equal(r.status, 1, r.stdout); });
test('ledger reservation rejects absent preflight request', t => {
  const f = fixture(t);
  const outcome = require('node:child_process').spawnSync(process.execPath, [path.resolve(__dirname, '../check-review-ledger.mjs'), 'reserve', path.join(f.root, 'records')], { cwd: f.root, env: f.env, encoding: 'utf8' });
  assert.equal(outcome.status, 1, outcome.stdout);
});
for (const scenario of ['unchanged', 'changed conventions', 'changed head', 'tampered hashes', 'missing status']) test(`preflight validation: ${scenario}`, t => {
  const f = fixture(t), loaded = f.run('load', 'request.json'); assert.equal(loaded.status, 0, loaded.stderr);
  const data = JSON.parse(loaded.stdout);
  if (scenario === 'changed conventions') fs.appendFileSync(path.join(f.root, 'AGENTS.md'), 'New rule.\n');
  if (scenario === 'changed head') f.git(['commit', '--allow-empty', '-qm', 'changed']);
  if (scenario === 'tampered hashes') data.conventions[0].content += 'forged';
  if (scenario === 'missing status') delete data.status;
  fs.writeFileSync(path.join(f.root, 'evidence.json'), JSON.stringify(data));
  const r = f.run('validate', 'evidence.json'); assert.equal(r.status, scenario === 'unchanged' ? 0 : 1, r.stdout + r.stderr);
});
for (const valid of [false, true]) test(`Claude reviewer entry point ${valid ? 'injects loaded conventions' : 'blocks missing preflight'}`, t => {
  const f = fixture(t); f.git(['switch', '-qc', 'feat/1763-preflight']); f.git(['config', 'review.scratchRoot', '../.scratch']);
  const key = path.join(f.root, '.scratch', '1763');
  if (valid) {
    const request = JSON.parse(fs.readFileSync(path.join(f.root, 'request.json'))); request.harness = 'claude-code';
    fs.writeFileSync(path.join(f.root, 'request.json'), JSON.stringify(request));
    const response = require('node:child_process').spawnSync(process.execPath, [path.resolve(__dirname, '../check-review-ledger.mjs'), 'reserve', key, 'request.json'], { cwd: f.root, env: f.env, encoding: 'utf8' });
    assert.equal(response.status, 0, response.stderr);
  }
  const result = require('node:child_process').spawnSync(process.execPath, [path.resolve(__dirname, '../review-pr-hook.mjs')], { cwd: f.root, env: f.env, encoding: 'utf8', input: JSON.stringify({ tool_name: 'Agent', tool_input: { prompt: 'Review the change.' } }) });
  assert.equal(result.status, valid ? 0 : 2, result.stdout + result.stderr);
  if (valid) assert.match(JSON.parse(result.stdout).hookSpecificOutput.updatedInput.prompt, /Repository conventions/);
});
test('preflight discovers scoped guidance and rejects explicit unresolved conflicts', t => {
  const f = fixture(t); fs.mkdirSync(path.join(f.root, 'module'));
  fs.writeFileSync(path.join(f.root, 'module', 'AGENTS.md'), 'Scoped repository rule overrides generic skill defaults.\n');
  fs.writeFileSync(path.join(f.root, 'module', 'source.txt'), 'change');
  f.git(['add', 'module']); f.git(['commit', '-qm', 'scoped change']);
  const data = JSON.parse(f.run('load', 'request.json').stdout);
  assert.ok(data.conventions.some(c => c.path.endsWith('/module/AGENTS.md')));
  assert.match(data.precedence, /Repository conventions override generic skills/);
  const request = JSON.parse(fs.readFileSync(path.join(f.root, 'request.json'))); request.conflicts = ['Root and scoped instructions disagree'];
  fs.writeFileSync(path.join(f.root, 'request.json'), JSON.stringify(request));
  assert.equal(f.run('load', 'request.json').status, 1);
});
test('invalid UTF-8 guidance fails rather than loading replacement characters', t => {
  const f = fixture(t); fs.writeFileSync(path.join(f.root, 'AGENTS.md'), Buffer.from([0xff]));
  assert.equal(f.run('load', 'request.json').status, 1);
});
for (const pointer of ['[rules](<missing.md>)', '[rules](missing.md "required")', '[rules][required]\n[required]: missing.md']) test(`preflight rejects unresolved Markdown pointer ${pointer}`, t => {
  const f = fixture(t); fs.appendFileSync(path.join(f.root, 'AGENTS.md'), pointer);
  assert.equal(f.run('load', 'request.json').status, 1);
});
test('preflight rejects dangling scoped guidance symlinks', t => {
  const f = fixture(t); fs.mkdirSync(path.join(f.root, 'module'));
  fs.writeFileSync(path.join(f.root, 'module', 'source'), 'changed');
  f.git(['add', 'module']); f.git(['commit', '-qm', 'module']);
  fs.symlinkSync('missing.md', path.join(f.root, 'module', 'AGENTS.md'));
  assert.equal(f.run('load', 'request.json').status, 1);
});
test('literal replacement character in valid UTF-8 is readable guidance', t => {
  const f = fixture(t); fs.appendFileSync(path.join(f.root, 'AGENTS.md'), 'Literal replacement character: \uFFFD.');
  assert.equal(f.run('load', 'request.json').status, 0);
});
