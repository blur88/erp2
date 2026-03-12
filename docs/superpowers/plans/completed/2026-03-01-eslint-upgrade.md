# ESLint 10.0.2 Upgrade (Backend) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade the backend ESLint dependency from `^9.37.0` to the exact pin `10.0.2`, matching the frontend.

**Architecture:** Single `package.json` version string change followed by `npm install` to regenerate the lockfile. No config changes — `backend/eslint.config.mjs` already uses flat config format required by ESLint 10.

**Tech Stack:** Node 24, npm, ESLint 10.0.2, NestJS 11 backend.

---

### Task 1: Update ESLint version in backend/package.json

**Files:**
- Modify: `backend/package.json`

**Step 1: Open the file and locate the ESLint entry**

In `backend/package.json`, find this line under `devDependencies`:

```json
"eslint": "^9.37.0",
```

**Step 2: Change the version to an exact pin**

Replace it with:

```json
"eslint": "10.0.2",
```

(No caret — exact pin, matching frontend's `package.json`.)

**Step 3: Verify the diff looks right**

Run: `git diff backend/package.json`

Expected output shows only the `eslint` version line changing from `"^9.37.0"` to `"10.0.2"`. Nothing else should change.

---

### Task 2: Install the new version and update the lockfile

**Files:**
- Modify: `backend/package-lock.json` (generated)

**Step 1: Run npm install**

```bash
cd backend && npm install
```

Expected: npm resolves ESLint 10.0.2, updates `package-lock.json`. No errors. You may see a line like `added X packages, removed Y packages`.

**Step 2: Verify the installed version**

```bash
cd backend && node -e "console.log(require('./node_modules/eslint/package.json').version)"
```

Expected output: `10.0.2`

---

### Task 3: Verify lint still passes

**Step 1: Run the backend lint command**

```bash
cd backend && npm run lint
```

Expected: exits with code 0, no errors, no warnings about incompatible plugins.

**Step 2: If lint fails, check for peer dependency warnings**

```bash
cd backend && npm install 2>&1 | grep -i "peer\|warn\|error"
```

All current peer deps (`@typescript-eslint/eslint-plugin ^8.46.0`, `eslint-plugin-prettier ^5.0.0`, `eslint-config-prettier ^10.1.8`) declare ESLint 10 compatibility, so this should be clean.

---

### Task 4: Commit the changes

**Step 1: Stage the changed files**

```bash
cd /home/blur/erp2 && git add backend/package.json backend/package-lock.json
```

**Step 2: Commit**

```bash
git commit -m "chore(deps): upgrade backend eslint to 10.0.2"
```

Expected: commit succeeds, two files changed.

**Step 3: Verify**

```bash
git log --oneline -3
```

Expected: new commit appears at top.
