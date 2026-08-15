# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ERP system — NestJS 11 backend + React 19 / TypeScript 6 / Material-UI v9 frontend, served via NGINX in Docker.

- **Databases**: PostgreSQL 18.3 (TypeORM, primary), Redis 8.6 (caching, queues, WebSocket state)
- **Queue**: BullMQ via `@nestjs/bullmq` (background jobs)
- **Testing**: Jest (backend) + Vitest (frontend)
- **Default admin**: `admin / Admin@123!` — change on first login

## Key Commands

```bash
# Start everything (recommended)
docker compose up -d

# Backend dev server (hot reload, no Docker)
cd backend && npm run start:dev

# Frontend dev server (no Docker)
cd frontend && npm run dev

# Run all backend tests
cd backend && npm run test

# Run a single backend test file (path relative to backend/)
cd backend && npx jest src/path/to/file.spec.ts --no-coverage

# Run backend e2e tests (required after entity/migration changes)
cd backend && npm run test:e2e

# Run all frontend tests (slow — ~12 minutes for ~167 files; do NOT assume hung)
cd frontend && npm run test

# Run a single frontend test file (path relative to frontend/)
cd frontend && npx vitest run src/path/to/file.test.tsx

# TypeScript check (frontend, no build)
cd frontend && npm run type-check

# Generate a DB migration (after changing entities)
cd backend && npm run migration:generate --name=DescriptiveName

# Run migrations
cd backend && npm run migration:run

# Revert last migration
cd backend && npm run migration:revert

# Lint & format
cd backend && npm run lint && npm run format

cd frontend && npm run lint

# Maintenance menu (outdated deps, audit, knip, jscpd, docker rebuild)
./maintain.sh

# Deploy
./deploy.sh          # start
./deploy.sh restart  # restart
./deploy.sh logs     # view logs
./deploy.sh status   # check status
```

## Architecture

**Active business modules** (12, `backend/src/modules/`): `AuthModule`, `UsersModule`, `InventoryModule`, `SalesModule`, `PurchasingModule`, `DashboardModule`, `SettingsModule`, `PrintSettingsModule`, `PriceListsModule`, `AuditLogsModule`, `BackupModule`, `SearchModule`

Plus `ErrorManagementModule` (`backend/src/common/error-management`) — cross-cutting exception filters/interceptors, registered in `app.module.ts` ahead of the business modules.

