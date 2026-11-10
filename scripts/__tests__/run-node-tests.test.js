const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, writeFileSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');

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

test('runner streams progress while the child test is still waiting', async (t) => {
  const directory = mkdtempSync(path.join(tmpdir(), 'erp-node-stream-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const acknowledgement = path.join(directory, 'continue');
  writeFileSync(path.join(directory, 'fixture.test.cjs'), `
    const { test } = require('node:test');
    const { existsSync } = require('node:fs');
    test('live output', { timeout: 10000 }, async () => {
      console.log('waiting-for-parent');
      while (!existsSync(${JSON.stringify(acknowledgement)})) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    });
  `);
  const child = spawn(process.execPath, [runner, directory], {
    env: { ...process.env, NODE_TEST_CONTEXT: '' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  let stdout = '', stderr = '';
  child.stdout.on('data', chunk => {
    stdout += chunk;
    if (stdout.includes('waiting-for-parent')) writeFileSync(acknowledgement, 'continue');
  });
  child.stderr.on('data', chunk => { stderr += chunk; });
  const status = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  assert.equal(status, 0, stdout + stderr);
  assert.match(stdout, /ok 1 - live output/);
});

test('runner reports an invalid test directory as a failure', (t) => {
  const result = spawnSync(process.execPath, [runner, path.join(__dirname, 'missing-directory')], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /ENOENT|no such file/i);
});
