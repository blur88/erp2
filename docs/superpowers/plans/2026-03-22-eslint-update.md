# ESLint 10.1.0 Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bump ESLint to 10.1.0 in backend and frontend, and align @eslint/js to 10.1.0 in frontend.

**Architecture:** Direct edits to `package.json` files followed by `npm install` to regenerate lock files. No config changes required — this is a patch-level tooling bump.

**Tech Stack:** ESLint 10.1.0, @eslint/js 10.1.0, npm

---

### Task 1: Update backend ESLint

**Files:**
- Modify: `backend/package.json`
- Modify: `backend/package-lock.json` (via npm install)

- [ ] **Step 1: Edit backend/package.json**

Change `"eslint": "10.0.3"` to `"eslint": "10.1.0"` in the `devDependencies` section.

- [ ] **Step 2: Run npm install in backend**

```bash
cd backend && npm install
```

Expected: Lock file updated, no errors.

- [ ] **Step 3: Verify lint passes (read-only check first)**

```bash
cd backend && npx eslint "{src,apps,libs,test}/**/*.ts"
```

Expected: No errors. If this passes, run the full script:

```bash
npm run lint
```

Note: the backend lint script includes `--fix`, which auto-modifies source files. After running it, check for unexpected changes:

```bash
git diff --name-only backend/src backend/test
```

Expected: No files listed. If any `.ts` files appear, review them and commit separately before continuing.

- [ ] **Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(deps): update eslint to 10.1.0 in backend"
```

---

### Task 2: Update frontend ESLint and @eslint/js

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json` (via npm install)

- [ ] **Step 1: Edit frontend/package.json**

Make two changes in the `devDependencies` section:
- `"eslint": "10.0.3"` → `"eslint": "10.1.0"`
- `"@eslint/js": "10.0.1"` → `"@eslint/js": "10.1.0"`

- [ ] **Step 2: Run npm install in frontend**

```bash
cd frontend && npm install
```

Expected: Lock file updated, no errors.

- [ ] **Step 3: Verify lint passes**

```bash
cd frontend && npm run lint
```

Expected: No errors, exit code 0 (frontend lint uses `--max-warnings 0`).

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(deps): update eslint and @eslint/js to 10.1.0 in frontend"
```
