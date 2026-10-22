# Redis — Configuration and Protocol Constraints

What the Redis instance is for, the configuration it must keep, and the client protocol pin. For diagnosis, measurement and recovery — including the policy rollout procedure — see the [Redis memory-pressure runbook](../deployment/REDIS_MEMORY_PRESSURE_RUNBOOK.md).

## The instance is the BullMQ queue store only

Redis 8.6 backs BullMQ and nothing else — no cache, no sessions, despite what older comments claim.

### `noeviction` is a correctness requirement (#1036)

`--maxmemory-policy noeviction` is required, not a tuning preference. BullMQ has no recovery path for evicted keys: under an eviction policy Redis can silently drop job hashes, queue state or scheduler metadata, and jobs vanish with no error. Under `noeviction`, hitting the memory cap is instead a hard `OOM command not allowed` failure.

**Never add cache or session keys to this instance.** Cache workloads want eviction and queue workloads must never be evicted; the two are irreconcilable on one instance. A cache requires a *separate* Redis service, never a policy revert. `users.module.ts` carries a dormant `CacheModule.register()` — the concrete way this rule would get violated.

### Changing the policy or cap

`--maxmemory-policy` and `--maxmemory` are start-time flags on the `redis-server` command in the compose files, which are the source of truth. After editing the compose file the container must be **recreated** (`docker compose up -d redis` does this when the definition changed), not merely restarted; a runtime `CONFIG SET` is reverted on the next recreate.

Before switching the policy in any environment, run the baseline capture in the runbook ([Policy rollout](../deployment/REDIS_MEMORY_PRESSURE_RUNBOOK.md#policy-rollout-baseline-capture-and-verification)).

### The 256 MiB cap

The cap is retained (decision recorded 2026-09-05). The evidence behind it is one window on the local development stack (peak 1.121% of the cap, zero evictions or OOM errors observed); see the runbook's sizing section for the full measurement and its limits. No production deployment exists yet. **Required when a production host is created:** re-evaluate the cap against values captured from that host, across at least one confirmed deploy. Nothing in the local measurement discharges this.

`docker-compose.prod.yml` sets the Redis container `limits.memory: 512M` against `--maxmemory 256mb` (`reservations.memory: 256M`). This is an unmeasured configuration fact, not a defect: Redis needs memory beyond `used_memory` during RDB save and AOF rewrite, and this stack runs both.

## Memory monitoring persists to Postgres, never to Redis

The sampler writes samples (`redis_memory_samples`) and alert state (`redis_alert_state`) through TypeORM; Redis itself is only read (`INFO`).

- **Alert state is keyed by the Redis `run_id`.** A Redis restart yields a new row rather than clearing a watermark; the old row is retained for diagnostics and no longer consulted.
- **Samples are keyed by `MONITORING_INSTANCE_ID`**, which must be stable across restarts and unique per running sampler. Compose pins `erp_backend`; `HOSTNAME` is the container id and changes on recreation.
- **`bigint` columns use `SafeIntegerTransformer`** (`safe-integer.transformer.ts`), which throws rather than silently truncating values past `MAX_SAFE_INTEGER`.
- **Read peaks from `windowStats`, never from `samples`.** The detail route caps `samples` at `REDIS_DETAIL_MAX_ROWS` (5000), newest-anchored: at the 60 s interval a 7-day request returns roughly the newest 3.5 days. `windowStats` is an exact SQL aggregate over the full filtered window, grouped by instance. Counter deltas there are the sum of positive consecutive increases (not `max - min`, which is wrong in both directions across a `CONFIG RESETSTAT`); `delta: null` means fewer than two comparable readings, distinct from a measured `0`. `/settings/redis-monitoring` renders this.

## ioredis 6 with RESP2 pinned (#1069)

ioredis 6 defaults to RESP3 (`protocol: 3`); 5.x used RESP2. **Every Redis client in this codebase passes `protocol: 2`**, as a correctness pin.

Reply shapes are protocol-dependent and the failure is silent. `zrange` returns a flat `[member, score, member, score]` array under RESP2 and an array of pairs under RESP3; `backup.service.ts` walks the reply as a flat array, so RESP3 would mis-parse rather than throw. BullMQ 6.1.1 declares `ioredis: >=5.0.0` but develops against 5.11.1 — the range is permissive, not evidence that RESP3 was tested against the queue layer.

Where the pin lives:

- **`createBullOptions()`** (`src/config/bull-options.factory.ts`) is the load-bearing one. BullMQ derives its blocking and QueueEvents connections from those options via `duplicate()`, so this one setting covers every queue connection. `bull-options.factory.spec.ts` asserts it directly.
- The three diagnostic clients — `app.service.ts`, `redis-memory-sampler.service.ts`, `backup.service.ts` — set it individually.
- The `connection` in `test/orphaned-scheduler-reconciliation.redis-spec.ts` sets it so the real-Redis suite exercises the same protocol.

Adopting RESP3 is its own change, not a cleanup: remove the pins **and** re-verify every raw reply read (`INFO` parsing in the sampler and `backup.service.ts`, the `zrange`/`hgetall` paths in the backup snapshot). Verify a live stack with `redis_cli CLIENT LIST` — every connection should report `resp=2`.

Two related v6 details:

- TypeORM 1.1.0 declares `peerOptional ioredis@^5.0.4`; `npm prune --omit=dev` in the Dockerfile rejects that against ioredis 6, hence the `overrides.typeorm.ioredis: "$ioredis"` entry, which must survive future bumps.
- v6 types `zrange`'s `stop` argument as `string | Buffer` (only `start` takes a number), so `-1` must be passed as `'-1'`. `npm run type-check` catches this.

## Related

- [Redis memory-pressure runbook](../deployment/REDIS_MEMORY_PRESSURE_RUNBOOK.md) — measurement, alerting, restart correlation, recovery.
- [BullMQ backup schedulers](bullmq-backup-schedulers.md) — queue contents and orphan remediation.
