# Redis protocol and BullMQ scheduler operations

**ioredis is 6.x and RESP2 is pinned deliberately (#1069)**: ioredis 6 defaults to `protocol: 3` (RESP3) where 5.x used RESP2. Every Redis client in this codebase passes **`protocol: 2`**, and that is a correctness pin, not leftover scaffolding.

Reply shapes are protocol-dependent, and the failure mode is silent rather than loud. From ioredis 6's own typings, `zrange` returns `RespShape<Resp2<string[]>, Resp3<[member, score][]>>` — a flat `[member, score, member, score]` array under RESP2, an array of pairs under RESP3. `backup.service.ts` walks that reply as a flat array, so under RESP3 it would mis-parse rather than throw. BullMQ 6.1.1 declares `ioredis: >=5.0.0` but pins `5.11.1` as its devDependency: the range is permissive, not evidence RESP3 was tested against the queue layer. Combined with the fact that this Redis is the BullMQ queue backing store (see the `noeviction` note above), an untested protocol switch risks exactly the silent queue-state damage that section is about.

The load-bearing pin is in **`createBullOptions()`** (`config/bull-options.factory.ts`). BullMQ derives its blocking and QueueEvents connections from those options via `duplicate()`, so that one line covers every queue connection — pinning only the directly-constructed clients would not. The three diagnostic clients (`app.service.ts`, `redis-memory-sampler.service.ts`, `backup.service.ts`) set it individually, as does the `connection` in `test/orphaned-scheduler-reconciliation.redis-spec.ts` so the real-Redis gate exercises production's protocol.

Adopting RESP3 is its own change, not a cleanup: it means removing the pins **and** re-verifying every raw reply read (`INFO` parsing in the sampler and `backup.service.ts`, and the `zrange`/`hgetall` paths in the backup snapshot). `bull-options.factory.spec.ts` asserts the pin directly so dropping it fails with a message about the protocol instead of an incidental diff. Verify a live stack with `redis_cli CLIENT LIST` — every connection should report `resp=2`.

Two related v6 details: TypeORM 1.1.0 declares `peerOptional ioredis@^5.0.4`, which `npm install` tolerates but `npm prune --omit=dev` in the Dockerfile rejects — hence the `overrides.typeorm.ioredis: "$ioredis"` entry, which must survive future bumps. And v6 types `zrange`'s `stop` argument as `string | Buffer` (only `start` takes a number), so `-1` must be passed as `'-1'`; `npm run type-check` catches this.

**BullMQ v5→v6 migration: complete (#1033)**. `removeLegacyRepeatables()` and the three v5-migration tests were removed once the gate passed — no environment held a blocking entry (a bare-hex member with no `ic` field). Nothing in the codebase cleans up v5 repeatables any more, so a v5 process must never write to this Redis again.

`bullmq-v5` (`npm:bullmq@5.81.3`) **was retired in #1050** and is no longer a backend devDependency. Earlier revisions of this file said to keep it; that guidance is superseded. `test/orphaned-scheduler-reconciliation.redis-spec.ts` now seeds its own fixtures:

- Scheduler-format orphans (`ic` present, bare-hex member) use **v6**'s `upsertJobScheduler` with the id passed explicitly — v6 forwards it verbatim, so the on-disk shape is identical.
- The **non-`ic` legacy repeatable**, which v6 has no code path to write, is hand-rolled with raw `zadd`/`hset` in `seedLegacyRepeatable()`.

That legacy shape was **captured byte-for-byte from a real `bullmq@5.81.3` `Queue.add(..., { repeat: { pattern } })`** against Redis 8.6.2 while the alias was still installed, then asserted to match — not reconstructed from documentation. The captured shape is recorded in the helper's docblock. One detail that a from-memory reconstruction gets wrong: the metadata hash `repeat:<member>` holds **only `{name, pattern}`** — there is no `data` field on it. The `scheduleId` lives on the *delayed job* hash `repeat:<member>:<millis>`. The reconciler's `ic` check (`orphaned-scheduler-reconciler.service.ts:125`) short-circuits before its `data` read, which is why the legacy entry is skipped rather than misclassified.

The unit tests mock `hexists`, so they cannot catch an inverted `ic` check — `npm run test:redis` is the only thing that does. It is on CI's critical path. **`Tests: 0 total` there is a failure, not a pass**: a suite that fails to load reports zero and looks green to a careless reading, though Jest's own exit code does catch it (see the zero-discovery note in the Jest ESM section above). Verified by inverting the `ic` discriminator, which turns the legacy test red at the `legacySkipped` assertion.

**`test:redis` requires an explicit opt-in** (#1190). `scripts/preflight-redis-test.sh` aborts unless `REDIS_TEST_ALLOW_WRITES=1`, *before* it opens any connection — so a run pointed at the wrong endpoint never touches it:

```bash
REDIS_TEST_ALLOW_WRITES=1 npm run test:redis
```

The address cannot express what matters. `REDIS_TEST_PORT` defaulting to 6399 is a convention, not a guard: the app's Redis can run on any port, and CI deliberately points this suite at 6379 (its own ephemeral service container, where `ci.yml` sets the opt-in). Only an affirmative opt-in keeps a default configuration from writing to an instance nobody provisioned for the suite.

The suite does **not** flush: it writes under a unique `test-bullmq-<ts>-<rand>` prefix and deletes `${prefix}:*` in teardown. So the exposure from a mis-pointed run is stray keys under a random prefix, not destroyed schedulers — but an interrupted run leaves them behind, and this Redis is `noeviction`, so nothing reclaims them. Point it only at a Redis you are willing to lose.

If a `Legacy (non-scheduler) repeat entry` warning ever appears at boot, an environment is holding pre-v6 state that predates the removal. BullMQ 6 cannot remove it safely — `removeJobScheduler` would delete its metadata but leave the delayed occurrence live — so it needs BullMQ 5's `removeRepeatableByKey`.

**Orphaned backup-queue repeat entries (report-only)**: `BackupSchedulerService.reportOrphanedSchedulers()` runs last in `initializeSchedules()` and `logger.warn`s any `bull:backup-queue:repeat` member whose `data.scheduleId` has no `backup_schedules` row (issue #1035). It **never deletes** — making Redis contents depend on a DB read means a transient read failure or a partially-migrated deploy could destroy live schedulers. Keep it free of mutating calls; auto-reconciliation is a separate design discussion that needs explicit safeguards. The whole body is wrapped in a catch-all because a diagnostic must never fail boot. It survived the v5→v6 retirement in #1033, which is why it was written as a sibling method rather than folded into that scan. Entries with no `data`, unparseable JSON, or a non-string/empty `scheduleId` are logged as *unclassifiable*, never as orphans.

Remediate a reported orphan with the CLI, which is dry-run by default:

```bash
docker compose exec -T backend npm run backup:reconcile-schedulers            # report only
docker compose exec -T backend npm run backup:reconcile-schedulers -- --execute
```

It scans `bull:backup-queue:repeat`, classifies each `ic` (scheduler-format)
entry against `backup_schedules`, and removes only confirmed orphans via
`removeJobScheduler(<bare member>)` — **never `ZREM`**, which strips the ZSET
member but leaves `repeat:<member>:<millis>` live in `bull:backup-queue:delayed`
with no metadata.

Guards, all fail-safe toward keeping the entry:

- A failed DB read aborts before any removal.
- If every classifiable entry looks orphaned (zero confirmed live rows), it
  aborts — that is indistinguishable from a broken read. Override with
  `--execute --allow-empty` only when you intend to remove every remaining
  scheduler (e.g. you deleted the last schedule).
- Non-`ic` legacy entries are never touched. Nothing removes that class any
  more (#1033); they need BullMQ 5's `removeRepeatableByKey`.
- Do not run it during a deploy window.

A mid-run failure stops immediately and reports which entries were already
removed. Nothing is rolled back — re-run to finish.

```bash
redis_cli ZRANGE bull:backup-queue:repeat 0 -1 WITHSCORES
redis_cli HGETALL bull:backup-queue:repeat:<member>     # read data.scheduleId
redis_cli ZRANGE bull:backup-queue:delayed 0 -1
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "SELECT id FROM backup_schedules WHERE id = '<scheduleId>';"   # 0 rows ⇒ orphan
```

Then remove it, closing the queue so the command exits instead of hanging on the open connection:

```bash
docker compose exec -T backend node -e '
const { Queue } = require("bullmq");
const q = new Queue("backup-queue", { connection: {
  host: process.env.REDIS_HOST, port: +process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD } });
q.removeJobScheduler(process.argv[1])
  .then((r) => console.log("removed:", r))
  .finally(() => q.close());
' <member>
```

On BullMQ 6.1.0 the public API returns a **boolean**: `removed: true` on success, `false` if the member was already absent. (The underlying `removeJobScheduler-3.lua` still returns `0`/`1` with `0` meaning removed, but the TypeScript wrapper inverts it — read the boolean, not the Lua convention. Verified against 6.1.0 in `backend/test/orphaned-scheduler-reconciliation.redis-spec.ts`; earlier revisions of this file documented the Lua numbers, which was wrong for v6 and inverted the pass/fail reading.) Re-run the preflight to verify: the member is gone from `repeat`, and its `repeat:<member>:<millis>` occurrence is gone from `delayed`.
