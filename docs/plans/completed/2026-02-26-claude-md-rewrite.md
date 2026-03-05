# CLAUDE.md Rewrite Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rewrite CLAUDE.md from 865 lines to ~100 lines following Anthropic's best practices — keeping only what Claude cannot infer from reading the code.

**Architecture:** Single file rewrite. No imports. No split. The new file contains: stack overview, key commands (with single-test patterns), non-obvious architecture decisions, active module list, and gotchas that cause real bugs.

**Tech Stack:** Markdown only. No code changes.

---

## The Test for Every Line

Before including anything, ask: *"Would removing this cause Claude to make mistakes?"*

- API endpoint lists → NO (Claude can read the controller files)
- Recent changes timeline → NO (Claude can run `git log`)
- SQL schema blocks → NO (Claude can read entity files)
- Code pattern examples → NO (Claude can read existing code)
- NestJS route order gotcha → YES (causes actual bugs without this)
- Docker rebuild requirement → YES (causes confusion without this)

---

### Task 1: Write the new CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (full rewrite)

**Step 1: Confirm the current line count**

```bash
wc -l CLAUDE.md
```

Expected: 865 (or similar)

**Step 2: Replace the entire file with the new content**

Write the following as the complete new `CLAUDE.md`:

```markdown
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

# Run a single backend test file
cd backend && npx jest path/to/file.spec.ts --no-coverage

# Run all frontend tests
cd frontend && npm run test

# Run a single frontend test file
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
- All API responses are wrapped by `ApiService` as `{ data: T, meta?: {...} }` — access `response.data` (not `response.data.data`)

**Accounting module** (double-entry, auto-posting): 7 entities, full RBAC. View reports: all roles. Create/edit journal entries: Admin + Manager. Delete/manage fiscal periods: Admin only.

## Gotchas

**NestJS route order**: Specific routes (`/products/deleted`) MUST be declared before parameterized routes (`/products/:id`) in controllers, or NestJS will try to treat `"deleted"` as a UUID and fail.

**Soft delete**: Always use TypeORM's `softDelete(id)` method — it sets the `deletedAt` timestamp. Setting `isActive = false` manually does NOT set `deletedAt`, breaking `withDeleted` queries and the restore flow.

**API tree responses**: Category/account hierarchy endpoints return `{ data: Item[], meta }` — access items as `response.data` directly, not `response.data.data`. Other list endpoints use `response.data.data`.

**Frontend Docker**: Changes to frontend source require a rebuild — `docker compose build frontend && docker compose up -d frontend`. The Vite dev server (`npm run dev`) is for local-only development.

**Accounting schema**: The `account_mappings.description` column required a manual `ALTER TABLE account_mappings ALTER COLUMN description DROP NOT NULL` — the entity marks it nullable but the DB was created with NOT NULL. If you see null-constraint errors on this table, the migration may not have run.

**Path aliases**: Frontend uses `@/` as alias for `src/`. Backend uses `@/*` → `src/*` and `@modules/*` → `src/modules/*`.
```

**Step 3: Verify the line count is under 120**

```bash
wc -l CLAUDE.md
```

Expected: Under 120 lines.

**Step 4: Verify no obviously missing critical info**

Read through the file and confirm:
- All `npm run` commands are present
- Single-test commands are present
- Docker rebuild note is present
- Route order gotcha is present

**Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: rewrite CLAUDE.md to ~100 lines per Anthropic best practices

Removes 750+ lines of API endpoint lists, changelog history, SQL schemas,
code patterns, and file descriptions that Claude can infer from reading code.
Keeps only commands, non-obvious architecture decisions, and bug-causing gotchas."
```

---

## Done

The new CLAUDE.md should be under 120 lines and contain only information that would cause Claude to make mistakes if omitted.
