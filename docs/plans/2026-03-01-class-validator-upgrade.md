# class-validator Upgrade to ^0.15.1 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bump `class-validator` from `^0.14.0` to `^0.15.1` in the backend package.json and verify nothing breaks.

**Architecture:** Single dependency version change in `backend/package.json`; `npm install` regenerates the lock file; full test suite confirms no regressions.

**Tech Stack:** NestJS 11, class-validator 0.15.1, Jest (backend tests)

---

### Task 1: Update package.json

**Files:**
- Modify: `backend/package.json` (line 48 — `"class-validator"` entry)

**Step 1: Edit the version specifier**

In `backend/package.json`, change:
```json
"class-validator": "^0.14.0",
```
to:
```json
"class-validator": "^0.15.1",
```

**Step 2: Verify the edit**

Run: `grep class-validator backend/package.json`
Expected output contains: `"class-validator": "^0.15.1"`

---

### Task 2: Install the new version

**Files:**
- Modify: `backend/package-lock.json` (auto-generated)

**Step 1: Run npm install**

```bash
cd backend && npm install
```
Expected: installs without errors; output includes `class-validator@0.15.1`

**Step 2: Confirm installed version**

```bash
cd backend && npm list class-validator
```
Expected output includes: `class-validator@0.15.1`

---

### Task 3: Run the test suite

**Step 1: Run all backend tests**

```bash
cd backend && npm run test
```
Expected: all tests pass, zero new failures.

**Step 2: If any test fails**

- Check the error message. Likely causes:
  - A decorator import that changed name (check [CHANGELOG](https://github.com/typestack/class-validator/releases/tag/v0.15.0))
  - Type mismatch caught by stricter validation
- Fix the failing DTO/entity file, re-run tests until green.

---

### Task 4: Commit

**Step 1: Stage changed files**

```bash
git add backend/package.json backend/package-lock.json
```

**Step 2: Commit**

```bash
git commit -m "chore(deps): upgrade class-validator to ^0.15.1"
```

Expected: clean commit with only `backend/package.json` and `backend/package-lock.json` changed.

---

## Notes

- No application code changes are expected — the one breaking change in 0.15.0 (`IsIBAN` requiring `IsIBANOptions`) is not used in this codebase.
- `@IsUUID()` and `@IsUUID(4)` usages (31 files) remain valid; the new UUID options are purely additive.
- Frontend is unaffected — `class-validator` is a backend-only dependency.
