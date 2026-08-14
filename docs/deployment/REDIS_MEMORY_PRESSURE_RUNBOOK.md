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

## Raising the cap — when it is correct, when it masks a leak

The 256 MiB cap stays pending production measurement. The durable 90-day
history is exactly the dataset a cap decision needs: sample utilization at
peak queue load over weeks, then decide. The detail route serves it with
`from`, `to`, `limit`, and `allInstances` parameters (see the deep-history
query above).

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
