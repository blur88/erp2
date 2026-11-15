const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, readFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const baselinePath = path.join(root, '.github/ruleset-15609777.snapshot.json');
const baseline = () => JSON.parse(readFileSync(baselinePath, 'utf8'));

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'ruleset-test-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return {
    dir,
    command(name, body) {
      writeFileSync(path.join(dir, name), `#!/bin/bash\n${body}\n`, { mode: 0o755 });
    },
    live(data) {
      const file = path.join(dir, 'live.json');
      writeFileSync(file, JSON.stringify(data));
      return file;
    },
    run(command, args, env = {}) {
      return spawnSync(command, args, {
        cwd: root,
        encoding: 'utf8',
        env: { ...process.env, PATH: `${dir}:${process.env.PATH}`, ...env },
      });
    },
  };
}

function compare(f, data) {
  return f.run(process.execPath, ['scripts/compare-ruleset.cjs', baselinePath, f.live(data)]);
}

test('equivalent reordered configuration ignores metadata and bypass actors', t => {
  const f = fixture(t);
  const live = baseline();
  live.rules.reverse();
  live.rules.find(rule => rule.type === 'required_status_checks').parameters.required_status_checks.reverse();
  live.id = 15609777;
  live.bypass_actors = [{ actor_type: 'RepositoryRole', bypass_mode: 'always' }];
  const result = compare(f, live);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /matches the reviewed baseline/);
});

test('rule removal and required check changes fail with a readable diff without updating baseline', t => {
  const f = fixture(t);
  const before = readFileSync(baselinePath, 'utf8');
  const live = baseline();
  live.rules = live.rules.filter(rule => rule.type !== 'pull_request');
  live.rules.find(rule => rule.type === 'required_status_checks').parameters.required_status_checks[0].context = 'Renamed check';
  const result = compare(f, live);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /drift detected/);
  assert.match(result.stdout, /--- committed baseline/);
  assert.match(result.stdout, /\+\+\+ live ruleset/);
  assert.match(result.stdout, /Renamed check/);
  assert.match(result.stdout, /-.*"type": "pull_request"/);
  assert.equal(readFileSync(baselinePath, 'utf8'), before);
});

test('normalize emits only observable configuration', t => {
  const f = fixture(t);
  const result = f.run(process.execPath, ['scripts/compare-ruleset.cjs', '--normalize', f.live({
    rules: [{ type: 'deletion' }], target: 'branch', enforcement: 'active',
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } }, bypass_actors: [],
  })]);
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), {
    target: 'branch', enforcement: 'active',
    conditions: { ref_name: { exclude: [], include: ['refs/heads/main'] } },
    rules: [{ type: 'deletion' }],
  });
});

test('missing observable fields stop with an access limitation message', t => {
  const f = fixture(t);
  for (const field of ['target', 'enforcement', 'conditions', 'rules']) {
    const live = baseline();
    delete live[field];
    const result = compare(f, live);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /stop and report the access limitation on #1898/);
  }
});

test('unreadable required check fields stop rather than becoming a baseline', t => {
  const f = fixture(t);
  const live = baseline();
  delete live.rules.find(rule => rule.type === 'required_status_checks').parameters.required_status_checks;
  const result = f.run(process.execPath, ['scripts/compare-ruleset.cjs', '--normalize', f.live(live)]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /stop and report the access limitation on #1898/);
});

test('diff tool failure cannot report a successful comparison', t => {
  const f = fixture(t);
  f.command('diff', 'echo "diff unavailable" >&2\nexit 2');
  const live = baseline();
  live.enforcement = 'disabled';
  const result = compare(f, live);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /diff failed with status 2/);
});

test('API access denial stops with instructions and does not invoke the comparator', t => {
  const f = fixture(t);
  f.command('gh', 'echo "Resource not accessible by integration" >&2\nexit 4');
  f.command('node', 'echo "comparator must not run" >&2\nexit 99');
  const result = f.run('bash', ['scripts/check-ruleset-drift.sh'], { GITHUB_REPOSITORY: 'blur88/erp2' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot read ruleset 15609777 with GITHUB_TOKEN/);
  assert.doesNotMatch(result.stderr, /comparator must not run/);
});

test('successful API read compares the returned configuration', t => {
  const f = fixture(t);
  f.command('gh', 'test "$1" = api && test "$2" = repos/blur88/erp2/rulesets/15609777 || exit 8\ncat "$RULESET_FIXTURE"');
  const result = f.run('bash', ['scripts/check-ruleset-drift.sh'], {
    GITHUB_REPOSITORY: 'blur88/erp2', RULESET_FIXTURE: f.live(baseline()),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /matches the reviewed baseline/);
});
