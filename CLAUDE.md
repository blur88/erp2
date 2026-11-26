# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Project Overview

ERP system — NestJS 11 backend + React 19 / TypeScript 6 / Material-UI v9 frontend, served via NGINX in Docker.

- **Databases**: PostgreSQL 18 (TypeORM, primary), Redis 8.6 (BullMQ queue backing store). See [development Compose](docker-compose.yml) for exact image tags.
- **Queue**: BullMQ via `@nestjs/bullmq` (background jobs)
- **Default admin**: `admin / Admin@123!` — change on first login

## Key Commands

```bash
# Run all backend tests
cd backend && npm run test

# Run a single backend test file (path relative to backend/)
# NODE_OPTIONS is required — bare `npx jest` runs without vm-based ESM and
# every .ts file falls back to CommonJS. See the Jest ESM pointer under Gotchas.
cd backend && NODE_OPTIONS=--experimental-vm-modules npx jest src/path/to/file.spec.ts --no-coverage

# Run backend e2e tests
cd backend && npm run test:e2e

# Run all frontend tests (can be slow; do not assume the run is hung)
cd frontend && npm run test

# Run a single frontend test file (path relative to frontend/)
cd frontend && npx vitest run src/path/to/file.test.tsx

# Generate a DB migration (after changing entities)
cd backend && npm run migration:generate --name=DescriptiveName

# Run migrations
cd backend && npm run migration:run

# Revert last migration
cd backend && npm run migration:revert

# Maintenance menu (outdated deps, audit, knip, jscpd, docker rebuild)
./maintain.sh

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

## Gotchas

**NestJS route order**: Specific routes (`/products/deleted`) MUST be declared before parameterized routes (`/products/:id`) in controllers, or NestJS will try to treat `"deleted"` as a UUID and fail.

**Soft delete**: Always use TypeORM's `softDelete(id)` method — it sets the `deletedAt` timestamp. Setting `isActive = false` manually does NOT set `deletedAt`, breaking `withDeleted` queries and the restore flow.

**API response structure**: `ApiService` strips the Axios wrapper and returns the backend body directly. For paginated list endpoints the body is `{ data: T[], meta: {...} }` — access items as `response.data` and pagination as `response.meta`. For tree/hierarchy endpoints (categories, chart of accounts) the body is a plain array — access as `response` directly (no `.data`). Getting this wrong causes empty lists with no errors.

**Account lockout clock:** Lockout expiry (`User.isLocked`, the login check in `auth.service.ts`, and the `isLocked` filter/count in `users.service.ts`) is evaluated against the **Node container clock** (`new Date()`), never SQL `NOW()`. This keeps login and the user list using one clock so a skewed Postgres container clock can't disagree (issue #710). Docker container clocks can drift after host sleep/resume or container start; if a lockout seems wrong, run `docker compose restart backend` (or resync the host clock). Do not change these comparisons to SQL `NOW()`.

**Frontend Docker**: Changes to frontend source require a rebuild — `docker compose build frontend && docker compose up -d frontend`. The Vite dev server (`npm run dev`) is for local-only development.

**Printing is portal-only**: the transactional document dialogs (Sales/Purchase Orders, invoices) render through MUI portals **outside** `#root`, so `@media print { #root { display: none } }` (`styles/global.css`) is what isolates them — hiding the app shell leaves the portaled document alone on the page. That rule is unconditional and load-bearing for every print flow in the app; nothing renders a printable page *inside* `#root`.

The accounting reports (Profit & Loss, Balance Sheet, Form B) have **no print or export route**. Before changing print layout, styles, or coverage, read [the printing reference](docs/modules/PRINTING_REFERENCE.md).

**Statement styling**: Before changing Statement layout, theme styles or visual tests, read [the coverage limits, styling invariants and browser QA procedure](docs/modules/accounting/STATEMENT_THEME_QA.md).

**Path aliases**: Frontend uses `@/` as alias for `src/`. Backend uses `@/*` → `src/*`, `@modules/*` → `src/modules/*`, `@common/*` → `src/common/*`, `@config/*` → `src/config/*`, and `@database/*` → `src/database/*`.

