# Fix `process.env` References for Vite 8 Compatibility

**Issue:** #100
**Date:** 2026-03-14
**Status:** Approved

## Problem

After upgrading to Vite 8 and `@vitejs/plugin-react` v6, the login page shows a blank page. Vite 8 uses ESM/Rolldown and does not define `process` in the browser environment by default. Files that access `process.env.NODE_ENV` directly throw `ReferenceError: process is not defined` at runtime, crashing the app before anything renders.

The crash originates in `frontend/src/store/index.ts`, which is imported by `main.tsx` — the entry point — so the app never initialises.

## Affected Files

| File | Line | Issue |
|------|------|-------|
| `frontend/src/store/index.ts` | 107 | Bare `process.env.NODE_ENV` — crashes on init |
| `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` | 156 | Bare `process.env.NODE_ENV` — crashes on render |
| `frontend/src/pages/accounting/FundTransfersPage.tsx` | 79–84 | Guarded `process.env.NODE_ENV` — no crash, but permanently dead code in the browser |

**Not affected:** `frontend/src/config/__tests__/viteModeConfig.test.ts` — runs in Node via Vitest (`@vitest-environment node`), where `process.env` is valid.

## Design

### Change 1 — `frontend/src/store/index.ts:107`

```ts
// Before
devTools: process.env.NODE_ENV !== 'production',

// After
devTools: import.meta.env.MODE !== 'production',
```

`import.meta.env.MODE` is the Vite-native equivalent: `'development'` in dev, `'production'` in prod, `'test'` in Vitest.

### Change 2 — `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx:156`

```tsx
// Before
{process.env.NODE_ENV === 'development' && (

// After
{import.meta.env.DEV && (
```

`import.meta.env.DEV` is a boolean, `true` only in development mode — cleaner than a string comparison.

### Change 3 — `frontend/src/pages/accounting/FundTransfersPage.tsx:79–84`

Remove the entire block:

```ts
// Remove this block entirely
if (typeof process !== 'undefined' && process.env.NODE_ENV === 'test') {
  return {
    getState: () => ({ auth: { user: { role: 'admin' } } }),
    subscribe: () => () => undefined,
  }
}
```

**Rationale:** The existing test file (`FundTransfersPage.test.tsx`) mocks all RTK Query hooks via `vi.mock` and does not use a Redux `<Provider>`. The fake-store fallback was never exercised by any test. The `typeof process !== 'undefined'` guard prevents a crash, but the block is dead code. Removing it makes `getFallbackStore` cleaner: try `window.store`, otherwise return `null`.

## Testing

1. `cd frontend && npm run test` — confirm no regressions
2. `cd frontend && npm run dev` — confirm the app loads without a blank page at `/login`
3. `cd frontend && npm run type-check` — confirm no TypeScript errors
