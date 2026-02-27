# Vite 7.3.1 + Vitest 4.0 Upgrade Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade Vite from 5.0.8 to 7.3.1 and Vitest from 1.0.4 to 4.0.18, along with all related plugins.

**Architecture:** Straight version bumps in package.json, migrate Vitest 4's removed `poolOptions` config to top-level options in vite.config.ts, then run tests and fix any breakages.

**Tech Stack:** Vite 7.3.1, Vitest 4.0.18, @vitejs/plugin-react 5.1.4

---

### Task 1: Update package.json versions and metadata

**Files:**
- Modify: `frontend/package.json`

**Step 1: Update devDependency versions**

In `frontend/package.json`, change these devDependencies:

```json
"@vitejs/plugin-react": "^5.1.4",
"@vitest/coverage-v8": "^4.0.18",
"@vitest/ui": "^4.0.18",
"vite": "^7.3.1",
"vitest": "^4.0.18"
```

**Step 2: Update engines.node**

Change the `engines` field:

```json
"engines": {
  "node": ">=20.19.0",
  "npm": ">=9.0.0"
}
```

**Step 3: Remove esbuild from overrides**

Change the `overrides` field from:

```json
"overrides": {
  "esbuild": "^0.25.0",
  "qs": "6.14.2"
}
```

To:

```json
"overrides": {
  "qs": "6.14.2"
}
```

**Step 4: Commit**

```bash
cd frontend && git add package.json && git commit -m "chore: bump vite to 7.3.1 and vitest to 4.0.18 in package.json"
```

---

### Task 2: Migrate vite.config.ts for Vitest 4

**Files:**
- Modify: `frontend/vite.config.ts:84-97`

**Step 1: Replace poolOptions with top-level Vitest 4 options**

In `frontend/vite.config.ts`, replace the entire `test` block (lines 84-97):

```typescript
// BEFORE
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      api: false,
      pool: 'forks',
      poolOptions: {
        forks: {
          minForks: 1,
          maxForks: 2,
          execArgv: ['--max-old-space-size=4096'],
        },
      },
    },
```

With:

```typescript
// AFTER
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      api: false,
      maxWorkers: 2,
      execArgv: ['--max-old-space-size=4096'],
    },
```

Changes explained:
- `pool: 'forks'` — removed (Vitest 4 handles pool selection internally)
- `poolOptions.forks.minForks` — removed (no equivalent in Vitest 4)
- `poolOptions.forks.maxForks: 2` — becomes `maxWorkers: 2`
- `poolOptions.forks.execArgv` — becomes top-level `execArgv`

**Step 2: Commit**

```bash
cd frontend && git add vite.config.ts && git commit -m "chore: migrate vitest poolOptions to top-level config for vitest 4"
```

---

### Task 3: Install dependencies

**Files:**
- Modify: `frontend/package-lock.json` (auto-generated)

**Step 1: Run npm install**

```bash
cd frontend && npm install
```

Expected: Resolves without errors. If peer dependency warnings appear for unrelated packages, they can be ignored. Peer dependency **errors** for the 5 upgraded packages should not occur.

**Step 2: Verify vite version installed**

```bash
cd frontend && npx vite --version
```

Expected: `vite/7.3.x` (7.3.1 or higher patch)

**Step 3: Commit the lockfile**

```bash
cd frontend && git add package-lock.json && git commit -m "chore: update package-lock.json for vite 7 and vitest 4"
```

---

### Task 4: Verify TypeScript compilation

**Files:**
- None modified (verification only)

**Step 1: Run type-check**

```bash
cd frontend && npm run type-check
```

Expected: Exits with code 0. If there are TypeScript errors related to Vitest types (e.g., removed options like `pool` or `poolOptions`), fix them in `vite.config.ts`.

---

### Task 5: Verify Vite build works

**Files:**
- None modified (verification only)

**Step 1: Run production build**

```bash
cd frontend && npm run build
```

Expected: Build completes successfully. Output goes to `frontend/dist/`. Watch for:
- Any warnings about deprecated Rollup options
- Bundle size changes (Vite 7 targets newer browsers, so bundles may be slightly smaller)

---

### Task 6: Run test suite and fix failures

**Files:**
- Possibly modify: test files (reactive fixes only)

**Step 1: Run the full test suite**

```bash
cd frontend && npm run test
```

Expected: All tests pass. If tests fail, diagnose based on these known Vitest 1→4 breaking changes:

**Possible failure: `mockReset()` behavior change**
- Vitest 3+ `mockReset()` restores original implementation instead of noop
- Fix: Replace `mockReset()` with `mockClear()` if you want to keep the mock but clear call history, or leave as-is if restoring the original is correct

**Possible failure: Stricter error equality**
- Vitest 3+ `toEqual` checks error `name`, `message`, `cause`, and prototype
- Fix: Update assertions to match exact error properties

**Possible failure: `vi.useFakeTimers()` mocks more APIs**
- Vitest 3+ mocks `performance.now()` and other timer APIs by default
- Fix: Pass `{ toFake: ['setTimeout', 'setInterval', ...] }` to limit what's faked

**Step 2: If any tests fail, fix them and commit**

```bash
cd frontend && git add -A && git commit -m "fix: update tests for vitest 4 compatibility"
```

---

### Task 7: Final verification commit

**Step 1: Run all checks in sequence**

```bash
cd frontend && npm run type-check && npm run build && npm run test
```

Expected: All three pass cleanly.

**Step 2: Squash or amend if desired, or leave as multiple commits**

The upgrade is complete. Commits created:
1. `chore: bump vite to 7.3.1 and vitest to 4.0.18 in package.json`
2. `chore: migrate vitest poolOptions to top-level config for vitest 4`
3. `chore: update package-lock.json for vite 7 and vitest 4`
4. `fix: update tests for vitest 4 compatibility` (if any tests needed fixing)
