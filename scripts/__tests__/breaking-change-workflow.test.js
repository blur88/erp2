const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { parse } = require('yaml');

const workflows = resolve(__dirname, '../../.github/workflows');
const readWorkflow = name => readFileSync(resolve(workflows, name), 'utf8');

test('the Breaking Change Check runs on PR events to main without rerunning CI on edits', () => {
  const source = readWorkflow('breaking-change-check.yml');
  const workflow = parse(source);
  const ci = parse(readWorkflow('ci.yml'));

  assert.deepEqual(workflow.on, {
    pull_request: {
      branches: ['main'],
      types: ['opened', 'synchronize', 'reopened', 'edited'],
    },
  });
  assert.ok(ci.on.pull_request);
  assert.ok(!ci.on.pull_request.types?.includes('edited'));
  assert.deepEqual(workflow.permissions, { contents: 'read', 'pull-requests': 'read' });
  assert.deepEqual(workflow.concurrency, {
    group: 'breaking-change-check-${{ github.event.number }}',
    'cancel-in-progress': true,
  });
  assert.notEqual(workflow.concurrency.group, ci.concurrency.group);
  for (const expression of source.matchAll(/\$\{\{([\s\S]*?)\}\}/g)) {
    assert.doesNotMatch(expression[1], /\b(?:secrets|pull_request)\b/);
  }

  const [job, ...otherJobs] = Object.values(workflow.jobs);
  assert.deepEqual(otherJobs, []);
  assert.equal(job.name, 'Breaking Change Check');
  assert.equal(job.if, undefined);
  assert.equal(job.permissions, undefined);
  assert.equal(job['continue-on-error'], undefined);
  assert.equal(workflow.defaults?.run?.['working-directory'], undefined);
  assert.equal(job.defaults?.run?.['working-directory'], undefined);

  const [checkout, node, , check] = job.steps;
  assert.match(checkout.uses, /^actions\/checkout@/);
  assert.deepEqual(checkout.with, { 'fetch-depth': 0 });
  assert.match(node.uses, /^actions\/setup-node@/);
  assert.equal(node.with['node-version'], '24');
  assert.deepEqual(job.steps.map(step => step.run), [
    undefined, undefined, 'npm ci', 'node scripts/breaking-change-check.cjs "$PR_NUMBER"',
  ]);
  assert.deepEqual(check.env, { GH_TOKEN: '${{ github.token }}', PR_NUMBER: '${{ github.event.number }}' });
  for (const step of job.steps) {
    assert.equal(step['working-directory'], undefined);
    assert.equal(step['continue-on-error'], undefined);
    assert.equal(step.if, undefined);
  }
});
