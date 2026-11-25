# PostgreSQL 19 Major upgrade runbook

## Recovering the removed tables

Keep a pre-migration PostgreSQL backup before starting the updated backend.
Use the official PostgreSQL image's client tools. Recover into a separate
database and validate the result with the compatible pre-upgrade application
before switching back. See the [deployment backup checklist](DEPLOYMENT_CHECKLIST.md#database-backup)
for interim backup guidance.

## One-time Redis queue cleanup

Perform this during the Major upgrade after all application writers and workers
have stopped and before starting the new backend. Let active backup jobs finish
before stopping the workers. Keep the pre-upgrade backend image and the existing
host `backups/` files. Use the exact Compose project and network for the
deployment throughout.

Before stopping the backend, record the image it runs and its Redis connection
settings. Confirm the Redis container attached to that Compose network is the
one used by the old backend. Compare the dry run's `runId` with `INFO server`
on that container. Enter the current Redis password in a private shell with
tracing disabled, or use the shell that already holds the deployment
credentials.

```bash
old_image=$(docker inspect --format '{{.Image}}' "$(docker compose ps -q backend)")
docker inspect --format '{{range $name, $config := .NetworkSettings.Networks}}{{println $name}}{{end}}' \
  "$(docker compose ps -q redis)"
# Set compose_network to the network shared by the old backend and Redis.
REDIS_HOST=$(docker compose exec -T backend sh -c 'printf "%s" "${REDIS_HOST:-redis}"')
REDIS_PORT=$(docker compose exec -T backend sh -c 'printf "%s" "${REDIS_PORT:-6379}"')
export REDIS_HOST REDIS_PORT
read -rsp 'Redis password: ' REDIS_PASSWORD
printf '\n'
export REDIS_PASSWORD
docker compose stop backend
```

Use the pre-upgrade image's Node runtime and its installed BullMQ. Save the
following block as `cleanup-backup-queue.cjs` in a private working directory.
It selects DB 0 explicitly because the old backend connection ignores
`REDIS_DB`. It inventories the exact queue, checks for external parent jobs,
and compares unrelated DB 0 keys using their serialized bytes and absolute
expiry times. Keep all Redis writers quiesced while taking the inventories.

```js
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { Queue } = require('bullmq');
const Redis = require('ioredis');

const name = 'backup-queue';
const prefix = 'bull';
const keyPrefix = Buffer.from(`${prefix}:${name}:`);
const isQueueKey = (key) => key.subarray(0, keyPrefix.length).equals(keyPrefix);
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: Number(process.env.REDIS_PORT),
  password: process.env.REDIS_PASSWORD,
  db: 0,
  protocol: 2,
  lazyConnect: true,
  connectTimeout: 5000,
  retryStrategy: () => null,
});

async function keys() {
  const found = new Map();
  let cursor = '0';
  do {
    const [next, batch] = await redis.scanBuffer(cursor, 'COUNT', 500);
    cursor = next.toString();
    for (const key of batch) found.set(key.toString('hex'), key);
  } while (cursor !== '0');
  return [...found.values()].sort(Buffer.compare);
}

async function fingerprint(unrelatedKeys) {
  const result = [];
  for (const key of unrelatedKeys) {
    const dump = await redis.dumpBuffer(key);
    const expiresAt = await redis.pexpiretime(key);
    assert.ok(dump && expiresAt !== -2, 'A key disappeared during inventory');
    result.push([key.toString('hex'), createHash('sha256').update(dump).digest('hex'), expiresAt]);
  }
  return result;
}

async function main() {
  const [mode, confirmation, expectedRunId] = process.argv.slice(2);
  assert.ok(mode === 'dry-run' || mode === 'apply', 'Choose dry-run or apply');
  assert.ok(process.env.REDIS_HOST && process.env.REDIS_PORT, 'Set the Redis endpoint');
  await redis.connect();
  assert.match(await redis.client('INFO'), /(?:^| )db=0(?: |$)/);
  const runId = (await redis.info('server')).match(/^run_id:(\w+)\r?$/m)?.[1];
  assert.ok(runId, 'Redis run_id is unavailable');
  console.log({ runId, db: 0, queue: name, prefix });

  if (mode === 'apply') {
    assert.equal(confirmation, 'delete bull:backup-queue in DB 0');
    assert.equal(runId, expectedRunId, 'Redis instance changed after inspection');
  }

  const before = await keys();
  const target = before.filter(isQueueKey);
  if (target.length === 0) {
    console.log('Queue keys absent. No changes.');
    return;
  }

  let queue;
  try {
    queue = new Queue(name, { prefix, connection: redis, skipMetasUpdate: true });
    assert.equal(queue.toKey(''), keyPrefix.toString());
    console.log('Keys:', target.map((key) => key.toString()));
    console.log('Schedulers:', (await queue.getJobSchedulers()).map(({ key, name }) => ({ key, name })));
    console.log('Jobs:', (await queue.getJobs()).map(({ id, name }) => ({ id, name })));
    if (mode === 'dry-run') return;

    assert.equal(await queue.getActiveCount(), 0, 'Active jobs remain');
    assert.equal(await queue.getWaitingChildrenCount(), 0, 'Flow dependencies remain');
    for (const key of target) {
      if (await redis.type(key) !== 'hash') continue;
      const parent = await redis.hgetBuffer(key, 'parentKey');
      assert.ok(!parent?.length || isQueueKey(parent), 'External parent job found');
    }
    const unrelated = await fingerprint(before.filter((key) => !isQueueKey(key)));
    await queue.obliterate();
    const after = await keys();
    assert.deepEqual(after.filter(isQueueKey).map((key) => key.toString()), [], 'Queue keys remain');
    assert.deepEqual(await fingerprint(after), unrelated, 'Unrelated Redis data changed');
    console.log(`Queue removed. Verified ${unrelated.length} unrelated DB 0 keys.`);
  } finally {
    await queue?.close();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
}).finally(() => redis.disconnect());
```

Run the check from the same private working directory. Review the queue
name, DB, keys, schedulers and jobs, and verify the reported Redis identity
before confirming deletion.

```bash
cleanup_queue() {
  docker run --rm -i --network "${compose_network:?Set the Compose network}" \
    -e REDIS_HOST -e REDIS_PORT -e REDIS_PASSWORD \
    --entrypoint node "${old_image:?Set the old backend image ID}" - "$@" \
    < cleanup-backup-queue.cjs
}

cleanup_queue dry-run
# Set run_id to the verified Redis runId from the dry run.
read -rp 'Confirm by typing delete bull:backup-queue in DB 0: ' confirmation
cleanup_queue apply "$confirmation" "${run_id:?Set the verified Redis runId}"
```

Proceed when the command reports that the queue is absent and the unrelated
keys match. Repeat the dry run and apply against the same instance to check
that subsequent runs report no changes. If active jobs, dependencies, or
leftover keys are reported, stop and investigate the listed state.

A PostgreSQL rollback alone cannot restore the deleted Redis jobs. On startup
the compatible old app recreates schedulers for enabled rows with valid cron
settings. One-off and completed jobs remain removed.
