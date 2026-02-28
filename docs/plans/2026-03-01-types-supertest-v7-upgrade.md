# @types/supertest v7.2.0 Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade `@types/supertest` from `^6.0.3` to `^7.2.0` and verify no TypeScript type errors are introduced.

**Architecture:** The v7.2.0 release is purely additive — it adds cookie assertion type definitions (`CustomAssertionCookie`) matching the `expect-cookies` functionality merged into supertest v7.2. All existing type signatures (`SuperTest`, `Test`, `Agent`, `Response`, `Request`) are unchanged. No test file edits are expected.

**Tech Stack:** Node.js, TypeScript, Jest, NestJS, supertest

---

### Task 1: Bump the version in package.json

**Files:**
- Modify: `backend/package.json` (line 73)

**Step 1: Update the version specifier**

In `backend/package.json`, change:
```json
"@types/supertest": "^6.0.3",
```
to:
```json
"@types/supertest": "^7.2.0",
```

**Step 2: Install the updated package**

```bash
cd backend && npm install
```

Expected output: `added X packages` or `changed 1 package` — no errors.

**Step 3: Verify installed version**

```bash
cd backend && npm list @types/supertest
```

Expected output: `@types/supertest@7.2.0`

---

### Task 2: Run TypeScript type-check on all test files

**Files:**
- Read: `backend/test/auth.e2e-spec.ts`
- Read: `backend/test/e2e/account-mappings.e2e-spec.ts`
- Read: `backend/test/e2e/accounting-auto-posting.e2e-spec.ts`
- Read: `backend/test/e2e/price-lists.e2e-spec.ts`

**Step 1: Run TypeScript check on the backend**

```bash
cd backend && npx tsc --noEmit
```

Expected: exits with code 0, no errors printed.

**Step 2: If errors appear — assess and fix**

The only likely error would be if new peer dependencies are required. Check:
```bash
cd backend && npm show @types/supertest peerDependencies
```

If `@types/cookies` or similar is listed, install it:
```bash
cd backend && npm install --save-dev <missing-package>
```

Then re-run `npx tsc --noEmit` until clean.

---

### Task 3: Run the e2e test suite to confirm no runtime breakage

**Step 1: Run the e2e tests (jest-e2e config)**

```bash
cd backend && npx jest --config ./test/jest-e2e.json --no-coverage
```

> Note: E2E tests require a running PostgreSQL database. If the DB is not available, skip to Step 2 (unit tests only).

Expected: all tests pass, no TypeScript compilation errors in output.

**Step 2: Run unit tests as a sanity check**

```bash
cd backend && npm run test
```

Expected: all tests pass.

---

### Task 4: Commit the change

**Step 1: Stage and commit**

```bash
cd backend && git add package.json package-lock.json
git commit -m "chore(deps): upgrade @types/supertest from ^6.0.3 to ^7.2.0"
```

Expected: commit succeeds, no pre-commit hook failures.
