# @mui/x-date-pickers v8 + date-fns v4 Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade `@mui/x-date-pickers` from `7.29.4` to `8.27.2` and `date-fns` from `2.30.0` to `4.1.0` in the frontend.

**Architecture:** Bump both packages in `package.json`, reinstall, run the MUI v8 preset-safe codemod as a precaution, then verify with type-check and tests. No application-level API changes are expected — the `date-fns` functions used in the codebase are identical across v2/v3/v4, and `AdapterDateFns` keeps its name when using `date-fns@v4`.

**Tech Stack:** React 19, `@mui/x-date-pickers`, `date-fns`, `@mui/x-codemod`, Vitest, TypeScript

---

### Task 1: Bump package versions

**Files:**
- Modify: `frontend/package.json`

**Step 1: Update `@mui/x-date-pickers` and `date-fns` versions**

In `frontend/package.json`, change:
```json
"@mui/x-date-pickers": "^7.29.4",
"date-fns": "^2.30.0",
```
to:
```json
"@mui/x-date-pickers": "8.27.2",
"date-fns": "4.1.0",
```

**Step 2: Install updated dependencies**

```bash
cd frontend && npm install
```

Expected: install completes with no peer dependency errors. Verify:
```bash
cd frontend && npm ls @mui/x-date-pickers date-fns --depth=0
```
Expected output shows `@mui/x-date-pickers@8.27.2` and `date-fns@4.1.0`.

**Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore(deps): upgrade @mui/x-date-pickers to 8.27.2 and date-fns to 4.1.0"
```

---

### Task 2: Run MUI v8 preset-safe codemod

**Files:**
- Possibly modify: `frontend/src/main.tsx` and any other files the codemod touches

**Step 1: Run the pickers preset-safe codemod**

```bash
cd frontend && npx @mui/x-codemod@latest v8.0.0/pickers/preset-safe src/
```

Expected: The codemod runs and reports any transforms applied. Most likely no changes are needed since:
- The project uses `date-fns@v4` (not v2), so `AdapterDateFns` keeps its name
- No renamed type imports (`usePickersTranslations`, `FieldValueType`, etc.) are used in this codebase

If the codemod makes changes, review them with `git diff`.

**Step 2: If changes were made, commit them**

```bash
git add frontend/src/
git commit -m "chore: apply @mui/x-codemod v8 pickers preset-safe transforms"
```

If no changes: skip this step.

---

### Task 3: Type-check and test

**Step 1: Run TypeScript type-check**

```bash
cd frontend && npm run type-check
```

Expected: zero errors. If type errors appear, they will likely be in files that import from `date-fns` and use internal types that changed in v4. Fix any errors by updating type annotations to match the new signatures (the runtime API is unchanged).

**Step 2: Run the full frontend test suite**

```bash
cd frontend && npm run test
```

Expected: all tests pass. The test suite uses Vitest.

**Step 3: Commit if any fixes were required**

If type errors required code fixes:
```bash
git add frontend/src/
git commit -m "fix: update types for date-fns v4 compatibility"
```

---

### Task 4: Document the upgrade

**Files:**
- Create: `docs/plans/completed/2026-03-01-mui-x-date-pickers-v8-upgrade-design.md`

**Step 1: Write the design doc**

```markdown
# Design: @mui/x-date-pickers v8 + date-fns v4 Upgrade

**Date:** 2026-03-01

## Summary

Upgrade `@mui/x-date-pickers` from v7 to v8 and `date-fns` from v2 to v4.

## Key Findings

- `@mui/x-date-pickers@8.27.2` still supports `@mui/material@^7.x` — no MUI core upgrade required.
- `date-fns@4.x` is required to keep the `AdapterDateFns` import name in v8 (v2 would require renaming to `AdapterDateFnsV2`).
- `date-fns` function API (`format`, `formatDistanceToNow`, `startOfWeek`, etc.) is unchanged across v2/v3/v4.
- `chartjs-adapter-date-fns@3.0.0` supports `date-fns >= 2.0.0` — no change needed.
- Library is used in 1 file for provider setup (`src/main.tsx`) and 13 files for date formatting utilities.

## Breaking Changes (none affecting this codebase)

- date-fns v3/v4: ESM-first, flat package structure, internal TypeScript types changed.
- x-date-pickers v8: `AdapterDateFns` renamed to `AdapterDateFnsV2` for date-fns v2 users (not applicable here).
```

**Step 2: Commit**

```bash
git add docs/plans/completed/2026-03-01-mui-x-date-pickers-v8-upgrade-design.md
git commit -m "docs: add design doc for @mui/x-date-pickers v8 upgrade"
```
