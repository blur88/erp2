# Redis memory pressure runbook

ERP2 uses Redis for health checks and memory monitoring. The backend sends
`PING` and reads `INFO`. It stores monitoring history and alert state in
PostgreSQL. ERP2 creates no Redis keys.

## Verify a rollout

Check the running settings against the applicable Compose file. Redis runs
without persistence (#2108): `save` is empty and `appendonly` is `no`. It
keeps the `noeviction` policy and the 256 MB cap. Redis has no data volume, so
it starts empty after every container recreation, and monitoring history and
alert state come from PostgreSQL. Run the Redis checks from the deployment
directory with the deployment password already exported as `REDISCLI_AUTH`.

```bash
redis_cli() { docker compose exec -T -e REDISCLI_AUTH redis redis-cli --raw "$@"; }

redis_cli PING
redis_cli CONFIG GET maxmemory maxmemory-policy save appendonly
redis_cli INFO memory
redis_cli INFO stats
redis_cli INFO persistence
redis_cli INFO keyspace
```

Expected from `CONFIG GET`: `maxmemory` is `268435456`, `maxmemory-policy` is
`noeviction`, `save` is an empty string, and `appendonly` is `no`. A
`save` or `appendonly` value that is not empty or `no` means the running
container predates #2108 or was started from another Compose file. Recreate it
from the current file instead of changing settings in place. `INFO persistence`
should report no background save or rewrite activity.

### Legacy Redis data files

Before #2108 Redis mounted `./data/redis` at `/data` and wrote `dump.rdb` and
`appendonlydir/` there. The current Compose files no longer mount that
directory, so Redis never reads those files and never deletes them. After a
rollout is verified, an operator may remove `data/redis` by hand. Automated
steps must not delete it, and nothing in ERP2 needs it. The deployment
scripts no longer create that directory.

Check backend startup with the public health endpoint. Compare the latest
sample time with the start time of the backend you just deployed. While the
sampler is rebuilding its pressure window, successful Redis connectivity can
appear as `degraded` with `pressure.state=insufficient-samples`.

```bash
curl -fsS "$ERP_URL/api/health" | jq '.services.redis'
curl -fsS -H "Authorization: Bearer $ADMIN_TOKEN"   "$ERP_URL/api/health/redis-memory" | jq '.pressure, .history, .counters'
```

`GET /api/health/redis-memory` requires an administrator and backs the
**Settings → Redis Monitoring** view. Capture new observations after a rollout.
The [Major upgrade runbook](POSTGRES_19_MAJOR_UPGRADE_RUNBOOK.md#one-time-redis-queue-cleanup)
covers removing the legacy Redis data once.

## Monitoring implementation

**Redis memory monitoring persists to Postgres, never to Redis**: the sampler writes samples (`redis_memory_samples`) and alert state (`redis_alert_state`) through TypeORM; Redis itself is only ever *read* (INFO) by the monitoring module. Alert state is keyed by the Redis `run_id`, so a Redis restart yields a **new** row rather than clearing a watermark — the old row is retained for diagnostics and simply no longer consulted. Samples are keyed by `MONITORING_INSTANCE_ID`, which **must be stable across restarts and unique per running sampler** (compose pins `erp_backend`; `HOSTNAME` is the container ID and changes on recreation). The `bigint` columns on these tables need `SafeIntegerTransformer` (`safe-integer.transformer.ts`), which throws rather than silently truncating values past `MAX_SAFE_INTEGER`.

The detail route also returns `windowStats` — an **exact** aggregate over the
full filtered window, computed in SQL and grouped by instance. It exists because
`samples` is capped at `REDIS_DETAIL_MAX_ROWS` (5000) and newest-anchored: at the
60s interval a 7-day request returns roughly the newest 3.5 days, so any peak
computed from `samples` describes that slice, not the window. Read peaks from
`windowStats`, never from `samples`. Counter deltas there are the **sum of
positive consecutive increases**, not `max - min`, which is wrong in both
directions across a `CONFIG RESETSTAT`; `delta: null` means fewer than two
comparable readings and is distinct from a measured `0`. `/settings/redis-monitoring`
renders this.

## Interpreting the pressure state

`/api/health` returns HTTP 200 even when a required service is unhealthy.
An HTTP success check such as `curl -f` establishes backend liveness.
Operational health also requires valid response JSON with `healthy` for
the overall status and for the backend, database, and Redis statuses.
From the deployment directory, run `bash ./setup.sh check-health [url]`
with `curl` and `jq` available. The default URL is
`http://localhost:3001/api/health`. For a backend without a published port,
pass the URL and backend container ID to run `curl` inside that container.
The gate polls every 30 seconds for up to
ten minutes when Redis is connected and degraded with `insufficient-samples`
in the pressure state or reason. It requires a healthy response before
returning success.

`services.redis.status` is `unhealthy` if
the live Redis check fails, `degraded` if monitoring is unavailable or the
pressure state is anything other than `healthy`, and `healthy` when the Redis check and
pressure evaluation both pass. When monitoring is available,
`services.redis.pressure.state` has four possible values:

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

Samples and alert state are stored in **Postgres**, never in Redis. The monitoring module reads Redis metrics.

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

Redis itself keeps nothing across a restart (#2108: no RDB snapshots, no AOF,
no data volume). Its keys and counters start empty again, which is why the
`run_id` changes. Everything ERP2 needs to survive that restart is already in
Postgres.

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

## Investigate pressure, OOM, or eviction

Start with the monitoring window covering the alert. Review utilization and
peak memory alongside counter deltas and the reported Redis identity. Compare
`used_memory` and `used_memory_rss` with the Redis cap and container memory
limit. Persistence is off (#2108), so Redis writes no snapshot or AOF files;
check Redis logs for OOM or startup messages instead. A changed `run_id`
indicates a Redis restart, and every key and counter starts empty after it.

Unexpected keys or growing key counts warrant checking which clients use the
instance. Inspect `INFO keyspace` and use incremental `SCAN` to identify owners
before changing data. `noeviction` rejects writes when Redis reaches its cap.
A rising OOM counter signals rejected commands. A rising eviction counter
warrants checking the active policy and identifying affected clients.

Capture the pressure state, sample window, counter deltas, Redis configuration,
container memory and backend transition logs before changing the cap. Evaluate
sustained utilization and leave room for RSS overhead. With persistence off
(#2108), fork and AOF buffers no longer add to RSS.

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
