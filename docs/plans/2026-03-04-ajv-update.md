# AJV Update to 8.18.0 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Pin AJV to `8.18.0` in the backend via npm overrides to ensure all transitive consumers use the latest version.

**Architecture:** Add a single entry to the existing `overrides` block in `backend/package.json`, then regenerate `package-lock.json` with `npm install`. No source code changes needed.

**Tech Stack:** npm, Node.js

---

### Task 1: Add AJV override to backend/package.json

**Files:**
- Modify: `backend/package.json` (overrides block, lines 89-95)

**Step 1: Add the override**

In `backend/package.json`, locate the `overrides` block:

```json
"overrides": {
  "glob": "11.1.0",
  "body-parser": "2.2.1",
  "tar": "7.5.4",
  "js-yaml": "4.1.1",
  "qs": "6.14.2"
},
```

Add `"ajv": "8.18.0"` so it becomes:

```json
"overrides": {
  "glob": "11.1.0",
  "body-parser": "2.2.1",
  "tar": "7.5.4",
  "js-yaml": "4.1.1",
  "qs": "6.14.2",
  "ajv": "8.18.0"
},
```

**Step 2: Run npm install to update the lockfile**

```bash
cd backend && npm install
```

Expected: no errors; `package-lock.json` updated.

**Step 3: Verify the installed version**

```bash
node -e "console.log(require('./backend/node_modules/ajv/package.json').version)"
```

Expected output: `8.18.0`

**Step 4: Commit**

```bash
git add backend/package.json backend/package-lock.json
git commit -m "chore(deps): pin ajv to 8.18.0 in backend overrides"
```
