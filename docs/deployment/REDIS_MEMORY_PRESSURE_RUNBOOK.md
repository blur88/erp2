# Redis Memory-Pressure Detection — Operator Runbook

This runbook covers detecting, diagnosing, and remediating Redis memory
pressure on the ERP's queue-only Redis instance. It describes the signal
produced by the `MonitoringModule` sampler (one `INFO` sample per minute,
24 hours of bounded in-memory history), how to read it, and what to do when
it says something is wrong.

## Prerequisites and access

The health endpoint is public; the detail endpoint requires an
administrator account:

| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/health` | public | Live ping plus the sampler's latest pressure summary |
| `GET /api/health/redis-memory` | `@Auth(UserRole.ADMIN)` | Full 24h sample series, counters, and configuration |

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

## Recognizing partial post-restart history

The buffer is **in-memory only** and starts empty on every restart. A
post-restart `insufficient-samples` state is expected and is *not* evidence
of health or pressure. On the detail endpoint:

- `history.bufferStartedAt` — the oldest retained sample. Compare with the
  backend's boot time to see how much of the 24h window exists.
- `history.sampleCount` vs `history.validSampleCount` — failed attempts
  remain in the series, so a gap between the two means some ticks failed or
  were skipped; they are counted separately so failed samples cannot
  inflate the apparent quality of the record.

Full history: 1,440 samples at 60s intervals = 24 hours. After restart the
sampler takes an immediate startup sample, so the buffer is never empty for
a full interval.

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

The 256 MiB cap stays pending production measurement. The 24-hour volatile
in-memory history **cannot justify changing it**: capacity re-evaluation
needs durable, longer-term data that this monitoring increment deliberately
does not collect.

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

- A non-zero OOM counter inherited at backend startup does **not** alert —
  it predates the current process and is not attributable to it.
- A counter reset (Redis restart or `CONFIG RESETSTAT`) clears the alert
  watermark, so post-restart increases alert normally.
- Alert and acknowledgement state is held **in process memory** and resets
  on backend restart; there is no durable alert history. Treat the panel as
  a live view, and rely on the log-based escalation above for anything that
  must survive a restart.
