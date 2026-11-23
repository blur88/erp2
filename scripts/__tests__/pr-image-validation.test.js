const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parse } = require('yaml');

const workflow = parse(readFileSync(resolve(__dirname, '../../.github/workflows/ci.yml'), 'utf8'));

test('every pull request to main runs both production image builds and their NGINX checks', () => {
  const pullRequest = workflow.on.pull_request;
  assert.deepEqual(pullRequest.branches, ['main']);
  assert.equal(pullRequest.paths, undefined);
  assert.equal(pullRequest['paths-ignore'], undefined);

  const images = workflow.jobs['validate-production-images'];
  assert.ok(images, 'the image validation job must exist');
  assert.equal(images.if, undefined);
  assert.equal(images.needs, undefined);
  assert.equal(images['continue-on-error'], undefined);

  assert.match(images.steps[0].uses, /^actions\/checkout@/);
  assert.equal(images.steps[0].with?.ref, undefined);
  const checks = images.steps.filter(step => step.run);
  assert.deepEqual(checks.map(step => step.name), [
    'Build the reverse-proxy image',
    'Check the reverse-proxy NGINX configuration',
    'Build the frontend production image',
    'Check the frontend NGINX configuration',
  ]);
  assert.match(checks[0].run, /^docker build .*erp-nginx:ci \.\/nginx$/);
  assert.match(checks[1].run, /^docker run --rm --network none .*backend:127\.0\.0\.1.*frontend:127\.0\.0\.1 erp-nginx:ci nginx -t$/);
  assert.match(checks[2].run, /^docker build --build-arg VITE_APP_VERSION=\S+ .*erp-frontend:ci \.\/frontend$/);
  assert.match(checks[3].run, /^docker run --rm --network none .*backend:127\.0\.0\.1 erp-frontend:ci nginx -t$/);
  for (const step of images.steps) {
    assert.equal(step.if, undefined, step.name);
    assert.equal(step['continue-on-error'], undefined, step.name);
  }
});

test('the ruleset-required frontend job rejects any image validation result other than success', () => {
  const ruleset = JSON.parse(readFileSync(
    resolve(__dirname, '../../.github/ruleset-15609777.snapshot.json'),
    'utf8',
  ));
  const requiredChecks = ruleset.rules
    .find(rule => rule.type === 'required_status_checks')
    .parameters.required_status_checks;

  const frontend = workflow.jobs['test-frontend'];
  assert.ok(requiredChecks.some(check => check.context === frontend.name));
  assert.equal(frontend.needs, 'validate-production-images');
  assert.equal(frontend.if, 'always()');
  assert.equal(frontend['continue-on-error'], undefined);
  assert.deepEqual(frontend.steps[0], {
    name: 'Require production image validation',
    if: "always() && needs.validate-production-images.result != 'success'",
    'working-directory': '.',
    run: 'echo "::error::Production image validation did not succeed."\nexit 1\n',
  });
});
