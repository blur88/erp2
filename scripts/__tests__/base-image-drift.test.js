const assert = require('node:assert/strict');
const { test } = require('node:test');
const { checkDrift, compareVersions, githubTracker, inspectPins, parsePins } = require('../check-base-image-drift.cjs');

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const nginx = 'nginx:1.30.9-alpine3.24-slim';
const pins = [{ repository: 'nginx', tag: nginx.split(':')[1], sources: ['frontend/Dockerfile'] }];

test('selects numerically newer supported patches in the configured variant', async () => {
  const registry = {
    tags: async () => [
      '1.30.10-alpine3.24-slim', '1.30.11-alpine3.25-slim', '1.30.12-alpine3.24',
      '1.31.1-alpine3.24-slim', '2.0.1-alpine3.24-slim',
    ],
    digest: async () => digest('1'),
  };
  const [result] = await inspectPins(pins, registry);
  assert.equal(result.candidate, '1.30.10-alpine3.24-slim');
});

test('collects external pins and combines repeated references', () => {
  assert.deepEqual(parsePins({
    'frontend/Dockerfile': `FROM --platform=linux/amd64 docker.io/library/${nginx} AS build\nFROM build\nFROM scratch`,
    'nginx/Dockerfile': `FROM ${nginx}@${digest('1')}`,
    'docker-compose.yml': 'services:\n  cache:\n    image: "redis:8.6.2-alpine3.23"\n  app:\n    image: erp-backend:latest',
  }), [
    { ...pins[0], pinnedDigest: undefined },
    { ...pins[0], sources: ['nginx/Dockerfile'], pinnedDigest: digest('1') },
    { repository: 'redis', tag: '8.6.2-alpine3.23', pinnedDigest: undefined, sources: ['docker-compose.yml (cache)'] },
  ]);
});

test('compares numeric major, minor and patch components', () => {
  assert.ok(compareVersions('1.30.10', '1.30.9') > 0);
  assert.ok(compareVersions('18.3', '18.11') < 0);
  assert.ok(compareVersions('2.0.0', '1.99.99') > 0);
  assert.equal(compareVersions('18.3', '18.3'), 0);
});

test('flags a retired Alpine variant for manual review without changing family or flavor', async () => {
  const registry = {
    tags: async () => [
      '1.30.10-alpine3.25-slim', '1.30.11-alpine3.25', '1.30.12-bookworm-slim',
      '1.31.1-alpine3.25-slim', '1.30.13-alpine3.23-slim',
    ],
    digest: async () => digest('1'),
  };
  const [result] = await inspectPins(pins, registry);
  assert.equal(result.candidate, '1.30.10-alpine3.25-slim');
  assert.equal(result.variantReview, true);
});

test('reports an absent Alpine variant when no replacement fits the policy', async () => {
  const registry = {
    tags: async () => ['1.31.1-alpine3.25-slim', '1.30.11-alpine3.25'],
    digest: async () => digest('1'),
  };
  const tracker = { find: async () => assert.fail('No confirmed drift to publish') };
  const { report } = await checkDrift({ 'frontend/Dockerfile': `FROM ${nginx}` }, registry, tracker);
  assert.match(report, /Pinned Alpine variant is absent from the supported tag catalog/);
  assert.doesNotMatch(report, /No compatible update found/);
});

test('preserves successful observations through an outage and reports each digest transition once', async () => {
  const sources = { 'frontend/Dockerfile': `FROM ${nginx}` };
  let current = digest('1');
  let issue;
  const operations = [];
  const tracker = {
    find: async () => issue,
    create: async (body) => { operations.push('create'); issue = { number: 7, body }; },
    update: async (number, body) => { operations.push(number); issue.body = body; },
  };
  const registry = {
    tags: async () => [nginx.split(':')[1]],
    digest: async () => {
      if (!current) throw new Error('HTTP 429');
      return current;
    },
  };
  const first = await checkDrift(sources, registry, tracker);
  assert.match(first.report, /No compatible update found/);
  assert.deepEqual(operations, []);

  current = undefined;
  const outage = await checkDrift(sources, registry, tracker, first.state);
  assert.match(outage.report, /Lookup unavailable or inconclusive:.*HTTP 429/);
  assert.equal(outage.state[nginx].digest, digest('1'));
  assert.deepEqual(operations, []);

  current = digest('2');
  const second = await checkDrift(sources, registry, tracker, outage.state);
  assert.ok(second.report.includes(`Changed digest: \`${digest('1')}\` → \`${current}\``));
  assert.deepEqual(operations, ['create']);

  const unchanged = await checkDrift(sources, registry, tracker, second.state);
  assert.doesNotMatch(unchanged.report, /Changed digest/);
  assert.deepEqual(operations, ['create']);

  issue.state = 'closed';
  current = undefined;
  const closedOutage = await checkDrift(sources, registry, tracker, unchanged.state);
  assert.deepEqual(operations, ['create']);

  current = digest('3');
  const third = await checkDrift(sources, registry, tracker, closedOutage.state);
  assert.ok(third.report.includes(`Changed digest: \`${digest('2')}\` → \`${current}\``));
  assert.deepEqual(operations, ['create', 7]);
  assert.equal(issue.state, 'closed');
});

test('deduplicates candidates and preserves maintainer notes when updating the tracking issue', async () => {
  let issue;
  const operations = [];
  const tracker = {
    find: async () => issue,
    create: async (body) => {
      operations.push('create');
      issue = { number: 7, body: `Leading note.\n\n${body}\n\nTrailing note.` };
    },
    update: async (number, body) => { operations.push(number); issue.body = body; },
  };
  const sources = { 'frontend/Dockerfile': `FROM ${nginx}` };
  let candidate = '1.30.10-alpine3.24-slim';
  const registry = {
    tags: async () => {
      if (!candidate) throw new Error('HTTP 429');
      return [candidate];
    },
    digest: async () => digest('1'),
  };
  const first = await checkDrift(sources, registry, tracker);
  candidate = undefined;
  const outage = await checkDrift(sources, registry, tracker, first.state);
  assert.match(outage.report, /HTTP 429/);
  candidate = '1.30.10-alpine3.24-slim';
  const recovered = await checkDrift(sources, registry, tracker, outage.state);
  assert.deepEqual(operations, ['create']);

  candidate = '1.30.11-alpine3.24-slim';
  const second = await checkDrift(sources, registry, tracker, recovered.state);
  assert.match(second.report, /Newer compatible version: .*1\.30\.11/);
  assert.deepEqual(operations, ['create', 7]);
  assert.match(issue.body, /^Leading note\./);
  assert.match(issue.body, /Trailing note\.$/);
});

test('finds the tracking issue on a later API page after a note is appended', async () => {
  const marker = '<!-- erp2-base-image-drift:start -->\n\nReport\n\n<!-- erp2-base-image-drift:end -->';
  const issue = { number: 7, body: `${marker}\n\nA maintainer note.` };
  const tracker = githubTracker('owner/repo', (args) => {
    assert.deepEqual(args, [
      '--paginate', '--slurp',
      'repos/owner/repo/issues?state=all&creator=github-actions%5Bbot%5D&per_page=100',
    ]);
    return [[{ number: 9, body: marker, pull_request: {} }], [issue]];
  });
  assert.deepEqual(await tracker.find(), issue);
});
