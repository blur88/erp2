const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { test } = require('node:test');
const { checkDrift, compareVersions, githubTracker, inspectPins, parsePins, readPinSources, validatePins } = require('../check-base-image-drift.cjs');
const { officialImagePin, officialImageRepository } = require('../docker-image-pins.cjs');

const digest = (digit) => `sha256:${digit.repeat(64)}`;
const nginx = 'nginx:1.30.9-alpine3.24-slim';
const pins = [{ repository: 'nginx', tag: nginx.split(':')[1], sources: ['frontend/Dockerfile'] }];

function recordingTracker() {
  let issue;
  const operations = [];
  const tracker = githubTracker('owner/repo', (args, payload) => {
    if (args[0] === '--paginate') return issue ? [[issue]] : [[]];
    operations.push(args[1]);
    if (args[1] === 'POST') {
      issue = { number: 7, state: 'open', body: payload.body };
    } else {
      assert.deepEqual(args, ['--method', 'PATCH', 'repos/owner/repo/issues/7', '--input', '-']);
      Object.assign(issue, payload);
    }
  });
  return { tracker, operations, get issue() { return issue; } };
}

test('every official image pinned in the repository uses an approved version series', () => {
  validatePins(readPinSources());
});

test('discovers newly added Dockerfiles and Compose files', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'base-image-pins-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  const sources = {
    'Dockerfile.worker': 'FROM node:27.0.0-alpine3.24',
    'compose.worker.yaml': 'services:\n  cache:\n    image: redis:8.7.0-alpine3.23',
  };
  for (const [name, content] of Object.entries(sources)) writeFileSync(join(root, name), content);
  execFileSync('git', ['add', '--', 'Dockerfile.worker'], { cwd: root });
  writeFileSync(join(root, '.gitignore'), 'docker-compose.private.yml\n');
  writeFileSync(join(root, 'docker-compose.private.yml'), 'local file');
  const discovered = readPinSources(root);
  assert.deepEqual(discovered, sources);
  assert.throws(() => validatePins(discovered), ({ message }) => {
    assert.match(message, /node:27.*outside configured version series 26/);
    assert.match(message, /redis:8\.7.*outside configured version series 8\.6/);
    return true;
  });
});

test('skips a tracked Dockerfile deleted from the working tree', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'base-image-pins-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  execFileSync('git', ['init', '--quiet'], { cwd: root });
  const dockerfile = join(root, 'Dockerfile');
  writeFileSync(dockerfile, 'FROM node:27.0.0-alpine3.24');
  execFileSync('git', ['add', '--', 'Dockerfile'], { cwd: root });
  rmSync(dockerfile);
  const compose = 'services:\n  cache:\n    image: redis:8.6.2-alpine3.23';
  writeFileSync(join(root, 'compose.yml'), compose);

  assert.deepEqual(readPinSources(root), { 'compose.yml': compose });
});

test('rejects a Dockerfile pin outside its approved series', () => {
  assert.throws(() => validatePins({
    'backend/Dockerfile': 'FROM node:27.0.0-alpine3.24',
  }), {
    message: 'backend/Dockerfile: node:27.0.0-alpine3.24: pin is outside configured version series 26',
  });
});

test('rejects a Compose pin without an approved series', () => {
  assert.throws(() => validatePins({
    'docker-compose.override.yml': 'services:\n  base:\n    image: docker.io/library/buildpack-deps:24.04',
  }), {
    message: 'docker-compose.override.yml (base): buildpack-deps:24.04: pin has no configured version series',
  });
});

test('rejects a digest-only pin whose version series cannot be verified', () => {
  const reference = `node@${digest('1')}`;
  assert.throws(() => validatePins({ 'backend/Dockerfile': `FROM ${reference}` }), {
    message: `backend/Dockerfile: ${reference}: pin has no version tag for configured series 26`,
  });
});

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
    'docker-compose.yml': 'services:\n  cache:\n    image: "redis:8.6.2-alpine3.23"\n  app:\n    build: ./backend\n    image: erp-backend:latest',
  }), [
    { ...pins[0], pinnedDigest: undefined },
    { ...pins[0], sources: ['nginx/Dockerfile'], pinnedDigest: digest('1') },
    { repository: 'redis', tag: '8.6.2-alpine3.23', pinnedDigest: undefined, sources: ['docker-compose.yml (cache)'] },
  ]);
});

