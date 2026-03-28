# Vitest Parallelism Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-enable parallel Vitest execution with 2 workers to reduce frontend test runtime from ~7-10 min to ~3-5 min.

**Architecture:** Timer isolation in all affected test files (`Sidebar.test.tsx`, `SearchModal.test.tsx`) is already correctly scoped in `beforeEach`/`afterEach`. The only change needed is in `vite.config.ts`: bump `maxWorkers` to 2 and lower the heap allocation from 4096 MB (preemptive) to 1536 MB (safe for 2 workers on 9.7 GB RAM).

**Tech Stack:** Vitest 4.0.18, jsdom, React Testing Library, MSW

---

### Task 1: Update Vitest config

**Files:**
- Modify: `frontend/vite.config.ts:115-116`

- [ ] **Step 1: Update maxWorkers and heap size**

In `frontend/vite.config.ts`, find the `test` block (around line 109) and update two values:

```ts
test: {
  globals: true,
  environment: 'jsdom',
  environmentMatchGlobs: [['src/**/*.test.ts', 'node']],
  setupFiles: ['./src/test/setup.ts', './src/setupTests.ts'],
  api: false,
  maxWorkers: 2,
  execArgv: ['--max-old-space-size=1536'],
  testTimeout: 30000,
},
```

- [ ] **Step 2: Run the full test suite once to check for failures**

```bash
cd frontend && npm test
```

Expected: all tests pass (93 test files). If any test fails, note the specific file and error — do NOT revert `maxWorkers`. Fix the specific test instead.

- [ ] **Step 3: Run two more times to check stability**

```bash
cd frontend && npm test && npm test
```

Expected: both runs pass with no failures or timeouts. Three consecutive passes confirms stability.

- [ ] **Step 4: Commit**

```bash
git add frontend/vite.config.ts
git commit -m "perf(test): re-enable 2 vitest workers, reduce heap to 1536 MB (closes #198)"
```
