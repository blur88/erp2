const assert = require('node:assert/strict');
const { test } = require('node:test');
const { checkDrift, githubTracker, inspectPins, parsePins } = require('../check-base-image-drift');

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

test('preserves a prior digest through a registry outage and reports recovery drift', async () => {
  const registry = {
    tags: async () => ['1.30.9-alpine3.24-slim'],
    digest: async () => { throw new Error('HTTP 429'); },
  };
  const previous = { [nginx]: digest('1') };
  const [unavailable] = await inspectPins(pins, registry, previous);
  assert.match(unavailable.unavailable.join(' '), /429/);
  assert.equal(unavailable.baseline, digest('1'));
  const [recovered] = await inspectPins(pins, { ...registry, digest: async () => digest('2') }, previous);
  assert.equal(recovered.baseline, digest('1'));
  assert.equal(recovered.observedDigest, digest('2'));
});

test('reuses one tracking issue and skips identical updates', async () => {
  let issue;
  const operations = [];
  const tracker = {
    find: async () => issue,
    create: async (body) => { operations.push('create'); issue = { number: 7, body }; },
    update: async (number, body) => { operations.push(number); issue.body = body; },
  };
  const sources = { 'frontend/Dockerfile': `FROM ${nginx}` };
  let candidate = '1.30.10-alpine3.24-slim';
  let current = digest('1');
  const registry = {
    tags: async () => [candidate],
    digest: async (_, tag) => tag === candidate ? digest('3') : current,
  };
  await checkDrift(sources, registry, tracker);
  await checkDrift(sources, registry, tracker);
  assert.deepEqual(operations, ['create']);

  candidate = '1.30.11-alpine3.24-slim';
  current = digest('2');
  const report = await checkDrift(sources, registry, tracker);
  assert.match(report, /Newer compatible version: `nginx:1\.30\.11-alpine3\.24-slim`/);
  assert.ok(report.includes(`Changed digest: \`${digest('1')}\` → \`${current}\``));
  assert.deepEqual(operations, ['create', 7]);
});

test('reopens the same tracking issue when a compatible update appears', async () => {
  const sources = { 'frontend/Dockerfile': `FROM ${nginx}` };
  const updates = [];
  let issue;
  let tags = [];
  const registry = { tags: async () => tags, digest: async () => digest('1') };
  const tracker = {
    find: async () => issue,
    create: async (body) => { issue = { number: 7, body, state: 'closed' }; },
    update: async (number, body, reopen) => { updates.push({ number, reopen }); },
  };
  await checkDrift(sources, registry, tracker);
  await checkDrift(sources, registry, tracker);
  assert.deepEqual(updates, []);

  tags = ['1.30.10-alpine3.24-slim'];
  await checkDrift(sources, registry, tracker);
  assert.deepEqual(updates, [{ number: 7, reopen: true }]);
});

test('finds the tracking issue on a later API page after a note is appended', async () => {
  const marker = '<!-- erp2-base-image-drift {} -->';
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
