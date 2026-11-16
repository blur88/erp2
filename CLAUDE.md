# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Before implementation, agent-facing documentation changes or reviews, follow the [workflow entry points in AGENTS.md](AGENTS.md#workflow-entry-points).

## Project Overview

ERP system — NestJS 11 backend + React 19 / TypeScript 6 / Material-UI v9 frontend, served via NGINX in Docker.

- **Databases**: PostgreSQL 18.3 (TypeORM, primary), Redis 8.6 (BullMQ queue backing store)
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
# NODE_OPTIONS is required — bare `npx jest` runs without vm-based ESM and
# every .ts file falls back to CommonJS (see the Jest ESM section below).
cd backend && NODE_OPTIONS=--experimental-vm-modules npx jest src/path/to/file.spec.ts --no-coverage

# Run backend e2e tests
cd backend && npm run test:e2e

# Run all frontend tests (can be slow; do not assume the run is hung)
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

# Development deployment (builds from local source)
./deploy.sh          # start
./deploy.sh restart  # restart
./deploy.sh logs     # view logs
./deploy.sh status   # check status

# Production deployment (prebuilt images, docker-compose.prod.yml)
./setup.sh
```

For release → Docker Hub → production, see [the release workflow](.github/workflows/release.yml), [the Docker image repository ADR](docs/adr/0001-two-docker-repositories.md), and [setup.sh](setup.sh) with [docker-compose.prod.yml](docker-compose.prod.yml).

## Architecture

**Business modules**: see `backend/src/modules/` for the current module set.

Plus `ErrorManagementModule` (`backend/src/common/error-management`) — cross-cutting exception filters/interceptors, registered in `app.module.ts` ahead of the business modules.

Sales/Purchasing/Inventory "reports" are routes and methods **inside** the respective `*-analytics` controllers/services, which also serve the dashboards.

**Non-obvious decisions:**
- `TypeScript strict: false` — use `as any` when TypeORM types resist
- DB uses `family: 4` (IPv4 force). Database SSL is **opt-in via `DB_SSL` in every environment, including production** (#1158) — `NODE_ENV` is deliberately not consulted, because the in-compose Postgres is on a private Docker network and serves no TLS. `createSSLConfig` returns `false` unless `DB_SSL=true`, and `{ rejectUnauthorized: true }` (plus CA/cert/key when all three are set) when it is. `ssl.config.spec.ts` asserts the result is identical across environments; a production-only branch is what made the flag inert before.
- Frontend environment variables injected at runtime via `window.__ENV__` (not build-time) so one Docker image works across environments
- Backend source changes require `docker compose build backend && docker compose up -d backend` — there is no volume mount for live reload in Docker
- All API responses go through `ApiService` which wraps them as `{ data: T, meta?: {...} }` — see Gotchas for access patterns
- Frontend API calls use RTK Query (`frontend/src/store/api/`); `ApiService` (Axios) is the underlying transport layer

## Pre-PR verification gates

Follow [AGENTS.md — Change-Scoped Verification](AGENTS.md#change-scoped-verification-required-before-pr) for applicable checks and acceptable CI evidence, and use the [PR template](.github/pull_request_template.md) to record results.

## Gotchas

**NestJS route order**: Specific routes (`/products/deleted`) MUST be declared before parameterized routes (`/products/:id`) in controllers, or NestJS will try to treat `"deleted"` as a UUID and fail.

**Soft delete**: Always use TypeORM's `softDelete(id)` method — it sets the `deletedAt` timestamp. Setting `isActive = false` manually does NOT set `deletedAt`, breaking `withDeleted` queries and the restore flow.

**API response structure**: `ApiService` strips the Axios wrapper and returns the backend body directly. For paginated list endpoints the body is `{ data: T[], meta: {...} }` — access items as `response.data` and pagination as `response.meta`. For tree/hierarchy endpoints (categories, chart of accounts) the body is a plain array — access as `response` directly (no `.data`). Getting this wrong causes empty lists with no errors.

**Account lockout clock:** Lockout expiry (`User.isLocked`, the login check in `auth.service.ts`, and the `isLocked` filter/count in `users.service.ts`) is evaluated against the **Node container clock** (`new Date()`), never SQL `NOW()`. This keeps login and the user list using one clock so a skewed Postgres container clock can't disagree (issue #710). Docker container clocks can drift after host sleep/resume or container start; if a lockout seems wrong, run `docker compose restart backend` (or resync the host clock). Do not change these comparisons to SQL `NOW()`.

**Frontend Docker**: Changes to frontend source require a rebuild — `docker compose build frontend && docker compose up -d frontend`. The Vite dev server (`npm run dev`) is for local-only development.

**Printing is portal-only**: the transactional document dialogs (Sales/Purchase Orders, invoices) render through MUI portals **outside** `#root`, so `@media print { #root { display: none } }` (`styles/global.css`) is what isolates them — hiding the app shell leaves the portaled document alone on the page. That rule is unconditional and load-bearing for every print flow in the app; nothing renders a printable page *inside* `#root`.

