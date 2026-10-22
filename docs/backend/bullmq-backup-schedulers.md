# BullMQ Backup Schedulers

How backup schedules are stored in the BullMQ queue, how orphaned scheduler entries are detected and removed, and what remains from the v5→v6 migration. Shell examples use the `redis_cli` helper defined in the [Redis runbook](../deployment/REDIS_MEMORY_PRESSURE_RUNBOOK.md#prerequisites-and-access).

## BullMQ v5 → v6 migration: complete (#1033)

`removeLegacyRepeatables()` and the three v5-migration tests were removed once the gate passed — no environment held a blocking entry (a bare-hex member with no `ic` field). **Nothing in the codebase cleans up v5 repeatables any more, so a v5 process must never write to this Redis again.**

`bullmq-v5` (`npm:bullmq@5.81.3`) was retired in #1050 and is no longer a devDependency. `test/orphaned-scheduler-reconciliation.redis-spec.ts` seeds its own fixtures:

- Scheduler-format orphans (`ic` present, bare-hex member) use v6's `upsertJobScheduler` with the id passed explicitly; v6 forwards it verbatim, so the on-disk shape is identical.
- The non-`ic` legacy repeatable, which v6 has no code path to write, is hand-rolled with raw `zadd`/`hset` in `seedLegacyRepeatable()`.

That legacy shape was captured byte-for-byte from a real `bullmq@5.81.3` `Queue.add(..., { repeat: { pattern } })` against Redis 8.6.2 while the alias was installed, then asserted to match. The captured shape is recorded in the helper's docblock. One detail a from-memory reconstruction gets wrong: the metadata hash `repeat:<member>` holds **only `{name, pattern}`** — no `data` field. The `scheduleId` lives on the delayed job hash `repeat:<member>:<millis>`. The reconciler's `ic` check short-circuits before its `data` read, which is why the legacy entry is skipped rather than misclassified.

Unit tests mock `hexists`, so they cannot catch an inverted `ic` check; only `npm run test:redis` does (see [Backend testing](testing.md#real-redis-suite-testredis)). Verified by inverting the `ic` discriminator, which turns the legacy test red at the `legacySkipped` assertion.

If a `Legacy (non-scheduler) repeat entry` warning ever appears at boot, an environment holds pre-v6 state. BullMQ 6 cannot remove it safely — `removeJobScheduler` would delete its metadata but leave the delayed occurrence live — so it needs BullMQ 5's `removeRepeatableByKey`.

## Orphan reporting at boot (report-only, #1035)

`BackupSchedulerService.reportOrphanedSchedulers()` runs last in `initializeSchedules()` and `logger.warn`s any `bull:backup-queue:repeat` member whose `data.scheduleId` has no `backup_schedules` row.

It **never deletes**. Making Redis contents depend on a DB read means a transient read failure or a partially migrated deploy could destroy live schedulers. Keep it free of mutating calls; auto-reconciliation needs its own design with explicit safeguards. The body is wrapped in a catch-all because a diagnostic must never fail boot. Entries with no `data`, unparseable JSON, or a non-string/empty `scheduleId` are logged as *unclassifiable*, never as orphans.

## Removing orphans: the reconcile CLI

Dry-run by default:

```bash
docker compose exec -T backend npm run backup:reconcile-schedulers            # report only
docker compose exec -T backend npm run backup:reconcile-schedulers -- --execute
```

It scans `bull:backup-queue:repeat`, classifies each `ic` (scheduler-format) entry against `backup_schedules`, and removes only confirmed orphans via `removeJobScheduler(<bare member>)` — **never `ZREM`**, which strips the ZSET member but leaves `repeat:<member>:<millis>` live in `bull:backup-queue:delayed` with no metadata.

Guards, all fail-safe toward keeping the entry:

- A failed DB read aborts before any removal.
- If every classifiable entry looks orphaned (zero confirmed live rows), it aborts — indistinguishable from a broken read. Override with `--execute --allow-empty` only when you intend to remove every remaining scheduler (e.g. you deleted the last schedule).
- Non-`ic` legacy entries are never touched.
- Do not run it during a deploy window.

A mid-run failure stops immediately and reports which entries were already removed. Nothing is rolled back — re-run to finish.

## Manual inspection and removal

```bash
redis_cli ZRANGE bull:backup-queue:repeat 0 -1 WITHSCORES
redis_cli HGETALL bull:backup-queue:repeat:<member>     # read data.scheduleId
redis_cli ZRANGE bull:backup-queue:delayed 0 -1
docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  -c "SELECT id FROM backup_schedules WHERE id = '<scheduleId>';"   # 0 rows ⇒ orphan
```

Remove one, closing the queue so the command exits instead of hanging on the open connection:

```bash
docker compose exec -T backend node -e '
const { Queue } = require("bullmq");
const q = new Queue("backup-queue", { connection: {
  host: process.env.REDIS_HOST, port: +process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD, protocol: 2 } });
q.removeJobScheduler(process.argv[1])
  .then((r) => console.log("removed:", r))
  .finally(() => q.close());
' <member>
```

On BullMQ 6.1.0 the public API returns a **boolean**: `removed: true` on success, `false` if the member was already absent. The underlying `removeJobScheduler-3.lua` returns `0`/`1` with `0` meaning removed, but the TypeScript wrapper inverts it — read the boolean, not the Lua convention (verified in `test/orphaned-scheduler-reconciliation.redis-spec.ts`). Re-run the inspection to confirm the member is gone from `repeat` and its `repeat:<member>:<millis>` occurrence is gone from `delayed`.