The accounting module was removed (issue #884) — no `modules/accounting`, no journal entries, no chart of accounts.

Reports are not a module: Sales/Purchasing/Inventory "reports" are routes and methods **inside** the respective `*-analytics` controllers/services, which also serve the dashboards.

**Non-obvious decisions:**
- `TypeScript strict: false` — use `as any` when TypeORM types resist
- DB uses `family: 4` (IPv4 force) and SSL disabled for Docker PostgreSQL compatibility
- Frontend environment variables injected at runtime via `window.__ENV__` (not build-time) so one Docker image works across environments
- Backend source changes require `docker compose build backend && docker compose up -d backend` — there is no volume mount for live reload in Docker
- All API responses go through `ApiService` which wraps them as `{ data: T, meta?: {...} }` — see Gotchas for access patterns
- Frontend API calls use RTK Query (`frontend/src/store/api/`); `ApiService` (Axios) is the underlying transport layer

## Pre-PR verification gates

`AGENTS.md` defines these as **required**, scoped to the files touched (not a default set). PRs must state the exact commands run and whether they passed.

- Backend `src/**`: `cd backend && npm run lint && npm run type-check && npm run test`
- Backend entities/migrations: also `npm run migration:run && npm run test:e2e`
- Frontend `src/**`: `cd frontend && npm run lint && npm run type-check && npm run test` (full suite required even for one-line changes)
- Cross-app DTO/interface changes: both backend and frontend suites, plus `cd backend && npm run type-check` — an exported DTO or interface whose declaration no longer resolves is exactly what this gate catches

## Gotchas

**NestJS route order**: Specific routes (`/products/deleted`) MUST be declared before parameterized routes (`/products/:id`) in controllers, or NestJS will try to treat `"deleted"` as a UUID and fail.

**Soft delete**: Always use TypeORM's `softDelete(id)` method — it sets the `deletedAt` timestamp. Setting `isActive = false` manually does NOT set `deletedAt`, breaking `withDeleted` queries and the restore flow.

**API response structure**: `ApiService` strips the Axios wrapper and returns the backend body directly. For paginated list endpoints the body is `{ data: T[], meta: {...} }` — access items as `response.data` and pagination as `response.meta`. For tree/hierarchy endpoints (categories, chart of accounts) the body is a plain array — access as `response` directly (no `.data`). Getting this wrong causes empty lists with no errors.

**Account lockout clock:** Lockout expiry (`User.isLocked`, the login check in `auth.service.ts`, and the `isLocked` filter/count in `users.service.ts`) is evaluated against the **Node container clock** (`new Date()`), never SQL `NOW()`. This keeps login and the user list using one clock so a skewed Postgres container clock can't disagree (issue #710). Docker container clocks can drift after host sleep/resume or container start; if a lockout seems wrong, run `docker compose restart backend` (or resync the host clock). Do not change these comparisons to SQL `NOW()`.

**Frontend Docker**: Changes to frontend source require a rebuild — `docker compose build frontend && docker compose up -d frontend`. The Vite dev server (`npm run dev`) is for local-only development.

**Path aliases**: Frontend uses `@/` as alias for `src/`. Backend uses `@/*` → `src/*`, `@modules/*` → `src/modules/*`, `@common/*` → `src/common/*`, `@config/*` → `src/config/*`, and `@database/*` → `src/database/*`.

TypeScript CLI scripts that directly or transitively import configured path aliases such as `@database/*` must preload `tsconfig-paths/register` in their npm script (for example, `ts-node -r tsconfig-paths/register ...`). TypeScript type-checking resolves these aliases, but Node runtime loading does not.

`backup:reconcile-schedulers` needs this; `admin:create` does not, only because it uses relative imports throughout. The failure is runtime-only — it passes `npm run type-check` and surfaces as an unresolvable module when the script actually runs — and it arrives transitively, so a script whose own imports are all relative can still need the flag via what it pulls in.

**The same trap reaches the application bundle, and there it is fatal.** The Docker build runs two compilers in sequence:

```
npm run build                  # nest build — DOES rewrite path aliases
npx tsc -p tsconfig.cli.json   # plain tsc — does NOT rewrite them
```

Both write to `dist/`. `tsconfig.cli.json` includes `src/database/cli/**/*`, so **any `src/` file reachable from a CLI entrypoint gets recompiled by the second pass and overwrites `nest build`'s correct output**. If that file imports via `@database/*`, the alias survives verbatim into `dist/` and Node throws `MODULE_NOT_FOUND`. When the file is also in `app.module`'s require chain, the *entire backend crash-loops* — this took production down on 2026-08-15 via `orphaned-scheduler-reconciler.service.ts`, which `reconcile-schedulers.ts` imports transitively.

Nothing in the normal gate catches it: the source is valid TypeScript, `npm run type-check` passes, and `npm run test` transpiles from `src/` with alias resolution. Only the built artifact is wrong. `backend/scripts/verify-dist-runtime.sh` (`npm run verify:dist`) is the gate — it scans `dist/` for surviving aliases and then loads `dist/main.js` to prove the require graph resolves. It runs inside the Dockerfile after the CLI compile, so a corrupt image fails the build instead of shipping.

Rule: **files reachable from `tsconfig.cli.json`'s `include` must use relative imports, never path aliases.** The CLI pass currently reaches 68 `src/` files. Check reach with `npx tsc -p tsconfig.cli.json --noEmit --listFiles`.

**Dead-code sweeps**: `maintain.sh do_knip()` wraps `npx knip` in `|| true`, so it always exits 0 and cannot be used as a gate — run `npx knip` directly per directory when you need pass/fail. Knip also reports false positives for backend service methods called by a *sibling service* rather than an HTTP route; grep the method name across `backend/src` before deleting anything.

**Migration baseline**: the chain starts from a single `InitialSchema` genesis migration (#950). `npm run migration:run` works against an empty database, so a new migration can be validated end-to-end locally. Migration failure is fatal — there is no `schema:sync` fallback in the entrypoint or E2E setup. Verify a schema change with `backend/scripts/verify-baseline.sh` and `backend/scripts/verify-seeds.sh`.

**Redis is `noeviction`, and BullMQ requires it**: The Redis instance is the BullMQ queue backing store *only* — no cache, no sessions, despite what older comments claimed. `--maxmemory-policy noeviction` (issue #1036) is a correctness requirement, not a tuning preference: BullMQ has no recovery path for evicted keys, so under an eviction policy Redis can silently drop job hashes, queue state, or scheduler metadata and jobs vanish with no error.

Never add cache or session keys to this instance. Cache workloads want eviction, queue workloads must never be evicted, and the two are irreconcilable on one instance — introducing a cache requires a *separate* Redis service, never a policy revert. `users.module.ts` carries a dormant `CacheModule.register()` that is the concrete way this gets violated.

`--maxmemory-policy` is a start-time flag on the `redis-server` command, so the container must be **recreated** (`docker compose up -d redis`), not merely restarted; a runtime `CONFIG SET` is reverted on the next recreate. The compose files are the source of truth.

*Mandatory pre-rollout baseline capture* — run per environment from the deployment directory (wherever that environment's compose files live), **before** switching the policy. A non-zero `evicted_keys` means eviction has already damaged queue state and must be investigated before any change:

```bash
redis_password="$(docker compose exec -T backend printenv REDIS_PASSWORD)"
redis_cli() { docker compose exec -T -e REDISCLI_AUTH="$redis_password" redis redis-cli --raw "$@"; }

redis_cli CONFIG GET maxmemory-policy
redis_cli INFO memory | grep -E "^used_memory_peak_human:|^maxmemory_human:"
redis_cli INFO stats | grep -E "^evicted_keys:"   # MUST be 0
redis_cli INFO keyspace
```

Extract the password from the container as shown — `$REDIS_PASSWORD` is generally *not* exported in the host shell, and an unset var makes `REDISCLI_AUTH=""` fail with `NOAUTH`. `REDISCLI_AUTH` also keeps the password out of the process argument list, unlike `-a`.

*Verification after rollout* needs a restart-bounded window plus a positive marker — `docker compose logs` retains pre-change history, so a naive grep still finds the old warning, and a backend that fails to start produces an empty window that reads as success:

```bash
docker compose up -d redis && docker compose restart backend
docker compose logs backend --since 90s 2>&1 | grep -E "Initialized [0-9]+ backup schedules|Eviction policy"
```

Pass requires **both**: `Initialized N backup schedules` present (it cannot print unless BullMQ initialized against Redis) and `Eviction policy` absent.

The 256 MiB cap is unchanged and stays **pending production measurement** — the ~2.8M peak (~1.1%) was measured on the local development stack only; production queue depth is unverified. Re-evaluating the cap against captured production values is a mandatory rollout gate, not an optional follow-up. The cap matters more now that `noeviction` makes hitting it a hard `OOM command not allowed` failure rather than silent eviction.

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

**Cross-file type errors need `npm run type-check`**: `npm run test` uses per-file ts-jest transpilation and will not catch cross-file declaration errors (e.g. TS4053, a public method whose inferred return type names a non-exported interface). Before issue #1039 those surfaced first at `docker compose build backend`, after every pre-PR gate had passed; `cd backend && npm run type-check` is now a required backend gate and runs in CI ahead of the unit tests.

It compiles `tsconfig.build.json` — the config `nest build` uses — deliberately, so the gate mirrors the image build that would otherwise be the first failure. That config excludes specs, so **spec-only type errors are not covered by this gate**; they remain caught by ts-jest at test time. Type-checking specs as a whole program would need a second `tsc -p tsconfig.json --noEmit` pass, which is a separate change gated on assessing the pre-existing errors it would surface.

**BullMQ v5→v6 migration: complete (#1033)**. `removeLegacyRepeatables()` and the three v5-migration tests were removed once the gate passed — no environment held a blocking entry (a bare-hex member with no `ic` field). Nothing in the codebase cleans up v5 repeatables any more, so a v5 process must never write to this Redis again.

`bullmq-v5` (`npm:bullmq@5.81.3`) **was retired in #1050** and is no longer a backend devDependency. Earlier revisions of this file said to keep it; that guidance is superseded. `test/orphaned-scheduler-reconciliation.redis-spec.ts` now seeds its own fixtures:

- Scheduler-format orphans (`ic` present, bare-hex member) use **v6**'s `upsertJobScheduler` with the id passed explicitly — v6 forwards it verbatim, so the on-disk shape is identical.
- The **non-`ic` legacy repeatable**, which v6 has no code path to write, is hand-rolled with raw `zadd`/`hset` in `seedLegacyRepeatable()`.

That legacy shape was **captured byte-for-byte from a real `bullmq@5.81.3` `Queue.add(..., { repeat: { pattern } })`** against Redis 8.6.2 while the alias was still installed, then asserted to match — not reconstructed from documentation. The captured shape is recorded in the helper's docblock. One detail that a from-memory reconstruction gets wrong: the metadata hash `repeat:<member>` holds **only `{name, pattern}`** — there is no `data` field on it. The `scheduleId` lives on the *delayed job* hash `repeat:<member>:<millis>`. The reconciler's `ic` check (`orphaned-scheduler-reconciler.service.ts:125`) short-circuits before its `data` read, which is why the legacy entry is skipped rather than misclassified.

The unit tests mock `hexists`, so they cannot catch an inverted `ic` check — `npm run test:redis` is the only thing that does. It is on CI's critical path. **`Tests: 0 total` there is a failure, not a pass**: a suite that fails to load reports zero and looks green to a careless reading. It must report **11 passing**. Verified by inverting the `ic` discriminator, which turns the legacy test red at the `legacySkipped` assertion.

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

**Pulling main**: Always use `git pull --ff-only` on `main` (or set globally: `git config --global pull.ff only`). A regular `git pull` with `merge.ff = false` creates a merge commit that re-triggers the Release workflow unnecessarily.