The accounting reports (Profit & Loss, Balance Sheet, Form B) printed that way until #1223 removed the path entirely — layout wrapper, print stylesheet, row print axes and the CI gate. Those reports now have **no print or export route**; a replacement is deliberately deferred to a future redesign. Do not reintroduce an in-`#root` print flow without restoring the ancestor-chain release and a browser-based gate — see the #1223 history for what that machinery cost.

**If you ever add a non-portaled print page**, `#root` hiding must become conditional again, and the page must also release **every** height/overflow constraint on the ancestor chain (`100vh`, `height: 100%`, `overflow: auto`) — `#root`, its children, `main`, `.app-shell-root` (`MainLayout`'s outer 100vh flex Box, which no structural selector reaches: it sits one level *below* `#root > *` and above `main`), and `EntityTable`'s `.entity-table-card` / `-frame` / `-scroller`, the real overflow owners. Miss one and the report is pinned to a single viewport and silently truncates. This is what the removed `accountingReportPrint.css` did.

jsdom has no layout engine and does not evaluate `@media print`, so **the Vitest suite cannot validate any print path** — it can only assert that selectors exist. The browser-based gate that covered this (`frontend/e2e/accounting-print.spec.ts`, CI job `Accounting Reports - Print/PDF Gate`, #1214) was removed with the accounting print path in #1223, and dropped from ruleset 15609777's required checks at the same time. **There is no longer any Playwright infrastructure in this repo** — no `playwright.config.ts`, no `frontend/e2e/`, no `test:print` script. Reintroducing browser coverage means standing all of that back up.

SO/PO print remains covered only by the jsdom suite plus a manual browser pass. `ci.yml` triggers on `pull_request` and `workflow_dispatch` only — there is deliberately no `push` trigger, so **merging never produces a run on `main`**; validating main takes a deliberate `gh workflow run ci.yml --ref main`.

**Statement styling**: Before changing Statement layout, theme styles or visual tests, read [the coverage limits, styling invariants and browser QA procedure](docs/modules/accounting/STATEMENT_THEME_QA.md).

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

Rule: **files reachable from `tsconfig.cli.json`'s `include` must use relative imports, never path aliases.** Check reach with `npx tsc -p tsconfig.cli.json --noEmit --listFiles`.

**Dead-code sweeps**: `maintain.sh do_knip()` wraps `npx knip` in `|| true`, so it always exits 0 and cannot be used as a gate — run `npx knip` directly per directory when you need pass/fail. Knip also reports false positives for backend service methods called by a *sibling service* rather than an HTTP route; grep the method name across `backend/src` before deleting anything.

**Migration baseline**: the chain starts from a single `InitialSchema` genesis migration (#950). `npm run migration:run` works against an empty database, so a new migration can be validated end-to-end locally. Migration failure is fatal — there is no `schema:sync` fallback in the entrypoint or E2E setup. Verify a schema change with `backend/scripts/verify-baseline.sh` and `backend/scripts/verify-seeds.sh`.

**Redis operations**: Before adding Redis-backed caching or sessions, changing queue Redis policy, memory sizing or monitoring, or deploying Redis changes, read [the Redis operator runbook](docs/deployment/REDIS_MEMORY_PRESSURE_RUNBOOK.md) for rollout gates and evidence limits.

**Backend type-checking**: See [AGENTS.md](AGENTS.md#change-scoped-verification-required-before-pr) for build/test configuration coverage and applicable checks.

**Jest runs in ESM mode; `transformIgnorePatterns` no longer exists**: the backend test suite runs under `NODE_OPTIONS=--experimental-vm-modules` with `extensionsToTreatAsEsm: [".ts"]` and ts-jest `useESM: true` (transform config: `tsconfig.spec.json`, which is test-only and isolated from the build configs). All three configs (unit in `package.json`, `test/jest-e2e.json`, `test/jest-redis.json`) share this shape. The old `transformIgnorePatterns` allowlist — thirteen packages led by the `sanitize-html` ESM cluster — was deleted: it is obsolete in ESM mode. The CJS workaround could not have been extended to NestJS 12 anyway, which uses `import.meta`, invalid in CommonJS — allowlisting fails one level deeper with `SyntaxError: Cannot use 'import.meta' outside a module`.

Invariants that replaced it:

- **Every Jest script carries `NODE_OPTIONS=--experimental-vm-modules`.** Running `npx jest` bare (or `--config ./test/jest-e2e.json` without the npm script prefix) silently disables vm-based ESM: `vm.SyntheticModule`/`SourceTextModule` do not exist without the flag, every `.ts` file is treated as CommonJS, and the first `import` of an ESM-only package (`@nestjs/testing`, `@nestjs/common`, …) throws `Must use import to load ES Module`. Symptoms read as config or import bugs; the cause is the missing flag. Always run through the npm scripts.
- **A run that discovers zero tests must fail.** Both ESM failure modes — a suite that fails to load, and a whole run under the wrong module mode — report **`Tests: 0 total`**, which reads as green to a careless local reading. Jest itself exits non-zero in both cases (a suite that fails to load counts as a failed suite; a run that finds no tests is an error), so CI already fails on both — via the exit code and nothing else. **`--passWithNoTests` is what would break that**, converting zero-discovery into exit 0. It appears nowhere in this repo, and `scripts/__tests__/no-pass-with-no-tests.bats` (run by `npm run test:scripts`) keeps it that way across `package.json`, all `test/jest-*.json` configs, the leak-check orchestrator, and `ci.yml`. Exact suite/test counts are deliberately not recorded here: they went stale on every commit that added a spec, and a stale count trains readers to wave through a mismatch — the exact reflex that would miss the real failure (#1164).
- **Jest's main-process hooks must not be `.ts`.** `globalSetup`/`globalTeardown` (`test/jest-e2e-global-setup.js`, `test/jest-e2e-global-teardown.js`) are plain CJS `.js` on purpose: Jest loads them via `require()` in its main process, where ts-jest compiles `.ts` to CJS but Node loads it as ESM (`exports is not defined in ES module scope`).
- **`uuid` is shimmed in the e2e config only.** `test/jest-e2e.json` maps `^uuid$` to `test/__mocks__/uuid.cjs` (a `node:crypto.randomUUID` wrapper). uuid@14 is ESM-only and `exceljs` (CJS) does `require('uuid')`; when the full `AppModule` graph loads under Jest ESM, the CJS→ESM require cycle trips Jest's `ERR_REQUIRE_CYCLE_MODULE`. The unit suite is unaffected and uses the real package.
- **NestJS 12 packages are ESM-only and the app stays CommonJS** (Node 24 `require(esm)`; `engines: >=24.0.0`). Two landmines surface only at runtime, not in ts-jest or `type-check`:
  - A package whose `exports` map lacks a `require`/`default` condition cannot be bare-`require`d — `@nestjs/typeorm@12.0.0` was exactly this (`ERR_PACKAGE_PATH_NOT_EXPORTED` at boot); 12.0.1 added `default`, and the exact pin (now 12.0.2, which keeps it) must stay on a release that has it.
  - The Dockerfile pins `node:24.16.0-alpine3.23` — older 24.x lacks the `require(esm)` export-condition fallback that the import-only maps of the remaining packages need.
  `backend/scripts/verify-dist-runtime.sh` is the gate: it loads `dist/main.js` and now fails on both `MODULE_NOT_FOUND` and `ERR_PACKAGE_PATH_NOT_EXPORTED`. A bare `node dist/main.js` boot check remains the definitive test.

**E2E fixture leaks are detected only by the nightly leak check** (#1204). The
normal `npm run test:e2e` drops and recreates `erp_db_test` on every run, so a
suite that leaves rows behind is indistinguishable from one that cleans up
perfectly — that is how four real leaks passed every gate in PR #1203.

```bash
cd backend && npm run test:e2e:leakcheck            # reuse the retained database
cd backend && npm run test:e2e:leakcheck -- --fresh # rebuild and re-baseline
```

It runs the suites twice against a persistent `erp_db_leakcheck_test` and
asserts they restore a captured baseline. **Pass 2 is the point**: a suite whose
cleanup depends on a clean slate passes pass 1 and fails pass 2.

**The baseline is seeded, not migrated.** `admin` and `RETAIL` come from
`OnModuleInit` seeders (`users-seeder.service.ts`,
`price-lists-seeder.service.ts`), not from InitialSchema. After
`migration:run` both `users` and `price_lists` are **empty**; they hold one row
each only after the app boots. So `test/e2e-leakcheck-boot.ts` boots AppModule
once between migrations and baseline capture. Remove that step and the two
tables the gate is supposed to protect become its first false positives.

That boot entry lives in `test/`, never under `src/database/cli/` — see the
`tsconfig.cli.json` trap above.

**Reuse is rejected on two migration comparisons, not one.** Stored-vs-applied
compares the retained database to itself, so a newly pulled migration leaves it
green; only applied-vs-expected-by-checkout catches that. Both run before any
pass, and either mismatch requires `--fresh`.

**Findings are reported as baseline drift, never as suite ownership.** The
check compares database states and cannot know which suite wrote a row, so
every report lists the same three causes: a suite leaked, the runtime seeds
changed (re-run with `--fresh`), or the baseline was captured from an
already-drifted database.

**Every suite cleans its own request exhaust, not just its fixtures.**
`resetSuiteBusinessRows` covers business rows and `removeSuiteAdmin` covers
users (refresh tokens cascade), but every HTTP request also leaves
`audit_logs` rows (domain services log every mutation) and every global search
leaves a `search_queries` row. `test/utils/shared-e2e-traces-fixture.ts`
(`removeSuiteTraces`) deletes those scoped to the suite's own user/entity ids —
call it in `afterAll` before removing users. Scope to ids you own; never a bare
`username = 'admin'`, which is shared. A new suite that makes audited requests
and skips this turns the nightly gate red.

**Sampler tables are excluded, deliberately.** `redis_memory_samples` and
`redis_alert_state` are not captured or compared: the sampler writes a startup
sample in `onModuleInit` on every app boot under a per-boot instanceId (one row
per boot, +38/pass measured 2026-09-27), which no suite can prevent. That write
is not cron, so turning cron off in test apps (below) does not remove it.

**Cron does not run in e2e-booted apps** (#1311). `createScheduleOptions()`
(`config/schedule-options.factory.ts`) passes `cronJobs: false` to
`ScheduleModule.forRoot()` when `NODE_ENV` is exactly `test`, which both e2e
entry points export. Before this, every suite app registered all five `@Cron`
handlers, and the hourly backup cleanup's `getBackupSettings()` lazily INSERTed
a `backup_retention_settings` row at hh:00 — the gate's verdict depended on the
wall clock. (That read no longer writes: since #1312, `getBackupSettings()`
returns unpersisted defaults with `id`/`createdAt`/`updatedAt` null when no row
exists, and `updateBackupSettings()` is the only writer.) `test/cron-isolation.e2e-spec.ts` asserts a booted test app's
`SchedulerRegistry` holds no cron jobs. A test that needs a handler's behaviour
must call the handler method directly; never rely on the schedule firing.
BullMQ repeatable jobs are **not** covered: they are created from persisted
`backup_schedules` rows at boot but then execute on a time schedule in any
booted app's worker, independent of `ScheduleModule`.

They are **counted and reported, never diffed**. Every report ends with an
`ignored (sampler, not suite-attributable)` section giving each table's
baseline count, current count and signed delta — e.g.
`redis_memory_samples: baseline 1, now 55 (+54)`. The counts live in the
baseline's `excluded_counts` column (format version 2), which is why a delta is
available at all. Nothing there can turn the gate red; the section exists so a
green report still says out loud which tables went unchecked.

Two blind spots, both deliberate: value changes on rows whose primary keys
survive are invisible, and a seeder-code change surfaces mid-run as pass-1
drift rather than at the reuse check.

The gate is nightly and on-demand, **not** a required check — it runs the full
e2e suite twice.

**BullMQ and backup schedulers**: Before upgrading Redis clients or BullMQ, investigating scheduler warnings or reconciling orphaned entries, read [the scheduler runbook](docs/deployment/BULLMQ_SCHEDULER_RUNBOOK.md) for protocol pins, migration history and remediation safeguards.

**Bank Reconciliation**: Before changing reconciliation persistence, locking, conflicts or form drafts, read [the implementation invariants](docs/modules/accounting/BANK_RECONCILIATION_REFERENCE.md).

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `blur88/erp2` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/` (both created lazily). See `docs/agents/domain.md`.
