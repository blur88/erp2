# Test Runner Progress Bars Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add visual progress feedback to the frontend (Vitest) and backend (Jest) test runners for interactive terminal sessions, while preserving clean output in non-TTY/CI environments.

**Architecture:** Two independent config-only changes — remove `--reporter=dot` from the Vitest test script, and install `jest-progress-bar-reporter` + add a `reporters` array to the Jest config in `backend/package.json`. No application code changes. No new test scripts. Existing workflows are unaffected.

**Tech Stack:** Vitest (frontend), Jest (backend), `jest-progress-bar-reporter` npm package

**Spec:** `docs/superpowers/specs/2026-03-24-test-progress-bars-design.md`

---

### Task 1: Frontend — restore Vitest default reporter

> This is a config change only. No unit tests to write — validation is observing terminal output.

**Files:**
- Modify: `frontend/package.json` (the `test` script)

- [ ] **Step 1: Make the change**

In `frontend/package.json`, find the `test` script and remove `--reporter=dot`:

```json
"test": "vitest --run"
```

The full scripts block will look like:
```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "lint": "eslint . --max-warnings 0",
  "preview": "vite preview",
  "test": "vitest --run",
  "test:watch": "vitest",
  "test:ui": "vitest --ui",
  "test:coverage": "vitest --coverage",
  "type-check": "tsc --noEmit"
}
```

- [ ] **Step 2: Validate in interactive terminal**

Run from `frontend/`:
```bash
npm test
```

Expected: Vitest renders its default reporter — a progress bar or spinner as tests run, followed by a pass/fail summary with file names and counts. NOT just dots.

- [ ] **Step 3: Validate non-TTY output (required — CI hard constraint)**

Run from `frontend/`:
```bash
npm test | cat
```

Expected: Clean readable text output. No ANSI escape codes visible as raw characters (no `\u001b[` sequences, no garbled color codes). Test results and pass/fail summary should be human-readable.

- [ ] **Step 4: Commit**

```bash
cd frontend
git add package.json
git commit -m "feat(dx): restore vitest default reporter, remove --reporter=dot"
```

---

### Task 2: Backend — add jest-progress-bar-reporter

> This is a config-only change. No unit tests to write — validation is observing terminal output.

**Files:**
- Modify: `backend/package.json` (add `jest-progress-bar-reporter` to `devDependencies` and `reporters` to the `jest` block)
- Modify: `backend/package-lock.json` (updated automatically by npm install)

- [ ] **Step 1: Install the package**

Run from `backend/`:
```bash
npm install --save-dev jest-progress-bar-reporter
```

Expected: Package added to `devDependencies` in `backend/package.json` and `package-lock.json` updated. No errors.

- [ ] **Step 2: Add reporters to the jest config**

In `backend/package.json`, find the `"jest"` block and add a `"reporters"` key. Important: add it alongside existing keys — do NOT remove or replace any existing config.

The jest block currently has no `reporters` key. Add it — placement within the block doesn't matter, but after `"testEnvironment"` is readable:

```json
"jest": {
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "roots": ["<rootDir>/src", "<rootDir>/test"],
  "testRegex": ".*\\.spec\\.ts$",
  "transform": { "^.+\\.(t|j)s$": "ts-jest" },
  "collectCoverageFrom": [
    "src/**/*.(t|j)s",
    "!src/main.ts",
    "!src/**/*.module.ts",
    "!src/**/*.dto.ts",
    "!src/**/*.entity.ts",
    "!src/database/migrations/**",
    "!src/database/seeds/**"
  ],
  "coverageDirectory": "coverage",
  "coverageProvider": "v8",
  "testEnvironment": "node",
  "reporters": [
    "default",
    ["jest-progress-bar-reporter", { "usePercentage": true }]
  ],
  "moduleNameMapper": {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@modules/(.*)$": "<rootDir>/src/modules/$1",
    "^@common/(.*)$": "<rootDir>/src/common/$1",
    "^@config/(.*)$": "<rootDir>/src/config/$1",
    "^@database/(.*)$": "<rootDir>/src/database/$1"
  }
}
```

**Key detail:** `"default"` MUST be listed first. Per Jest docs, listing custom reporters in the `reporters` array silently drops the default reporter unless `"default"` is explicitly included. Keeping it first ensures standard Jest failure output (error messages, stack traces) is always present.

**Note on e2e:** `test:e2e` uses `./test/jest-e2e.json` as its config — it does NOT inherit from `package.json`'s `jest` block. Progress bars will not appear in e2e runs; that is expected and requires no action.

- [ ] **Step 3: Validate Jest starts without error**

Run from `backend/`:
```bash
npm test -- --listTests 2>&1 | head -5
```

Expected: Jest lists test files (or shows 0 test files if run from a clean context). No error like `Cannot find module 'jest-progress-bar-reporter'` or `Invalid reporters configuration`.

- [ ] **Step 4: Validate in interactive terminal**

Run from `backend/`:
```bash
npm test
```

Expected: A progress bar (percentage or count) appears as tests run. Standard Jest summary (pass/fail counts, test names on failure) appears at the end. Both reporters are active.

- [ ] **Step 5: Validate non-TTY output (required — CI hard constraint)**

Run from `backend/`:
```bash
npm test | cat
```

Expected: Clean readable text. No garbled ANSI escape codes. Jest pass/fail summary is readable. If you see raw escape sequences (e.g., `ESC[2K`), the reporter is not degrading gracefully — stop and investigate before committing.

- [ ] **Step 6: Verify coverage still works**

Run from `backend/`:
```bash
npm run test:cov 2>&1 | tail -20
```

Expected: Coverage table prints normally. No reporter-related errors.

- [ ] **Step 7: Commit**

```bash
cd backend
git add package.json package-lock.json
git commit -m "feat(dx): add jest-progress-bar-reporter for backend test runs"
```

---

### Final check

- [ ] Both `npm test | cat` runs (frontend and backend) produced clean readable output — CI hard constraint confirmed.
- [ ] No existing scripts (`test:watch`, `test:cov`, `test:e2e`) were modified.
- [ ] No application source files were changed.