test('skips Compose build outputs inherited from the base file and handles empty services', () => {
  const sources = {
    'docker-compose.yml': 'services:\n  app:\n    build: ./backend\n  cache:\n  search:\n',
    'docker-compose.override.yml': 'services:\n  app:\n    image: erp-backend:1.0\n  cache:\n    image: redis:8.6.2-alpine3.23\n  search:\n',
  };
  assert.deepEqual(parsePins(sources), [
    { repository: 'redis', tag: '8.6.2-alpine3.23', pinnedDigest: undefined, sources: ['docker-compose.override.yml (cache)'] },
  ]);
  assert.equal(officialImagePin('erp-backend:latest'), undefined);
});

test('preserves pin discovery when an unterminated heredoc prevents stage parsing', () => {
  const redis = 'redis:8.6.2-alpine3.23';
  assert.deepEqual(parsePins({
    'frontend/Dockerfile': `FROM ${nginx} AS build\nCOPY <<EOF /file\ntext\nFROM build\nFROM ${redis}`,
  }), [
    { ...pins[0], pinnedDigest: undefined },
    { repository: 'redis', tag: redis.split(':')[1], pinnedDigest: undefined, sources: ['frontend/Dockerfile'] },
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

test('reports an absent Alpine variant with no allowed replacement once per pin', async () => {
  const sources = { 'frontend/Dockerfile': `FROM ${nginx}` };
  let tags = ['1.31.1-alpine3.25-slim', '1.30.11-alpine3.25'];
  const registry = {
    tags: async () => {
      if (!tags) throw new Error('HTTP 429');
      return tags;
    },
    digest: async () => digest('1'),
  };
  const recording = recordingTracker();
  const { tracker, operations } = recording;
  const first = await checkDrift(sources, registry, tracker);
  const missingVariant = /Pinned Alpine variant is absent from the supported tag catalog.*no replacement fits the policy/;
  assert.match(first.report, missingVariant);
  assert.match(recording.issue?.body ?? '', missingVariant);

  recording.issue.state = 'closed';
  const repeated = await checkDrift(sources, registry, tracker, JSON.parse(JSON.stringify(first.state)));
  tags = undefined;
  const outage = await checkDrift(sources, registry, tracker, repeated.state);
  tags = [nginx.split(':')[1]];
  const restored = await checkDrift(sources, registry, tracker, outage.state);
  assert.doesNotMatch(restored.report, missingVariant);
  tags = ['1.31.1-alpine3.25-slim'];
  const missingAgain = await checkDrift(sources, registry, tracker, restored.state);
  assert.match(missingAgain.report, missingVariant);
  assert.equal(recording.issue.state, 'closed');
  assert.deepEqual(operations, ['POST']);
});

test('reopens a closed tracking issue for a first missing Alpine variant', async () => {
  const sources = { 'frontend/Dockerfile': `FROM ${nginx}` };
  const { tracker, operations } = recordingTracker();
  await tracker.create('<!-- erp2-base-image-drift:start -->\n\nPrior report\n\n<!-- erp2-base-image-drift:end -->');
  const closedIssue = await tracker.find();
  closedIssue.state = 'closed';

  await checkDrift(sources, {
    tags: async () => ['1.31.1-alpine3.25-slim'],
    digest: async () => digest('1'),
  }, tracker);
  assert.deepEqual(operations, ['POST', 'PATCH']);
  assert.equal(closedIssue.state, 'open');
  assert.match(closedIssue.body, /Pinned Alpine variant is absent/);
});

test('does not report an absent variant when a replacement tag has an unavailable digest', async () => {
  const sources = { 'frontend/Dockerfile': `FROM ${nginx}` };
  const registry = {
    tags: async () => ['1.30.10-alpine3.25-slim'],
    digest: async (_repository, tag) => {
      if (tag === '1.30.10-alpine3.25-slim') throw new Error('HTTP 429');
      return digest('1');
    },
  };
  const tracker = { find: async () => assert.fail('No confirmed drift to publish') };
  const { report } = await checkDrift(sources, registry, tracker);
  assert.match(report, /candidate 1\.30\.10-alpine3\.25-slim: HTTP 429/);
  assert.doesNotMatch(report, /Pinned Alpine variant is absent/);
});

test('does not repeat a missing Alpine variant when a different pin has new drift', async () => {
  const sources = { 'frontend/Dockerfile': `FROM ${nginx}\nFROM node:26.1.0-alpine3.24` };
  let nodeTags = ['26.1.0-alpine3.24'];
  const registry = {
    tags: async (repository) => repository === 'nginx' ? ['1.31.1-alpine3.25-slim'] : nodeTags,
    digest: async () => digest('1'),
  };
  const recording = recordingTracker();
  const { tracker } = recording;
  const first = await checkDrift(sources, registry, tracker);
  const { issue } = recording;
  assert.match(issue.body, /Pinned Alpine variant is absent/);

  nodeTags = ['26.1.1-alpine3.24'];
  await checkDrift(sources, registry, tracker, first.state);
  assert.match(issue.body, /Newer compatible version: .*node:26\.1\.1-alpine3\.24/);
  assert.doesNotMatch(issue.body, /Pinned Alpine variant is absent/);
});

test('preserves successful observations through an outage and reports each digest transition once', async () => {
  const sources = { 'frontend/Dockerfile': `FROM ${nginx}` };
  let current = digest('1');
  const recording = recordingTracker();
  const { tracker, operations } = recording;
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
  assert.deepEqual(operations, ['POST']);

  const { issue } = recording;
  issue.state = 'closed';
  const unchanged = await checkDrift(sources, registry, tracker, second.state);
  assert.doesNotMatch(unchanged.report, /Changed digest/);
  assert.deepEqual(operations, ['POST']);
  assert.equal(issue.state, 'closed');

  current = undefined;
  const closedOutage = await checkDrift(sources, registry, tracker, unchanged.state);
  assert.deepEqual(operations, ['POST']);
  assert.equal(issue.state, 'closed');

  current = digest('3');
  const third = await checkDrift(sources, registry, tracker, closedOutage.state);
  assert.ok(third.report.includes(`Changed digest: \`${digest('2')}\` → \`${current}\``));
  assert.deepEqual(operations, ['POST', 'PATCH']);
  assert.equal(issue.state, 'open');
});

test('reopens a closed tracking issue for a new candidate and preserves maintainer notes', async () => {
  const recording = recordingTracker();
  const { tracker, operations } = recording;
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
  const { issue } = recording;
  issue.body = `Leading note.\n\n${issue.body}\n\nTrailing note.`;
  issue.state = 'closed';
  candidate = undefined;
  const outage = await checkDrift(sources, registry, tracker, first.state);
  assert.match(outage.report, /HTTP 429/);
  assert.equal(issue.state, 'closed');
  candidate = '1.30.10-alpine3.24-slim';
  const recovered = await checkDrift(sources, registry, tracker, outage.state);
  assert.deepEqual(operations, ['POST']);
  assert.equal(issue.state, 'closed');

  candidate = '1.30.11-alpine3.24-slim';
  const second = await checkDrift(sources, registry, tracker, recovered.state);
  assert.match(second.report, /Newer compatible version: .*1\.30\.11/);
  assert.deepEqual(operations, ['POST', 'PATCH']);
  assert.equal(issue.state, 'open');
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

test('identifies bare official images without accepting connection strings', () => {
  assert.equal(officialImageRepository('docker.io/library/postgres'), 'postgres');
  assert.equal(officialImageRepository('redis:8.6.8-alpine3.23'), 'redis');
  assert.equal(officialImageRepository('postgres://localhost/db'), undefined);
  assert.equal(officialImageRepository('registry.example/redis'), undefined);
});
