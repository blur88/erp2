# Issue #377 Dependency Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bump `typescript`, `@mui/x-date-pickers`, and `eslint-plugin-react-hooks` to their latest stable versions in backend and frontend.

**Architecture:** Edit package.json files directly, run `npm install` to regenerate lock files, then verify with build/lint/test commands. No code changes required.

**Tech Stack:** Node.js / npm, TypeScript 6.0.3, MUI X Date Pickers 9.0.2, eslint-plugin-react-hooks 7.1.0

---

### Task 1: Create feature branch

**Files:**
- No file changes

- [ ] **Step 1: Create and switch to feature branch**

```bash
git checkout -b feat/issue-377-dep-update
```

Expected: `Switched to a new branch 'feat/issue-377-dep-update'`

---

### Task 2: Bump backend TypeScript

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Update typescript version in backend/package.json**

Open `backend/package.json`. Find the `devDependencies` (or `dependencies`) entry:

```json
"typescript": "6.0.2"
```

Change it to:

```json
"typescript": "6.0.3"
```

- [ ] **Step 2: Run npm install in backend**

```bash
cd backend && npm install
```

Expected: lock file updated, no errors. Any `found N vulnerabilities` warnings are pre-existing and can be ignored.

- [ ] **Step 3: Verify backend build passes**

```bash
cd backend && npm run build
```

Expected: exits 0, `dist/` directory updated, no TypeScript errors.

- [ ] **Step 4: Verify backend lint passes**

```bash
cd backend && npm run lint
```

Expected: exits 0, no new lint errors.

- [ ] **Step 5: Verify backend tests pass**

```bash
cd backend && npm run test
```

Expected: all tests pass. If a test was already failing before this change, note it but do not fix it here.

- [ ] **Step 6: Commit**

```bash
cd backend
git add package.json package-lock.json
git commit -m "chore(deps): bump typescript 6.0.2 → 6.0.3 in backend"
```

---

### Task 3: Bump frontend dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Update three versions in frontend/package.json**

Open `frontend/package.json`. Make these three changes:

Change:
```json
"typescript": "6.0.2"
```
To:
```json
"typescript": "6.0.3"
```

Change:
```json
"@mui/x-date-pickers": "9.0.0"
```
To:
```json
"@mui/x-date-pickers": "9.0.2"
```

Change:
```json
"eslint-plugin-react-hooks": "7.1.0-canary-98ce535f-20260226"
```
To:
```json
"eslint-plugin-react-hooks": "7.1.0"
```

- [ ] **Step 2: Run npm install in frontend**

```bash
cd frontend && npm install
```

Expected: lock file updated, no errors.

- [ ] **Step 3: Verify frontend type-check passes**

```bash
cd frontend && npm run type-check
```

Expected: exits 0, no TypeScript errors.

- [ ] **Step 4: Verify frontend lint passes**

```bash
cd frontend && npm run lint
```

Expected: exits 0, no new lint errors.

- [ ] **Step 5: Commit**

```bash
cd frontend
git add package.json package-lock.json
git commit -m "chore(deps): bump typescript 6.0.3, @mui/x-date-pickers 9.0.2, eslint-plugin-react-hooks 7.1.0 in frontend"
```

---

### Task 4: Manual spot-check and PR

**Files:**
- No file changes

- [ ] **Step 1: Start the app**

```bash
cd /home/blur/erp2 && docker compose up -d
```

Expected: all containers start. Check with `docker compose ps` — all should show `Up`.

- [ ] **Step 2: Open a date picker in the UI**

Navigate to any view that shows a date picker (e.g., Sales → create/edit an order, or Purchasing → create/edit a purchase order). Click the date field to open the picker.

Verify:
- Focus transitions smoothly into the picker with no spurious blur/focus events
- AM/PM toggle works correctly if visible
- Closing the picker returns focus cleanly

- [ ] **Step 3: Open a PR**

```bash
gh pr create \
  --title "chore(deps): update @mui/x-date-pickers, eslint-plugin-react-hooks, typescript" \
  --body "$(cat <<'EOF'
## Summary

- `typescript` 6.0.2 → 6.0.3 (backend + frontend)
- `@mui/x-date-pickers` 9.0.0 → 9.0.2 (frontend)
- `eslint-plugin-react-hooks` 7.1.0-canary-98ce535f-20260226 → 7.1.0 (frontend)

## Verification

- [x] Backend: build, lint, tests pass
- [x] Frontend: type-check, lint pass
- [x] Manual spot-check: date picker focus/blur and AM/PM verified

Closes #377
EOF
)"
```

Expected: PR URL printed to terminal.
