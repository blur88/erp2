# Fix process.env References for Vite 8 Compatibility — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all `process.env` references in browser-executed frontend code with Vite-native `import.meta.env` equivalents, and remove one block of permanently dead test-helper code, to fix the blank-page crash introduced by the Vite 8 upgrade.

**Architecture:** Three surgical edits across two source files. No new files, no new dependencies, no structural changes. Each edit is independent and can be committed separately.

**Tech Stack:** React 19, Vite 8, TypeScript, Vitest, Redux Toolkit

**Spec:** `docs/superpowers/specs/2026-03-14-process-env-vite8-fix-design.md`

---

## Chunk 1: Fix the three process.env references

### Task 1: Fix `store/index.ts` — devTools flag

**Files:**
- Modify: `frontend/src/store/index.ts:107`

- [ ] **Step 1: Verify the current line**

  Open `frontend/src/store/index.ts` and confirm line 107 reads:
  ```ts
  devTools: process.env.NODE_ENV !== 'production',
  ```

- [ ] **Step 2: Apply the fix**

  Replace that line with:
  ```ts
  devTools: import.meta.env.MODE !== 'production',
  ```

  `import.meta.env.MODE` is Vite's built-in equivalent — `'development'` in dev, `'production'` in prod, `'test'` under Vitest. The semantics are identical.

- [ ] **Step 3: Run the frontend tests**

  ```bash
  cd frontend && npm run test
  ```

  Expected: all tests pass. If any test imports `store/index.ts`, it will still work because Vitest polyfills `import.meta.env` in both `jsdom` and `node` environments.

- [ ] **Step 4: Run TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/store/index.ts
  git commit -m "fix: replace process.env.NODE_ENV with import.meta.env.MODE in store (closes part of #100)"
  ```

---

### Task 2: Fix `PurchaseOrdersPage.tsx` — debug alert guard

**Files:**
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx:156`

- [ ] **Step 1: Verify the current line**

  Open `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` and confirm line 156 reads:
  ```tsx
  {process.env.NODE_ENV === 'development' && (
  ```

- [ ] **Step 2: Apply the fix**

  Replace that line with:
  ```tsx
  {import.meta.env.DEV && (
  ```

  `import.meta.env.DEV` is a boolean injected by Vite — `true` only in development mode. This is semantically equivalent to `NODE_ENV === 'development'` and is the idiomatic Vite form.

- [ ] **Step 3: Run the frontend tests**

  ```bash
  cd frontend && npm run test
  ```

  Expected: all tests pass.

- [ ] **Step 4: Run TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/pages/purchasing/PurchaseOrdersPage.tsx
  git commit -m "fix: replace process.env.NODE_ENV with import.meta.env.DEV in PurchaseOrdersPage (closes part of #100)"
  ```

---

### Task 3: Remove dead code from `FundTransfersPage.tsx`

**Files:**
- Modify: `frontend/src/pages/accounting/FundTransfersPage.tsx:79–84`

- [ ] **Step 1: Verify the block to remove**

  Open `frontend/src/pages/accounting/FundTransfersPage.tsx`. Locate the `getFallbackStore` function (around line 73). It should look like:

  ```ts
  const getFallbackStore = (): AppStore | null => {
    const runtimeStore = (window as any).store as AppStore | undefined
    if (runtimeStore?.getState && runtimeStore?.subscribe) {
      return runtimeStore
    }

    if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
      return {
        getState: () => ({ auth: { user: { role: 'admin' } } }),
        subscribe: () => () => undefined,
      }
    }

    return null
  }
  ```

- [ ] **Step 2: Remove the dead block**

  Delete the entire `if (typeof process !== 'undefined' ...)` block (lines 79–84). The function should read:

  ```ts
  const getFallbackStore = (): AppStore | null => {
    const runtimeStore = (window as any).store as AppStore | undefined
    if (runtimeStore?.getState && runtimeStore?.subscribe) {
      return runtimeStore
    }

    return null
  }
  ```

  **Why this is safe:** `FundTransfersPage.test.tsx` mocks all RTK Query hooks via `vi.hoisted` + `vi.mock` and renders with a plain `<BrowserRouter>` — no Redux `<Provider>`. The fake-store fallback was never reached by any test. See spec rationale for full details.

- [ ] **Step 3: Run the frontend tests**

  ```bash
  cd frontend && npm run test
  ```

  Expected: all tests pass, including `FundTransfersPage.test.tsx`.

- [ ] **Step 4: Run TypeScript check**

  ```bash
  cd frontend && npm run type-check
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add frontend/src/pages/accounting/FundTransfersPage.tsx
  git commit -m "fix: remove dead process.env test guard from FundTransfersPage (closes part of #100)"
  ```

---

## Final Verification

- [ ] **Run all frontend tests one final time**

  ```bash
  cd frontend && npm run test
  ```

  Expected: all pass.

- [ ] **Start the dev server and verify the login page loads**

  ```bash
  cd frontend && npm run dev
  ```

  Open `http://localhost:3000/login` in a browser. Expected: login page renders, no blank page, no `ReferenceError: process is not defined` in the browser console.

- [ ] **Search for any remaining bare process.env references in browser-executed code**

  ```bash
  grep -r "process\.env" frontend/src --include="*.ts" --include="*.tsx" --exclude-dir=__tests__ --exclude="*.test.*" --exclude="*.spec.*"
  ```

  Note: `--exclude-dir=__tests__` matches directories named `__tests__` at any depth by basename (GNU grep 3.x behaviour). This covers `frontend/src/config/__tests__/viteModeConfig.test.ts` — the one known file that legitimately uses `process.env` in a Node-environment Vitest test.

  Expected: no output (zero remaining references in non-test source files).

  Note: Issue #100 will be closed via the pull request description once all three commits are merged together.
