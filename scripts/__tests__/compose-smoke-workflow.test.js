// The Frontend CI job runs a Compose deployment and ingress smoke test when
// the stack's files change (#1966). Stub-based tests passed with real
// deploy.sh bugs in place (#1959), so this wiring is what puts the real stack
// in front of review. These assertions pin the properties the issue requires.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('yaml');

const workflow = parse(fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/ci.yml'), 'utf8'));
const steps = workflow.jobs['test-frontend'].steps;

const DETECT = 'Detect Compose and ingress changes';
const PREPARE = 'Compose smoke - prepare .env';
const FIRST = 'Compose smoke - ./deploy.sh (first run)';
const SECOND = 'Compose smoke - ./deploy.sh (second run, same stack and bind mounts)';
const SMOKE = 'Ingress smoke test';
const DIAGNOSTICS = 'Compose smoke - diagnostics on failure';
const TEARDOWN = 'Compose smoke - tear down';

const named = name => {
  const step = steps.find(s => s.name === name);
  assert.ok(step, `Frontend job has no step named "${name}"`);
  return step;
};
const index = name => steps.indexOf(named(name));

test('one detection step feeds every smoke step, and it runs the smoke test for any listed path', () => {
  const detect = named(DETECT);
  assert.equal(detect.id, 'compose-paths');
  assert.match(detect.run, /scripts\/compose-smoke-paths\.sh/);
  // A manual dispatch has no base to diff against: run rather than skip.
  assert.match(detect.run, /pull_request/);
  assert.match(detect.run, /run=true/);
  assert.match(detect.run, /run=false/);
});

test('the diff base is available: checkout fetches the merge commit and its first parent', () => {
  const checkout = steps.find(s => s.uses?.startsWith('actions/checkout@'));
  assert.ok(Number(checkout.with?.['fetch-depth']) >= 2 || checkout.with?.['fetch-depth'] === 0);
});

test('every smoke step is gated on the detection output, so an unrelated change skips them all', () => {
  for (const name of [PREPARE, FIRST, SECOND, SMOKE, DIAGNOSTICS, TEARDOWN]) {
    assert.match(String(named(name).if), /steps\.compose-paths\.outputs\.run == 'true'/, name);
  }
});

test('the steps run in order: prepare, ./deploy.sh twice, then the ingress smoke test', () => {
  const order = [DETECT, PREPARE, FIRST, SECOND, SMOKE, DIAGNOSTICS, TEARDOWN].map(index);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(new Set(order).size, order.length);
});

test('./deploy.sh runs twice against the same stack: no teardown or .env reset in between', () => {
  assert.match(named(FIRST).run, /\.\/deploy\.sh\s*$/m);
  assert.match(named(SECOND).run, /\.\/deploy\.sh\s*$/m);
  assert.ok(index(SECOND) === index(FIRST) + 1, 'the second run must follow the first directly');
  assert.doesNotMatch(named(SECOND).run, /\bdown\b|rm -rf|cp \.env/);
});

test('the .env is prepared fresh from .env.example with test secrets', () => {
  const { run } = named(PREPARE);
  assert.match(run, /cp \.env\.example \.env/);
  for (const key of ['DATABASE_PASSWORD', 'POSTGRES_PASSWORD', 'REDIS_PASSWORD', 'JWT_SECRET']) {
    assert.match(run, new RegExp(key), `${key} should get a test value`);
  }
});

test('every wait is bounded by a step timeout (deploy.sh itself waits unboundedly on Postgres and Redis)', () => {
  for (const name of [FIRST, SECOND, SMOKE]) {
    const minutes = named(name)['timeout-minutes'];
    assert.ok(Number.isInteger(minutes) && minutes > 0 && minutes <= 30, `${name}: timeout-minutes is ${minutes}`);
  }
});

test('the smoke step has its own distinct name and runs scripts/ingress-smoke.sh', () => {
  assert.match(named(SMOKE).run, /scripts\/ingress-smoke\.sh/);
  assert.equal(steps.filter(s => s.name === SMOKE).length, 1);
});

test('diagnostics print on failure and the stack is torn down whether checks pass or fail', () => {
  const diagnostics = named(DIAGNOSTICS);
  assert.match(String(diagnostics.if), /\bfailure\(\)/);
  assert.match(diagnostics.run, /compose.*\bps\b/);
  assert.match(diagnostics.run, /compose.*\blogs\b/);

  const teardown = named(TEARDOWN);
  assert.match(String(teardown.if), /\balways\(\)/);
  assert.match(teardown.run, /docker-compose\.yml/);
  assert.match(teardown.run, /docker-compose\.override\.yml/);
  assert.match(teardown.run, /\bdown\b.*(-v|--volumes)/);
  assert.ok(index(DIAGNOSTICS) < index(TEARDOWN), 'diagnostics must be collected before the stack is removed');
});

test('the smoke steps run from the repository root, not the Frontend job default directory', () => {
  for (const name of [DETECT, PREPARE, FIRST, SECOND, SMOKE, DIAGNOSTICS, TEARDOWN]) {
    assert.equal(named(name)['working-directory'], '.', name);
  }
});
