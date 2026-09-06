# Redis Memory-Pressure Detection — Operator Runbook

This runbook covers detecting, diagnosing, and remediating Redis memory
pressure on the ERP's queue-only Redis instance. It describes the signal
produced by the `MonitoringModule` sampler (one `INFO` sample per minute,
retained in Postgres for 90 days), how to read it, and what to do when
it says something is wrong.

## Prerequisites and access

The health endpoint is public; the detail endpoint requires an
administrator account:

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/health` | public | Live ping plus the sampler's latest pressure summary |
| `GET /api/health/redis-memory` | `@Auth(UserRole.ADMIN)` | Up to 90 days of samples, counters, and configuration |

```bash
# From the deployment directory, with an admin token:
curl -s http://<host>/api/health
curl -s -H "Authorization: Bearer <admin-token>" \
  http://<host>/api/health/redis-memory | jq '.pressure, .history, .counters'
```

The `redis_cli` helper from CLAUDE.md is used throughout this runbook:

```bash
redis_password="$(docker compose exec -T backend printenv REDIS_PASSWORD)"
redis_cli() { docker compose exec -T -e REDISCLI_AUTH="$redis_password" redis redis-cli --raw "$@"; }
```

Extract the password from the container as shown — `$REDIS_PASSWORD` is
generally *not* exported in the host shell, and an unset var makes
`REDISCLI_AUTH=""` fail with `NOAUTH`.

## Interpreting the pressure state

`/api/health` reports `redis.status` as `healthy` or `degraded` (always
HTTP 200 — degraded must never restart the backend) and
`redis.pressure.state` as one of four states:

| State | Meaning | Action |
|---|---|---|
| `healthy` | 10 consecutive valid samples below 80% established this state | None |
| `sustained-pressure` | 10 consecutive valid samples **at or above 80%** | Investigate now (see below) |
| `unknown` | Latest sampling failed, data is stale, Redis is uncapped, or `INFO` was unparseable; `reason` says which (`sampling-failed`, `sampling-gap`, `stale`, `uncapped`, `unparseable`) | Look at the backend logs and the detail endpoint |
| `insufficient-samples` | Fewer than 10 consecutive same-side valid samples since the last restart | Wait — history is being rebuilt |

An established state is retained while the opposite streak accumulates and
is replaced only after 10 consecutive opposite samples — transient spikes
do not flap the state.

## What survives a restart — and what does not

Samples and alert state are stored in **Postgres**, never in Redis. Redis
itself remains the BullMQ queue backing store only; the monitoring module
only ever *reads* it.

| State | Survives a backend restart? |
|---|---|
| Sample history (`redis_memory_samples`) | Yes — the detail view keeps its full window |
| OOM watermark (baseline, observed, acknowledged values) | Yes — keyed by the Redis `run_id` row |
| Pressure/OOM episode history | Yes |
| The sampler's live pressure streak | No — it rebuilds from new samples (see `insufficient-samples` below) |

A **Redis** restart (which changes `run_id`) starts a new alert-state row
rather than clearing the watermark: the old row is retained for diagnostics
and simply no longer consulted. This satisfies "a Redis restart clears the
watermark" — the alert does not carry across to the new identity — without
destroying the evidence.

## Recognizing partial post-restart history

The pressure *streak* is recomputed from recent samples, so a post-restart
`insufficient-samples` state is expected and is *not* evidence of health or
pressure. On the detail endpoint:

- `history.bufferStartedAt` — the oldest retained sample. It survives
  restarts, so compare it with the backend's boot time to see how much
  history the current process was not alive for.
- `history.sampleCount` vs `history.validSampleCount` — failed attempts
  remain in the series, so a gap between the two means some ticks failed or
  were skipped; they are counted separately so failed samples cannot
  inflate the apparent quality of the record.

The default detail view covers the last 24 hours. To see deeper history
(e.g. to compare a current reading with last month's baseline), pass the
range explicitly — rows are emitted oldest-first and the window is clamped
to the 90-day retention floor:

```bash
curl -s -H "Authorization: Bearer <admin-token>" \
  "http://<host>/api/health/redis-memory?from=2026-07-01T00:00:00.000Z&limit=5000" | jq '.samples | length, .[0].at, .[-1].at'