TypeScript CLI scripts that directly or transitively import configured path aliases such as `@database/*` must preload `tsconfig-paths/register` in their npm script (for example, `ts-node -P tsconfig.json -r tsconfig-paths/register ...`). TypeScript type-checking resolves these aliases, but Node runtime loading does not.

`backup:reconcile-schedulers` needs this; `admin:create` does not, only because it uses relative imports throughout. The failure is runtime-only — it passes `npm run type-check` and surfaces as an unresolvable module when the script actually runs — and it arrives transitively, so a script whose own imports are all relative can still need the flag via what it pulls in.

**The same trap reaches the application bundle, and there it is fatal.** The Docker build runs two compilers in sequence:

```
npm run build                  # nest build — DOES rewrite path aliases
npx tsc -p tsconfig.cli.json   # plain tsc — does NOT rewrite them
```

Both write to `dist/`. `tsconfig.cli.json` includes `src/database/cli/**/*`, so **any `src/` file reachable from a CLI entrypoint gets recompiled by the second pass and overwrites `nest build`'s correct output**. If that file imports via `@database/*`, the alias survives verbatim into `dist/` and Node throws `MODULE_NOT_FOUND`. When the file is also in `app.module`'s require chain, the *entire backend crash-loops* — this took production down on 2026-08-15 via `orphaned-scheduler-reconciler.service.ts`, which `reconcile-schedulers.ts` imports transitively.

Nothing in the normal gate catches it: the source is valid TypeScript, `npm run type-check` passes, and `npm run test` transpiles from `src/` with alias resolution. Only the built artifact is wrong. `backend/scripts/verify-dist-runtime.sh` (`npm run verify:dist`) is the gate — it scans `dist/` for surviving aliases and then loads `dist/main.js` to prove the require graph resolves. It runs inside the Dockerfile after the CLI compile, so a corrupt image fails the build instead of shipping.

<a name="cli-relative-imports"></a>

Rule: **files reachable from `tsconfig.cli.json`'s `include` must use relative imports, never path aliases.** Check reach with `npx tsc -p tsconfig.cli.json --noEmit --listFiles`.

**Dead-code sweeps**: `maintain.sh do_knip()` wraps `npx knip` in `|| true`, so it always exits 0 and cannot be used as a gate — run `npx knip` directly per directory when you need pass/fail. Knip also reports false positives for backend service methods called by a *sibling service* rather than an HTTP route; grep the method name across `backend/src` before deleting anything.

**Migration baseline**: the chain starts from a single `InitialSchema` genesis migration (#950). `npm run migration:run` works against an empty database, so a new migration can be validated end-to-end locally. Migration failure is fatal — there is no `schema:sync` fallback in the entrypoint or E2E setup. Verify a schema change with `backend/scripts/verify-baseline.sh` and `backend/scripts/verify-seeds.sh`.

**Redis operations**: Before adding Redis-backed caching or sessions, changing queue Redis policy, memory sizing or monitoring, or deploying Redis changes, read [the Redis operator runbook](docs/deployment/REDIS_MEMORY_PRESSURE_RUNBOOK.md) for rollout gates and evidence limits.

**Jest ESM**: Before changing backend Jest configuration or troubleshooting module loading in Jest, read [Backend Jest ESM](docs/testing/backend-jest-esm.md).

**E2E fixture leak check**: Before changing an E2E suite, its cleanup, or the leak-check files (`verify-e2e-cleanup.sh`, `e2e-leakcheck-boot.ts`, `e2e-leakcheck.yml`, or `verify-e2e-cleanup.bats`), read [E2E fixture leak check](docs/testing/e2e-leak-check.md).

**BullMQ and backup schedulers**: Before upgrading Redis clients or BullMQ, investigating scheduler warnings or reconciling orphaned entries, read [the scheduler runbook](docs/deployment/BULLMQ_SCHEDULER_RUNBOOK.md) for protocol pins, migration history and remediation safeguards.

**Bank Reconciliation**: Before changing reconciliation persistence, locking, conflicts or form drafts, read [the implementation invariants](docs/modules/accounting/BANK_RECONCILIATION_REFERENCE.md).

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `blur88/erp2` via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one root `GLOSSARY.md` plus `docs/adr/` (both created lazily). See `docs/agents/domain.md`.
