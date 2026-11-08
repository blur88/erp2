const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const runner = path.resolve(__dirname, '../run-node-tests.mjs');

function runFixture(t, source) {
  const directory = mkdtempSync(path.join(tmpdir(), 'erp-node-tests-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  if (source !== undefined) writeFileSync(path.join(directory, 'fixture.test.cjs'), source);
  return spawnSync(process.execPath, [runner, directory], {
    encoding: 'utf8',
    env: { ...process.env, NODE_TEST_CONTEXT: '' },
  });
}

test('runner succeeds when a discovered test passes', (t) => {
  const result = runFixture(t, "require('node:test').test('passes', () => {});");
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /# tests 1\b/);
  assert.match(result.stdout, /ok 1 - passes/);
});

test('runner fails when a discovered test fails', (t) => {
  const result = runFixture(t, "require('node:test').test('fails', () => { throw new Error('deliberate failure'); });");
  assert.notEqual(result.status, 0);
  assert.match(result.stdout, /deliberate failure/);
});

test('runner fails with a diagnostic when no tests are discovered', (t) => {
  const result = runFixture(t);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /no tests discovered/i);
});
