# @types/node v24.11.0 Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Update `@types/node` to `^24.11.0` in both frontend and backend, and fix the two frontend files using the incorrect `NodeJS.Timeout` type.

**Architecture:** Three independent changes — update two `package.json` specifiers, fix two TypeScript files that use `NodeJS.Timeout` (a server-side type) in browser code, then verify with installs and test runs.

**Tech Stack:** npm, TypeScript 5.9, Vitest (frontend tests), Jest (backend tests)

**Design doc:** `docs/plans/2026-02-28-types-node-v24-upgrade-design.md`

---

### Task 1: Fix `NodeJS.Timeout` in `useIdleTimer.ts`

**Files:**
- Modify: `frontend/src/hooks/useIdleTimer.ts:88-90`

**Step 1: Read the current file around lines 88–90**

```bash
cd /home/blur/erp2
sed -n '85,95p' frontend/src/hooks/useIdleTimer.ts
```

**Step 2: Replace the three `NodeJS.Timeout` annotations**

Change:
```typescript
const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
const timeoutTimerRef = useRef<NodeJS.Timeout | null>(null);
const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
```

To:
```typescript
const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const timeoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
const countdownIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
```

**Step 3: Commit**

```bash
git add frontend/src/hooks/useIdleTimer.ts
git commit -m "fix: replace NodeJS.Timeout with ReturnType<typeof setTimeout> in useIdleTimer"
```

---

### Task 2: Fix `NodeJS.Timeout` in `CustomersPage.tsx`

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx:216`

**Step 1: Read the current file around line 216**

```bash
sed -n '213,220p' frontend/src/pages/sales/CustomersPage.tsx
```

**Step 2: Replace the `NodeJS.Timeout` annotation**

Change:
```typescript
let timeoutId: NodeJS.Timeout;
```

To:
```typescript
let timeoutId: ReturnType<typeof setTimeout>;
```

**Step 3: Commit**

```bash
git add frontend/src/pages/sales/CustomersPage.tsx
git commit -m "fix: replace NodeJS.Timeout with ReturnType<typeof setTimeout> in CustomersPage"
```

---

### Task 3: Update `@types/node` in frontend `package.json`

**Files:**
- Modify: `frontend/package.json`

**Step 1: Update the specifier**

In `frontend/package.json`, change:
```json
"@types/node": "^20.10.4",
```
To:
```json
"@types/node": "^24.11.0",
```

**Step 2: Install**

```bash
cd /home/blur/erp2/frontend && npm install
```

Expected: installs `@types/node@24.11.0`, no errors.

**Step 3: Run type-check**

```bash
cd /home/blur/erp2/frontend && npm run type-check
```

Expected: exits 0 with no errors.

**Step 4: Run frontend tests**

```bash
cd /home/blur/erp2/frontend && npm run test
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: upgrade @types/node from ^20.10.4 to ^24.11.0 in frontend"
```

---

### Task 4: Update `@types/node` in backend `package.json`

**Files:**
- Modify: `backend/package.json`

**Step 1: Update the specifier**

In `backend/package.json`, change:
```json
"@types/node": "^24.7.0",
```
To:
```json
"@types/node": "^24.11.0",
```

**Step 2: Install**

```bash
cd /home/blur/erp2/backend && npm install
```

Expected: installs `@types/node@24.11.0`, no errors.

**Step 3: Run backend tests**

```bash
cd /home/blur/erp2/backend && npm run test
```

Expected: all tests pass.

**Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore: upgrade @types/node from ^24.7.0 to ^24.11.0 in backend"
```