```

`truncated: true` in the response means more rows matched than were
returned; `totalMatching` says how many. `allInstances=true` widens the
read across every sampler that ever wrote to this database (see the
identity contract below), and every returned sample carries its
`instanceId` so mixed reads are never merged into one bogus trend line.

## The unreadable-run_id gap

When the sampler cannot read `run_id` (Redis flapping, network partition),
identity is reported as `unknown`, transitions are **skipped**, and the
alert state is left untouched. An OOM occurring during that window is not
alerted at the time — but the counter is cumulative, so it surfaces as a
delta on the next successful sample and opens the incident then. Pressure
samples still record normally during the gap; only alert-state transitions
pause.

## Retention and pruning

Samples are retained for 90 days (`REDIS_SAMPLE_RETENTION_DAYS`). A nightly
prune (`EVERY_DAY_AT_3AM`) deletes expired rows in bounded batches of 5,000
(up to 20 batches per run), each committing independently so a
long-neglected table drains incrementally and a failure keeps progress.

A `Redis sample prune hit the 20-batch ceiling` warning means growth is
outpacing one night's budget (≈100k rows/day above 3AM, which implies
sub-minute sampling or multiple samplers): the work is not lost, it
finishes the next night, but sustained ceiling hits are worth a look. A
failed prune logs `Redis sample prune failed` and retries tomorrow; it is
a diagnostic warning, never an outage.

## Instance identity contract

The sampler stamps every row with `MONITORING_INSTANCE_ID` (falling back
to `HOSTNAME`, then to a random id with a startup warning). In Docker this
**must** be pinned: `container_name` does not make the hostname stable —
`docker compose up -d` after a rebuild recreates the container and assigns
a new one. Both compose files set `MONITORING_INSTANCE_ID=erp_backend` by
default; the variable must be **stable across restarts** and **unique per
running sampler** (multi-replica deployments need one value per replica).

If it is not pinned, the sampler generates a new id per boot and the
operator sees: short default history (each boot starts a new series), extra
entries in `knownInstances` (one per boot), and the startup fallback
warning in the backend logs. The alert state is unaffected — it is keyed
by the Redis `run_id`, not the instance id.

## Distinguishing a genuine backlog from a leak

`degraded` with `sustained-pressure` means Redis is using ≥80% of its
256 MiB cap. Determine whether the growth is legitimate queue load or a
leak before touching anything:

```bash
# Utilization and peak
redis_cli INFO memory | grep -E "^used_memory_human:|^used_memory_peak_human:|^maxmemory_human:"

# What is in the instance — queue keys only
redis_cli INFO keyspace

# Queue depth (the established inspection from CLAUDE.md)
redis_cli ZCARD bull:backup-queue:delayed
redis_cli ZRANGE bull:backup-queue:delayed 0 -1
redis_cli ZRANGE bull:backup-queue:repeat 0 -1 WITHSCORES
```

Interpretation:

- **Backlog**: the `bull:backup-queue:delayed` set is large and growing with
  legitimate scheduled work, and no unexpected key types appear in
  `INFO keyspace`. Growth tracks scheduled jobs.
- **Leak**: keys are growing when the queue depth is flat, unexpected keys
  appear, or a producer enqueues far more than the consumers drain.

Never add cache or session keys to this instance (see Prohibitions below) —
`users.module.ts` carries a dormant `CacheModule.register()` that is the
concrete way this gets violated.

### History view is the first stop

For peak and trend, start at `/settings/redis-monitoring` (admin). It renders
`/api/health/redis-memory`'s `windowStats`, which are computed in SQL over the
full filtered window and are exact even when the sample list is truncated. The
chart beside them plots only the newest `REDIS_DETAIL_MAX_ROWS` samples, so at
the 60s interval it may cover a recent slice (roughly the newest 3.5 days on a
7-day request) while the statistics describe the whole window — do not
interpret the chart's visible range as the statistics' coverage. The SQL in
#1057 remains valid for offline analysis.

## OOM occurrences

A positive `oomErrors` delta means Redis rejected at least one command with
`OOM command not allowed when used memory > 'maxmemory'`. It proves a write
failed; it does **not** prove that jobs were lost — depending on the BullMQ
operation, a job may not have been enqueued, or a state transition may have
failed. Work **may** be affected.

`/api/health/redis-memory` reports the counter status:

- `counters.oomErrors.value` — cumulative count since the counter's last
  reset; `lastDelta` is the most recent positive delta and `lastChangedAt`
  when it happened.
- `available: false` means the `errorstats` section is missing or disabled
  — the counter is *unavailable*, not zero.

On an OOM occurrence, and only then, investigate producers, failed
operations, and queue state:

```bash
redis_cli INFO errorstats | grep errorstat_OOM
docker compose logs backend --since 10m | grep -i "OOM command not allowed"
docker compose exec -T backend node -e '
const { Queue } = require("bullmq");
const q = new Queue("backup-queue", { connection: {
  host: process.env.REDIS_HOST, port: +process.env.REDIS_PORT,
  password: process.env.REDIS_PASSWORD } });
