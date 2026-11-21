const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function runWithoutDocker(t, requireDocker) {
  const bin = mkdtempSync(path.join(tmpdir(), 'ingress-docker-test-'));
  t.after(() => rmSync(bin, { recursive: true, force: true }));
  writeFileSync(path.join(bin, 'docker'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });

  const env = { ...process.env, PATH: `${bin}:${process.env.PATH}` };
  delete env.INGRESS_REQUIRE_DOCKER;
  delete env.NODE_TEST_CONTEXT;
  if (requireDocker) env.INGRESS_REQUIRE_DOCKER = '1';

  const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', path.join(__dirname, 'ingress.test.js')], {
    encoding: 'utf8',
    env,
  });
  assert.ifError(result.error);
  return result;
}

test('the Ingress suite fails when Docker is required but unavailable', t => {
  const result = runWithoutDocker(t, true);
  assert.equal(result.status, 1, result.stdout + result.stderr);
  assert.match(result.stdout, /Docker is required/);
  assert.match(result.stdout, /not ok \d+ - Ingress as the only entry point/);
});

test('the Ingress suite skips when Docker is optional and unavailable', t => {
  const result = runWithoutDocker(t, false);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /ok \d+ - Ingress as the only entry point # SKIP docker is not available/);
});
