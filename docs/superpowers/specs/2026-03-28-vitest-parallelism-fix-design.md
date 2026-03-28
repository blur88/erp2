# Vitest Parallelism Fix — Design Spec

**Issue:** #198
**Date:** 2026-03-28

---

## Problem

Frontend Vitest runs take 7–10 minutes sequentially (`maxWorkers: 1`), causing AI agents to treat the process as hung and kill it. The sequential limit was introduced on 2026-03-26 (commit `23b4e219f`) to fix parallel instability, but the instability had a fixable root cause rather than requiring a permanent regression to single-worker execution.

---

## Root Cause

Several test files call `vi.useFakeTimers()` inside helper functions guarded by `try/finally`. If a test throws before the `finally` block executes (or Vitest worker shutdown races with cleanup), fake timers can leak across tests running in parallel workers. This causes `waitFor()` and timer-dependent assertions in sibling tests to hang or time out.

All affected files have already been cleaned up in previous commits. Both files that use fake timers (`Sidebar.test.tsx`, `SearchModal.test.tsx`) correctly scope `vi.useFakeTimers()` in `beforeEach` and `vi.useRealTimers()` in `afterEach`. No test file changes are required.

MSW (`server.listen/resetHandlers/close`) is already correctly scoped in `beforeAll/afterEach/afterAll` in `setupTests.ts` — each worker gets its own module scope, so no changes needed there.

---

## Solution

### 1. Fix timer isolation in affected test files

Move `vi.useFakeTimers()` / `vi.useRealTimers()` from inline helper functions into `beforeEach` / `afterEach` hooks at the `describe` block level. Vitest guarantees these hooks run even when a test throws, eliminating the leak vector.

**Pattern to replace:**
```ts
// Fragile — finally may not run on worker shutdown
const helperFn = async () => {
  vi.useFakeTimers()
  try {
    // ...
  } finally {
    vi.useRealTimers()
  }
}
```

**Pattern to use:**
```ts
beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})
```

### 2. Update `vite.config.ts`

| Setting | Before | After | Reason |
|---|---|---|---|
| `maxWorkers` | `1` | `2` | Re-enable parallelism now that isolation is fixed |
| `--max-old-space-size` | `4096` | `1536` | Was preemptive; 768 MB × 2 workers = 1.5 GB, safe on 9.7 GB RAM |

---

## Architecture

- No new files, no new dependencies
- Changes confined to `vite.config.ts` and 4 test files
- MSW setup unchanged — already worker-safe

---

## Success Criteria

1. All 93 test files pass with `maxWorkers: 2`
2. No flaky failures across 3 consecutive full runs
3. Total runtime drops from ~7–10 min to ~3–5 min

If a specific test still flakes with 2 workers, investigate and fix that test in isolation — do not reduce `maxWorkers` globally.

---

## Out of Scope

- Reporter changes (dot reporter already in place; doesn't solve the silent startup gap)
- Sharding
- Moving tests to `node` environment to skip jsdom