q.getFailed(0, 50).then((j) => j.forEach((x) => console.log(x.id, x.failedReason)))
 .finally(() => q.close());
'
```

A counter **decrease** (Redis restart or `CONFIG RESETSTAT`) re-baselines
silently — it is not an occurrence.

## Eviction — this must never happen

A non-zero `evicted_keys` delta proves eviction occurred during that
interval, which should be impossible under `noeviction`. The first step is
to inspect the policy actually in effect:

```bash
redis_cli CONFIG GET maxmemory-policy
```

Then distinguish which drift it reveals:

- **Runtime-only drift** — the compose definition still declares
  `noeviction` but the running instance reports something else (a
  hand-applied `CONFIG SET`). Restart Redis so its original start-time
  command is reapplied, then verify:

  ```bash
  docker compose restart redis
  redis_cli CONFIG GET maxmemory-policy   # must print noeviction
  ```

- **Compose-definition drift** — the compose file itself no longer
  specifies `--maxmemory-policy noeviction`. Fix the compose file, then
  recreate the container (`--maxmemory-policy` is a start-time flag, so a
  plain `docker compose up -d redis` is a no-op when the service definition
  already matches the running container):

  ```bash
  docker compose up -d --force-recreate redis
  redis_cli CONFIG GET maxmemory-policy   # must print noeviction
  ```

After restoring the policy, watch `evicted_keys` and `INFO keyspace` for
post-eviction damage: BullMQ has no recovery path for evicted keys, so
eviction can silently drop job hashes or queue state.

## Sizing the cap — the 2026-09-05 measurement

**Decision: retain 256 MiB.** Local history demonstrates persistence across
Redis restarts; **production sizing and survival across a confirmed deploy
remain unverified.** The mandatory production measurement in `CLAUDE.md` is
**not** discharged by this section and remains required unconditionally.

Evidence is one frozen window from the **local development stack only**, upper
bound `sampledAt < 2026-09-05 00:00:00-07`:

| Metric | Value |
|---|---|
| Window | 2026-08-14 13:21:40 -07 → 2026-09-04 23:59:00 -07 (21d 10:37:19) |
| Samples | 30,667 (0 failed) |
| Peak `usedBytes` | 3,008,424 @ 2026-08-29 10:15:00 -07 |
| p50 / p95 / p99 `usedBytes` | 2,820,464 / 2,961,160.8 / 2,976,896 |
| `maxBytes` | 268,435,456 |
| Peak utilization | **1.121%** exact |
| `evictedKeys` / `oomErrors` | 0 / 0 |

Peak utilization is 1.121% computed from bytes. The stored
`utilizationPercent` reads `1.00` because the parser rounds to whole
percentages (`backend/src/modules/monitoring/redis-info.parser.ts:50`) — read
the byte columns when you need precision, not the stored percentage.

Reproduce with:

```bash
docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "
  SELECT count(*) AS samples,
         count(*) FILTER (WHERE NOT ok) AS failed,
         min(\"sampledAt\") AS first_sample,
         max(\"sampledAt\") AS last_sample,
         max(\"sampledAt\") - min(\"sampledAt\") AS span,
         max(\"usedBytes\") AS peak_used_bytes,
         max(\"maxBytes\") AS max_bytes,
         percentile_cont(0.50) WITHIN GROUP (ORDER BY \"usedBytes\") AS p50,
         percentile_cont(0.95) WITHIN GROUP (ORDER BY \"usedBytes\") AS p95,
         percentile_cont(0.99) WITHIN GROUP (ORDER BY \"usedBytes\") AS p99,
         max(\"evictedKeys\") AS evicted_keys,
         max(\"oomErrors\") AS oom_errors,
         round(max(\"usedBytes\")::numeric / max(\"maxBytes\")::numeric * 100, 3) AS peak_util_exact
  FROM redis_memory_samples
  WHERE \"instanceId\" = '"'"'erp_backend'"'"'
    AND \"sampledAt\" >= '"'"'2026-08-14 13:21:40.63-07'"'"'
    AND \"sampledAt\" <  '"'"'2026-09-05 00:00:00-07'"'"';"'
```

Substitute your own instance id and window bound to re-run it later.

Output, preserved as the historical record (run 2026-09-06):

```
 samples | failed |       first_sample        |        last_sample         |         span         | peak_used_bytes | max_bytes |   p50   |    p95    |   p99   | evicted_keys | oom_errors | peak_util_exact
---------+--------+---------------------------+----------------------------+----------------------+-----------------+-----------+---------+-----------+---------+--------------+------------+-----------------
   30667 |      0 | 2026-08-14 13:21:40.63-07 | 2026-09-04 23:59:00.003-07 | 21 days 10:37:19.373 |         3008424 | 268435456 | 2820464 | 2961160.8 | 2976896 |            0 |          0 |           1.121
```

**The output above is the evidence, not the query.** Re-running this will not
reproduce it indefinitely: retention is 90 days with a nightly 3AM prune, so the
window's lower end expires and the same bounded query returns fewer rows over
time. Treat the recorded table as the historical record; the query is provided
to show how it was derived and to run the equivalent against a fresh window.

Two practices make a window usable while it lasts:

- **Specify both bounds.** An open lower bound drifts as retention prunes; an
  upper bound inside the current day keeps admitting rows, since sampling is
  continuous. Any fixed past timestamp works as the upper bound — midnight is
  a convention here, not a requirement.
- **Two consecutive identical runs** are a useful check that the upper bound is
  behind live sampling. They do **not** prove closure: retention can still move
  the result later, and identical values only mean nothing changed between the
  two runs.

Separately timestamped observations of the *unbounded* series, for contrast:
32,020 rows at 2026-09-06 13:35 +08 and 32,024 at 13:36 +08.

### What the counters can and cannot tell you

`evictedKeys = 0` and `oomErrors = 0` mean **none observed**. Neither can
exclude a container-level failure:

- `evicted_keys` is inert under `noeviction` by construction.
- `oomErrors` is a counter inside the Redis process. A container OOM kill or a
  Redis restart **can occur without incrementing either counter**: the
  replacement Redis process starts with fresh counters. Observations already
  persisted to `redis_memory_samples` and `redis_alert_state` remain available
  — it is the live counter that resets, not the recorded history.

### Restart correlation

Sampling gaps identify **sampling interruptions**. Nothing more: a gap alone
does not say whether Redis restarted, the sampler stalled, or the host slept.
The **restart correlation comes from the retained `redis_alert_state` run_id
rows**, not from the gaps. The third gap below is the demonstration — same
duration class as the first two, but no run_id change, so it is a sampler-side
interruption only. In the frozen window:

| Gap start | Gap end | Duration | `usedBytes` after | Reading |
|---|---|---|---|---|
| 2026-08-15 22:48:00 -07 | 2026-08-15 23:00:15 -07 | 12m 15s | 2,241,888 | run_id change → Redis restart |
| 2026-08-23 07:03:00 -07 | 2026-08-23 10:40:54 -07 | 3h 37m 54s | 2,248,392 | run_id change → Redis restart |
| 2026-08-28 08:44:00 -07 | 2026-08-28 08:59:13 -07 | 15m 13s | 2,835,392 | no run_id change → sampling interruption only |

The first two align with the last-write `updatedAt` of a distinct
`redis_alert_state.redisRunId` row and show a cold-start drop in `usedBytes`;
the third has no run_id change and stays warm.

Three caveats on this method:

1. `redis_alert_state` retains one row per `run_id`, which is what makes a
   process change visible at all. That retention is incidental to the table's
   purpose — do not assume it survives a schema change.
2. `updatedAt` is a **last-write timestamp, not a restart timestamp.** It
   bounds when the old process stopped being sampled; it does not date the
   restart.
3. **Deployment attribution needs independent deployment evidence.** None was
   available here, so this window evidences **zero verified deploys**. A
   backend `StartedAt` of 2026-09-04T15:31:08Z corresponds to no gap at all,
   which is the direct demonstration that gaps and deploys are different
   events.

```sql
WITH g AS (
  SELECT "sampledAt", "usedBytes",
         "sampledAt" - lag("sampledAt") OVER (ORDER BY "sampledAt") AS gap,
         lag("sampledAt") OVER (ORDER BY "sampledAt") AS prev
  FROM redis_memory_samples
  WHERE "instanceId" = 'erp_backend' AND "sampledAt" < '2026-09-05 00:00:00-07'
)
SELECT prev AS gap_start, "sampledAt" AS gap_end, gap, "usedBytes" AS used_after
FROM g WHERE gap > interval '3 minutes' ORDER BY "sampledAt";
```

That query only finds the gaps. The correlation needs the run_id rows as well —
a gap whose end aligns with the last `updatedAt` of a superseded `redisRunId`
is a Redis restart; a gap with no such row is a sampling interruption:

```sql
SELECT "redisRunId", "pressureState", "oomObservedValue", "updatedAt"
FROM redis_alert_state ORDER BY "updatedAt";
```

Recorded for the frozen window (the third row post-dates it and is the process
running at the time of writing):

```
                redisRunId                | pressureState | oomObservedValue |           updatedAt
------------------------------------------+---------------+------------------+-------------------------------
 ef529b85f5bf4414e60495fbc342a50b72490b78 | healthy       |                0 | 2026-08-15 22:48:00.024655-07
 50be9cd67236f8bd6c5003261002b0c527eee9ed | healthy       |                0 | 2026-08-23 07:03:00.014122-07
 87c03159f673a9d6014e80defdef828ba3b8c780 | healthy       |                0 | 2026-09-06 00:56:00.018418-07
```

This method depends on `redis_alert_state` retaining one row per `run_id`,
which is incidental to that table's purpose rather than guaranteed by it. A
schema change that collapsed those rows would remove the only signal
distinguishing a Redis restart from a sampling interruption. Documented
limitation, not a defect to fix here.

### Container memory margin

`docker-compose.prod.yml` gives the Redis container `limits.memory: 512M`
against `--maxmemory 256mb`, with `reservations.memory: 256M`. This is
recorded as an **unmeasured configuration fact**, not a defect. Redis needs
memory beyond `used_memory` during RDB saves and AOF rewrites (see
[Redis administration](https://redis.io/docs/latest/operate/oss_and_stack/management/admin/)),
and this stack runs both (`--save`, `--appendonly yes`). Whether the 256 MiB
margin covers a fork-time copy-on-write peak at production queue depth is
unmeasured.

At the time of writing, `docker inspect` reported `OOMKilled=false` and
`RestartCount=0` for `erp_redis` and `erp_backend`. These are **current
observations of the running containers**, not a historical audit: the restart
count tracks restart attempts and is not an OOM audit trail, and both fields
describe only the present container lifetime. Historical claims need retained
Docker events or host logs.

### Investigation triggers

Investigate the cap when any of these appear in a production environment.
None of them, and no combination, discharges the production measurement gate.

- Sustained utilization **> 50%** of the cap.
- Non-zero `oomErrors`.
- A **container OOM kill** (`docker inspect --format '{{.State.OOMKilled}}'`,
  Docker events, host `dmesg`).
- An **unexpected Redis restart** — a new `redisRunId` with no corresponding
  deployment evidence.

The last two can occur with `oomErrors` and `evicted_keys` both at zero.

## Raising the cap — when it is correct, when it masks a leak

The durable 90-day history is the dataset a cap decision needs: sample
utilization at peak queue load over weeks, then decide. The detail route
serves it with `from`, `to`, `limit`, and `allInstances` parameters (see the
deep-history query above).

- Raising the cap is a defensible response to a **measured, legitimate
  backlog** at the cap — more queue capacity is the point of the instance.
- Raising the cap to keep a **leak** from failing is masking: the leak
  grows until it hits the new cap, and the diagnosis is deferred.
- Correct the policy/leak first, then decide on the cap with real data.

## Prohibitions

- **Never revert to `allkeys-lru`** or any eviction policy. Under an
  eviction policy Redis can silently drop job hashes, queue state, or
  scheduler metadata and jobs vanish with no error. `noeviction` is a
  correctness requirement for BullMQ, not a tuning preference.
- **Never add cache or session keys to this instance.** Cache workloads
  want eviction; queue state must never be evicted. A cache workload
  requires a **separate** Redis service, never a policy revert.

## Escalation

Transition logging is the sampler's most operator-visible output: one
`logger.warn` per state transition and per positive OOM/eviction delta —
never per sample. A `sustained-pressure` transition with a flat queue, an
OOM occurrence, or any `evicted_keys` delta is a finding that should reach
the operator. Notification routing is explicitly out of scope for this
increment; until it exists, treat the transition warnings in `docker
compose logs backend` as the signal to investigate.

## In-app alerting

Administrators see Redis alert state without touching a terminal — the
TopBar status dot and the System Status panel surface the same signals the
sampler computes:

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/health/redis-alerts` | `@Auth(UserRole.ADMIN)` | Current pressure and OOM alert state, with severity |
| `POST /api/health/redis-alerts/oom/acknowledge` | `@Auth(UserRole.ADMIN)` | Acknowledge the observed OOM counter value |

The status dot next to the system icon drives its colour from the server
computed `severity`: a `critical` OOM incident turns the dot red even when
every service reports healthy, and an active `sustained-pressure` episode
turns it amber (degraded). The System Status panel (admin accounts only)
shows the detail: the pressure episode's start and peak utilization, the
unacknowledged OOM count, and the last five recovered episodes.

### How the two alert kinds behave

- **Pressure is a condition.** An episode opens when the sampler establishes
  `sustained-pressure` and auto-closes on `healthy` — no operator action
  needed. While the state is `unknown` or `insufficient-samples`, the panel
  marks the reading stale ("no live confirmation") rather than claiming a
  recovery that has not been measured.
- **An OOM is an event.** It stays active until an operator acknowledges it.
  The acknowledge action sends the counter value the operator actually saw;
  a later increase opens a **new** incident, so an acknowledgement can never
  suppress future errors. A 409 means the counter moved between render and
  click — the panel re-reads and shows the newer incident instead of an
  error.

### Operational notes

- A counter increase that happened while the backend was down is compared
  against the **persisted baseline** (keyed by the Redis `run_id`), so the
  delta — and the incident — is reported on the first sample after the
  backend returns, exactly as if it had been observed live.
- A counter reset (Redis restart or `CONFIG RESETSTAT`) clears the alert
  watermark: a restarted Redis gets a **new** `run_id` row, so
  post-restart increases alert normally against a fresh baseline.
- Alert and acknowledgement state is durable in Postgres and survives
  backend restarts; the panel is a live view over persisted state, and the
  log-based escalation above remains the signal to watch.
