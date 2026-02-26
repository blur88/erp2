# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ERP system — NestJS 11 backend + React 18 / Material-UI v7 frontend, served via NGINX in Docker.

- **Databases**: PostgreSQL (TypeORM, primary), MongoDB (analytics/reports), Redis 8 (caching, queues, WebSocket state)
- **Queue**: Bull Queue (background jobs)
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

# Run all frontend tests
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

# Deploy
./deploy.sh          # start
./deploy.sh restart  # restart
./deploy.sh logs     # view logs
./deploy.sh status   # check status
```

## Architecture

**Active modules** (11): `AuthModule`, `UsersModule`, `InventoryModule`, `SalesModule`, `PurchasingModule`, `DashboardModule`, `SettingsModule`, `PrintSettingsModule`, `PriceListsModule`, `AuditLogsModule`, `BackupModule`

Reports are embedded in their business modules (Inventory, Sales, Purchasing) — there is no separate reports module.

**Non-obvious decisions:**
- `TypeScript strict: false` — use `as any` when TypeORM types resist
- DB uses `family: 4` (IPv4 force) and SSL disabled for Docker PostgreSQL compatibility
- Frontend environment variables injected at runtime via `window.__ENV__` (not build-time) so one Docker image works across environments
- Backend source changes require `docker compose build backend && docker compose up -d backend` — there is no volume mount for live reload in Docker
- All API responses go through `ApiService` which wraps them as `{ data: T, meta?: {...} }` — see Gotchas for access patterns

**Accounting module** (double-entry, auto-posting): 7 entities, full RBAC. View reports: all roles. Create/edit journal entries: Admin + Manager. Delete/manage fiscal periods: Admin only.

## Gotchas

**NestJS route order**: Specific routes (`/products/deleted`) MUST be declared before parameterized routes (`/products/:id`) in controllers, or NestJS will try to treat `"deleted"` as a UUID and fail.

**Soft delete**: Always use TypeORM's `softDelete(id)` method — it sets the `deletedAt` timestamp. Setting `isActive = false` manually does NOT set `deletedAt`, breaking `withDeleted` queries and the restore flow.

**API response structure**: Standard paginated list endpoints wrap items as `response.data.data` (items) and `response.data.meta` (pagination). Tree/hierarchy endpoints (categories, chart of accounts) return a flat array at `response.data` directly — no nested `.data.data`. Getting this wrong causes empty lists with no errors.

**Frontend Docker**: Changes to frontend source require a rebuild — `docker compose build frontend && docker compose up -d frontend`. The Vite dev server (`npm run dev`) is for local-only development.

**Accounting schema**: The `account_mappings.description` column required a manual `ALTER TABLE account_mappings ALTER COLUMN description DROP NOT NULL` — the entity marks it nullable but the DB was created with NOT NULL. If you see null-constraint errors on this table, the migration may not have run.

**Path aliases**: Frontend uses `@/` as alias for `src/`. Backend uses `@/*` → `src/*` and `@modules/*` → `src/modules/*`.
