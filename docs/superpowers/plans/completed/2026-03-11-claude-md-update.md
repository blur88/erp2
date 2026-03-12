# CLAUDE.md Update Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update CLAUDE.md to reflect current project state and fix a tsconfig.json bug that incorrectly excludes PurchasingModule.

**Architecture:** Two commits — first fix the tsconfig bug, then update the docs. No tests needed for docs changes; the tsconfig fix is verified by confirming the backend still builds.

**Tech Stack:** NestJS 11, React 19, TypeScript, git

---

## Chunk 1: tsconfig fix + CLAUDE.md update

### Task 1: Fix backend/tsconfig.json

**Files:**
- Modify: `backend/tsconfig.json`

- [ ] **Step 1: Remove purchasing exclusion**

Edit `backend/tsconfig.json`. Change:
```json
"exclude": [
  "src/modules/reports/**/*",
  "src/modules/purchasing/**/*"
]
```
To:
```json
"exclude": [
  "src/modules/reports/**/*"
]
```

- [ ] **Step 2: Verify backend still builds**

```bash
cd backend && npm run build
```
Expected: `webpack compiled successfully`

- [ ] **Step 3: Commit**

```bash
git add backend/tsconfig.json
git commit -m "fix(backend): remove purchasing module from tsconfig exclude"
```

---

### Task 2: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update React version in Project Overview**

In `CLAUDE.md`, find:
```
ERP system — NestJS 11 backend + React 18 / Material-UI v7 frontend, served via NGINX in Docker.
```
Replace with:
```
ERP system — NestJS 11 backend + React 19 / Material-UI v7 frontend, served via NGINX in Docker.
```

- [ ] **Step 2: Update database versions**

Find:
```
- **Databases**: PostgreSQL (TypeORM, primary), Redis 8 (caching, queues, WebSocket state)
```
Replace with:
```
- **Databases**: PostgreSQL 18.3 (TypeORM, primary), Redis 8.6 (caching, queues, WebSocket state)
```

- [ ] **Step 3: Add RTK Query bullet to Architecture**

Find the Non-obvious decisions section. After the bullet:
```
- All API responses go through `ApiService` which wraps them as `{ data: T, meta?: {...} }` — see Gotchas for access patterns
```
Add:
```
- Frontend API calls use RTK Query (`frontend/src/store/api/`); `ApiService` (Axios) is the underlying transport layer
```

- [ ] **Step 4: Remove stale account_mappings gotcha**

Find and remove the entire paragraph:
```
**Accounting schema**: The `account_mappings.description` column required a manual `ALTER TABLE account_mappings ALTER COLUMN description DROP NOT NULL` — the entity marks it nullable but the DB was created with NOT NULL. If you see null-constraint errors on this table, the migration may not have run.
```

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with current project state (closes #69)"
```
