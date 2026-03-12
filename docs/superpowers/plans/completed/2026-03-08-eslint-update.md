# ESLint 10.0.2 → 10.0.3 Update Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bump `eslint` from `10.0.2` to `10.0.3` (exact pin) in both backend and frontend, and run `npm install` to update the lockfiles.

**Architecture:** Pure version bump — two `package.json` edits, two `npm install` runs. No ESLint config changes required; no breaking changes in 10.0.1→10.0.3 range. `@eslint/js` (frontend) stays at `10.0.1` — that package's latest is `10.0.1`.

**Tech Stack:** npm, ESLint 10.x, NestJS backend (Node), Vite/React frontend (Node)

---

### Task 1: Update backend package.json

**Files:**
- Modify: `backend/package.json:76`

**Step 1: Edit the version**

In `backend/package.json`, change:
```json
"eslint": "10.0.2",
```
to:
```json
"eslint": "10.0.3",
```

**Step 2: Run npm install**

```bash
cd /home/blur/erp2/backend && npm install
```

Expected: install completes, `eslint@10.0.3` resolved in `package-lock.json`.

**Step 3: Verify installed version**

```bash
cd /home/blur/erp2/backend && npx eslint --version
```

Expected output: `v10.0.3`

**Step 4: Run lint to confirm nothing broke**

```bash
cd /home/blur/erp2/backend && npm run lint
```

Expected: exits 0 (or same warnings as before — no new errors).

**Step 5: Commit**

```bash
cd /home/blur/erp2
git add backend/package.json backend/package-lock.json
git commit -m "chore: bump eslint to 10.0.3 in backend"
```

---

### Task 2: Update frontend package.json

**Files:**
- Modify: `frontend/package.json:59`

**Step 1: Edit the version**

In `frontend/package.json`, change:
```json
"eslint": "10.0.2",
```
to:
```json
"eslint": "10.0.3",
```

**Step 2: Run npm install**

```bash
cd /home/blur/erp2/frontend && npm install
```

Expected: install completes, `eslint@10.0.3` resolved in `package-lock.json`.

**Step 3: Verify installed version**

```bash
cd /home/blur/erp2/frontend && npx eslint --version
```

Expected output: `v10.0.3`

**Step 4: Run lint to confirm nothing broke**

```bash
cd /home/blur/erp2/frontend && npm run lint
```

Expected: exits 0 (or same warnings as before — no new errors).

**Step 5: Commit**

```bash
cd /home/blur/erp2
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: bump eslint to 10.0.3 in frontend"
```
