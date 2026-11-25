const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { test } = require('node:test');
const { runInNewContext } = require('node:vm');

const runbook = readFileSync(
  resolve(__dirname, '../../docs/deployment/POSTGRES_19_MAJOR_UPGRADE_RUNBOOK.md'),
  'utf8',
);
const cleanupSection = runbook.split('\n## One-time Redis queue cleanup\n')[1];
const cleanup = cleanupSection.match(/```js\n([\s\S]+?)\n```/)[1];
const queueModule = cleanup.match(/^const \{ Queue \} = require\('([^']+)'\);$/m)[1];
const queueName = cleanup.match(/^const name = '([^']+)';$/m)[1];
const queuePrefix = cleanup.match(/^const prefix = '([^']+)';$/m)[1];
const namespace = `${queuePrefix}:${queueName}:`;
const confirmation = `delete ${queuePrefix}:${queueName} in DB 0`;

const jobKey = `${namespace}job`;

function seedData() {
  return new Map([
    [jobKey, Buffer.from([1, 0, 255])],
    [`${queuePrefix}:${queueName}-neighbor:job`, Buffer.from([0, 255])],
    ['unrelated', Buffer.from([99])],
  ]);
}

async function runCleanup(data, fixture = {}) {
  const obliterateCalls = [];
  const errors = [];
  const env = { REDIS_HOST: 'redis', REDIS_PORT: '6379' };
  if (fixture.missingHost) delete env.REDIS_HOST;
  if (fixture.missingPort) delete env.REDIS_PORT;
  const process = {
    env,
    argv: ['node', '-', fixture.mode ?? 'apply', fixture.confirmation ?? confirmation, fixture.runId ?? 'test123'],
    exitCode: 0,
  };

  class RedisFixture {
    async connect() {}
    async client() { return `id=1 db=${fixture.db ?? 0} user=default`; }
    async info() { return fixture.missingIdentity ? '' : 'run_id:test123\r\n'; }
    async scanBuffer() { return [Buffer.from('0'), [...data.keys()].map((key) => Buffer.from(key))]; }
    async type() { return 'hash'; }
    async hgetBuffer() { return fixture.externalParent ? Buffer.from('other:queue:1') : null; }
    async dumpBuffer(key) { return fixture.vanishedKey ? null : data.get(key.toString()); }
    async pexpiretime() { return fixture.expiredKey ? -2 : -1; }
    disconnect() {}
  }

  class QueueFixture {
    toKey() { return fixture.mismatchedPrefix ? 'different:' : namespace; }
    async getJobSchedulers() { return []; }
    async getJobs() { return []; }
    async getActiveCount() { return fixture.activeJobs ?? 0; }
    async getWaitingChildrenCount() { return fixture.waitingChildren ?? 0; }
    async obliterate(...args) {
      obliterateCalls.push(args);
      data.delete(jobKey);
    }
    async close() {}
  }

  await runInNewContext(cleanup, {
    Buffer,
    console: { log() {}, error: (message) => errors.push(message) },
    process,
    require: (name) => {
      if (name === 'ioredis') return RedisFixture;
      if (name === queueModule) return { Queue: QueueFixture };
      return require(name);
    },
  });

  return { exitCode: process.exitCode, errors, obliterateCalls };
}

for (const [name, fixture, expected] of [
  ['unsupported mode', { mode: 'delete' }, /Choose dry-run or apply/],
  ['missing Redis host', { missingHost: true }, /Set the Redis endpoint/],
  ['missing Redis port', { missingPort: true }, /Set the Redis endpoint/],
  ['different database', { db: 2 }, /db=2/],
  ['missing server identity', { missingIdentity: true }, /Redis run_id is unavailable/],
  ['incorrect confirmation', { confirmation: 'incorrect confirmation' }, /incorrect confirmation/],
  ['different server identity', { runId: 'another' }, /Redis instance changed after inspection/],
  ['different queue prefix', { mismatchedPrefix: true }, /different:/],
  ['active jobs', { activeJobs: 1 }, /Active jobs remain/],
  ['waiting children', { waitingChildren: 1 }, /Flow dependencies remain/],
  ['external parent', { externalParent: true }, /External parent job found/],
  ['unrelated key disappears before DUMP', { vanishedKey: true }, /A key disappeared during inventory/],
  ['unrelated key disappears after DUMP', { expiredKey: true }, /A key disappeared during inventory/],
]) {
  test(`Redis cleanup preserves keys when it rejects ${name}`, async () => {
    const data = seedData();
    const before = [...data.entries()];
    const result = await runCleanup(data, fixture);

    assert.equal(result.exitCode, 1);
    assert.match(result.errors.join('\n'), expected);
    assert.deepEqual(result.obliterateCalls, []);
    assert.deepEqual([...data.entries()], before);
  });
}

test('Redis cleanup removes only the targeted queue and does no work on a repeat apply', async () => {
  const data = seedData();
  const unrelated = [...data.entries()].filter(([key]) => key !== jobKey);

  assert.deepEqual(await runCleanup(data), { exitCode: 0, errors: [], obliterateCalls: [[]] });
  assert.deepEqual([...data.entries()], unrelated);

  assert.deepEqual(await runCleanup(data), { exitCode: 0, errors: [], obliterateCalls: [] });
  assert.deepEqual([...data.entries()], unrelated);
});
