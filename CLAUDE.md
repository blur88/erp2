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

- Backend `src/**`: `cd backend && npm run lint && npm run test`
- Backend entities/migrations: also `npm run migration:run && npm run test:e2e`
- Frontend `src/**`: `cd frontend && npm run lint && npm run type-check && npm run test` (full suite required even for one-line changes)
- Cross-app DTO/interface changes: both backend and frontend suites

## Gotchas

**NestJS route order**: Specific routes (`/products/deleted`) MUST be declared before parameterized routes (`/products/:id`) in controllers, or NestJS will try to treat `"deleted"` as a UUID and fail.

**Soft delete**: Always use TypeORM's `softDelete(id)` method — it sets the `deletedAt` timestamp. Setting `isActive = false` manually does NOT set `deletedAt`, breaking `withDeleted` queries and the restore flow.

**API response structure**: `ApiService` strips the Axios wrapper and returns the backend body directly. For paginated list endpoints the body is `{ data: T[], meta: {...} }` — access items as `response.data` and pagination as `response.meta`. For tree/hierarchy endpoints (categories, chart of accounts) the body is a plain array — access as `response` directly (no `.data`). Getting this wrong causes empty lists with no errors.

**Account lockout clock:** Lockout expiry (`User.isLocked`, the login check in `auth.service.ts`, and the `isLocked` filter/count in `users.service.ts`) is evaluated against the **Node container clock** (`new Date()`), never SQL `NOW()`. This keeps login and the user list using one clock so a skewed Postgres container clock can't disagree (issue #710). Docker container clocks can drift after host sleep/resume or container start; if a lockout seems wrong, run `docker compose restart backend` (or resync the host clock). Do not change these comparisons to SQL `NOW()`.

**Frontend Docker**: Changes to frontend source require a rebuild — `docker compose build frontend && docker compose up -d frontend`. The Vite dev server (`npm run dev`) is for local-only development.

**Path aliases**: Frontend uses `@/` as alias for `src/`. Backend uses `@/*` → `src/*` and `@modules/*` → `src/modules/*`.

**Dead-code sweeps**: `maintain.sh do_knip()` wraps `npx knip` in `|| true`, so it always exits 0 and cannot be used as a gate — run `npx knip` directly per directory when you need pass/fail. Knip also reports false positives for backend service methods called by a *sibling service* rather than an HTTP route; grep the method name across `backend/src` before deleting anything.

**Migrations can't be tested from an empty DB**: the dev database's `migrations` table is empty because the schema is built by `schema:sync`. The migration chain breaks at the second migration when run from scratch, so a new migration cannot be validated end-to-end with `migration:run` locally. Validate by inspection plus querying the live `pg_tables` / `pg_type`.

**Pulling main**: Always use `git pull --ff-only` on `main` (or set globally: `git config --global pull.ff only`). A regular `git pull` with `merge.ff = false` creates a merge commit that re-triggers the Release workflow unnecessarily.
