# Entity Workspace Selection Reset Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix selection resetting to "Select a …" placeholder when clicking rows in any entity list page (Customers, Suppliers, Products, Orders, etc.) — closes #444.

**Architecture:** Two independent fixes applied together: (1) add an `isFetching` guard to `useEntityWorkspace` so a transient empty `entities` array during a background refetch never clears the selection; (2) wrap every inline `selectEntity` arrow passed to `useEntityWorkspace` in `useCallback` so its reference is stable across renders, preventing the auto-selection effect from re-running spuriously.

**Tech Stack:** React 19, Redux Toolkit / RTK Query, Vitest, `@testing-library/react`

---

### Task 1: Add `isFetching` guard to `useEntityWorkspace` hook (with tests)

**Files:**
- Modify: `frontend/src/hooks/useEntityWorkspace.ts`
- Modify: `frontend/src/hooks/useEntityWorkspace.test.ts`

- [ ] **Step 1: Write two failing tests**

Open `frontend/src/hooks/useEntityWorkspace.test.ts`. Add these two tests inside the existing `describe('useEntityWorkspace', ...)` block, after the last existing test:

```ts
it('does not clear selection when entities become empty during a fetch', () => {
  const config = makeConfig({ isFetching: true, entities: [] })

  renderHook(() => useEntityWorkspace(config))

  // selectEntity should never be called — not to auto-select (empty list)
  // and not to clear (isFetching guards it)
  expect(config.selectEntity).not.toHaveBeenCalled()
})

it('clears selection when entities become empty and not fetching', () => {
  const config = makeConfig({ isFetching: false, entities: [] })

  renderHook(() => useEntityWorkspace(config))

  expect(config.selectEntity).toHaveBeenCalledWith(null)
})
```

- [ ] **Step 2: Run the new tests to confirm they fail**

```bash
cd frontend && npx vitest run src/hooks/useEntityWorkspace.test.ts
```

Expected: the two new tests fail (TypeScript error or runtime — `isFetching` not in config type yet).

- [ ] **Step 3: Add `isFetching` to the config interface and guard the effect**

In `frontend/src/hooks/useEntityWorkspace.ts`, make these changes:

**In `UseEntityWorkspaceConfig` interface** — add the optional field after `deleteMutation`:

```ts
  deleteMutation: (id: string) => Promise<void>
  isFetching?: boolean
  onEnter?: () => void
  onEscape?: () => void
```

**In the hook body** — destructure it alongside the other config fields:

```ts
  const {
    entities,
    selectedEntity,
    selectEntity,
    refetch,
    navigate,
    routes,
    notifications,
    deleteMutation,
    isFetching = false,
    onEnter,
    onEscape,
  } = config
```

**Replace the auto-selection effect** (currently lines 74–86) with:

```ts
  useEffect(() => {
    if (entities.length === 0) {
      if (!isFetching) {
        hasAutoSelected.current = false
        setFocusedIndex(-1)
        selectEntity(null)
      }
      return
    }

    if (!selectedEntity && focusedIndex === -1 && !hasAutoSelected.current) {
      hasAutoSelected.current = true
      selectEntity(entities[0])
    }
  }, [entities, focusedIndex, isFetching, selectedEntity, selectEntity])
```

- [ ] **Step 4: Run the tests and confirm all pass**

```bash
cd frontend && npx vitest run src/hooks/useEntityWorkspace.test.ts
```

Expected: all tests pass including the 2 new ones.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/hooks/useEntityWorkspace.ts frontend/src/hooks/useEntityWorkspace.test.ts
git commit -m "fix: guard useEntityWorkspace selection clear when isFetching (closes part of #444)"
```

---

### Task 2: Memoize `selectEntity` and pass `isFetching` in `CustomersPage`

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`

- [ ] **Step 1: Memoize `selectEntity` and pass `isFetching`**

In `CustomersPage.tsx`, `dispatch` is already available. Add a `useCallback`-wrapped `selectEntity` before the `useEntityWorkspace` call, then pass it and `isFetching` into the hook.

Replace the current inline arrow at lines 78–80 and add `isFetching`:

```ts
  const selectCustomer = useCallback(
    (customer: Customer | null) => { dispatch(setSelectedCustomer(customer)) },
    [dispatch],
  )

  const workspace = useEntityWorkspace({
    entities: customers,
    selectedEntity: selectedCustomer,
    selectEntity: selectCustomer,
    isFetching,
    refetch: () => { void refetch() },
    // ... rest unchanged
```

The full `useEntityWorkspace` call should become:

```ts
  const workspace = useEntityWorkspace({
    entities: customers,
    selectedEntity: selectedCustomer,
    selectEntity: selectCustomer,
    isFetching,
    refetch: () => {
      void refetch()
    },
    navigate,
    routes: {
      create: '/sales/customers/create',
      edit: (id) => `/sales/customers/${id}/edit`,
    },
    notifications: {
      showSuccess,
      showError: (message) => {
        setPageError(message)
        showError(message)
      },
    },
    deleteMutation: (id) => deleteCustomer(id).unwrap(),
  })
```

Also add `Customer` to the imports from `@/types` if it is not already imported. Check the top of the file — it is imported via the slice types indirectly; add it explicitly:

```ts
import type { Customer } from '@/types'
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep CustomersPage
```

Expected: no errors for this file.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/CustomersPage.tsx
git commit -m "fix: memoize selectEntity and pass isFetching in CustomersPage (#444)"
```

---

### Task 3: Memoize `selectEntity` and pass `isFetching` in `SuppliersPage`

**Files:**
- Modify: `frontend/src/pages/purchasing/SuppliersPage.tsx`

- [ ] **Step 1: Read the relevant section of SuppliersPage**

The file already imports `useCallback` (line 1) and has `isFetching` from `useGetSuppliersQuery` (line 68). Find the `useEntityWorkspace` call (starts around line 72).

- [ ] **Step 2: Add memoized `selectEntity` and pass `isFetching`**

Add before the `useEntityWorkspace` call (after `const suppliers = suppliersResponse?.data ?? []`):

```ts
  const selectSupplier = useCallback(
    (supplier: Supplier | null) => { dispatch(setSelectedSupplier(supplier)) },
    [dispatch],
  )
```

Then in the `useEntityWorkspace` call, replace the inline arrow with `selectSupplier` and add `isFetching`:

```ts
    entities: suppliers,
    selectedEntity: selectedSupplier,
    selectEntity: selectSupplier,
    isFetching,
```

Check that `Supplier` type is imported from `@/types` at the top of the file. Add if missing.

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep SuppliersPage
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/purchasing/SuppliersPage.tsx
git commit -m "fix: memoize selectEntity and pass isFetching in SuppliersPage (#444)"
```

---

### Task 4: Memoize `selectEntity` in `useVendorPaymentsWorkspace` and `useGRNWorkspace`

**Files:**
- Modify: `frontend/src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts`
- Modify: `frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts`

Neither file has access to `isFetching` — only the `useCallback` fix applies.

- [ ] **Step 1: Fix `useVendorPaymentsWorkspace`**

The file imports `{ useEffect, useRef, useState }` from `'react'` (line 1). Add `useCallback` to that import:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
```

`dispatch` is already available (received as a prop). Add a memoized callback before `useEntityWorkspace`:

```ts
  const selectPayment = useCallback(
    (payment: VendorPayment | null) => dispatch(setSelectedVendorPayment(payment)),
    [dispatch],
  )
```

Then in `useEntityWorkspace`, replace `selectEntity: (payment) => dispatch(setSelectedVendorPayment(payment))` with:

```ts
    selectEntity: selectPayment,
```

- [ ] **Step 2: Fix `useGRNWorkspace`**

Same pattern. Add `useCallback` to the import:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
```

Add before `useEntityWorkspace`:

```ts
  const selectGRN = useCallback(
    (grn: GoodsReceivedNote | null) => dispatch(setSelectedGRN(grn)),
    [dispatch],
  )
```

Replace in `useEntityWorkspace`:

```ts
    selectEntity: selectGRN,
```

- [ ] **Step 3: Type-check both files**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "useVendorPayments|useGRN"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts \
        frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts
git commit -m "fix: memoize selectEntity in purchasing workspace hooks (#444)"
```

---

### Task 5: Memoize `selectEntity` in inventory workspace hooks

**Files:**
- Modify: `frontend/src/pages/inventory/hooks/useProductsWorkspace.ts`
- Modify: `frontend/src/pages/inventory/hooks/useStockAdjustmentsWorkspace.ts`
- Modify: `frontend/src/pages/inventory/hooks/useCategoriesWorkspace.ts`

All three already import `useCallback`. Only add the memoized variable and swap the inline arrow.

- [ ] **Step 1: Fix `useProductsWorkspace`**

Add before `useEntityWorkspace`:

```ts
  const selectProduct = useCallback(
    (product: Product | null) => dispatch(setSelectedProduct(product)),
    [dispatch],
  )
```

Replace `selectEntity: (product) => dispatch(setSelectedProduct(product))` with:

```ts
    selectEntity: selectProduct,
```

- [ ] **Step 2: Fix `useStockAdjustmentsWorkspace`**

Add before `useEntityWorkspace`:

```ts
  const selectAdjustment = useCallback(
    (adjustment: StockAdjustment | null) => dispatch(setSelectedStockAdjustment(adjustment)),
    [dispatch],
  )
```

Replace `selectEntity: (adjustment) => dispatch(setSelectedStockAdjustment(adjustment))` with:

```ts
    selectEntity: selectAdjustment,
```

Check the entity type name by looking at the `entities:` line and existing imports — the type is whatever `adjustments` array items are.

- [ ] **Step 3: Fix `useCategoriesWorkspace`**

Add before `useEntityWorkspace`:

```ts
  const selectCategory = useCallback(
    (category: Category | null) => dispatch(setSelectedCategory(category)),
    [dispatch],
  )
```

Replace `selectEntity: (category) => dispatch(setSelectedCategory(category))` with:

```ts
    selectEntity: selectCategory,
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "useProducts|useStockAdj|useCategories"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inventory/hooks/useProductsWorkspace.ts \
        frontend/src/pages/inventory/hooks/useStockAdjustmentsWorkspace.ts \
        frontend/src/pages/inventory/hooks/useCategoriesWorkspace.ts
git commit -m "fix: memoize selectEntity in inventory workspace hooks (#444)"
```

---

### Task 6: Memoize `selectEntity` in sales workspace hooks

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`
- Modify: `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`
- Modify: `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`

`useOrdersWorkspace` and `usePaymentsWorkspace` already import `useCallback`. `useInvoicesWorkspace` does not — add it.

- [ ] **Step 1: Fix `useInvoicesWorkspace`**

Add `useCallback` to the React import (line 1):

```ts
import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
```

Add before `useEntityWorkspace`:

```ts
  const selectInvoice = useCallback(
    (invoice: InvoiceItem | null) => dispatch(setSelectedInvoice(invoice as any)),
    [dispatch],
  )
```

Replace `selectEntity: (invoice) => dispatch(setSelectedInvoice(invoice as any))` with:

```ts
    selectEntity: selectInvoice,
```

- [ ] **Step 2: Fix `useOrdersWorkspace`**

`useCallback` already imported. Add before `useEntityWorkspace`:

```ts
  const selectOrder = useCallback(
    (order: SalesOrder | null) => dispatch(setSelectedOrder(order)),
    [dispatch],
  )
```

Replace `selectEntity: (order) => dispatch(setSelectedOrder(order))` with:

```ts
    selectEntity: selectOrder,
```

- [ ] **Step 3: Fix `usePaymentsWorkspace`**

`useCallback` already imported. Add before `useEntityWorkspace`:

```ts
  const selectPayment = useCallback(
    (payment: PaymentListItem | null) => dispatch(setSelectedPayment(payment as any)),
    [dispatch],
  )
```

Replace `selectEntity: (payment) => dispatch(setSelectedPayment(payment as any))` with:

```ts
    selectEntity: selectPayment,
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "useInvoices|useOrders|usePayments"
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts \
        frontend/src/pages/sales/hooks/useOrdersWorkspace.ts \
        frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts
git commit -m "fix: memoize selectEntity in sales workspace hooks (#444)"
```

---

### Task 7: Memoize `selectEntity` in accounting workspace hooks

**Files:**
- Modify: `frontend/src/pages/accounting/hooks/useChartOfAccountsWorkspace.ts`
- Modify: `frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts`

Both already import `useCallback`.

- [ ] **Step 1: Fix `useChartOfAccountsWorkspace`**

Add before `useEntityWorkspace`:

```ts
  const selectAccount = useCallback(
    (account: ChartOfAccount | null) => dispatch(setSelectedAccount(account)),
    [dispatch],
  )
```

Replace `selectEntity: (account) => dispatch(setSelectedAccount(account))` with:

```ts
    selectEntity: selectAccount,
```

- [ ] **Step 2: Fix `useJournalEntriesWorkspace`**

`useJournalEntriesWorkspace` uses a custom `selectAndLoadEntry` flow — the inline `selectEntity` passed to `useEntityWorkspace` is at line 68. Add before `useEntityWorkspace`:

```ts
  const selectEntry = useCallback(
    (entry: JournalEntry | null) => {
      dispatch(setSelectedJournalEntry(entry))
    },
    [dispatch],
  )
```

Replace the inline arrow `selectEntity: (entry) => { dispatch(setSelectedJournalEntry(entry)) }` with:

```ts
    selectEntity: selectEntry,
```

- [ ] **Step 3: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "useChartOfAccounts|useJournalEntries"
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/accounting/hooks/useChartOfAccountsWorkspace.ts \
        frontend/src/pages/accounting/hooks/useJournalEntriesWorkspace.ts
git commit -m "fix: memoize selectEntity in accounting workspace hooks (#444)"
```

---

### Task 8: Full type-check and test run

**Files:** none modified

- [ ] **Step 1: Full TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: zero errors.

- [ ] **Step 2: Run the hook test file**

```bash
cd frontend && npx vitest run src/hooks/useEntityWorkspace.test.ts
```

Expected: all tests pass (12 tests including the 2 new ones from Task 1).

- [ ] **Step 3: Open a PR**

```bash
gh pr create \
  --title "fix: entity workspace selection reset on row click (#444)" \
  --body "$(cat <<'EOF'
## Summary

- Adds `isFetching?: boolean` to `useEntityWorkspace` config — skips clearing selection when entities array is transiently empty during a background RTK Query refetch
- Wraps every inline `selectEntity` arrow passed to `useEntityWorkspace` in `useCallback` across all 10 consumers, eliminating the spurious effect re-runs caused by unstable function references

Closes #444

## Test plan

- [ ] New unit tests in `useEntityWorkspace.test.ts` cover both the `isFetching` guard and the stable-reference expectation
- [ ] `npm run type-check` passes with zero errors
- [ ] Manual: navigate to `/sales/customers`, click different customers — header and workspace card update reliably every time
- [ ] Manual: same check on Suppliers, Products, Sales Orders pages

🤖 Generated with [Claude Code](https://claude.ai/claude-code)
EOF
)"
```
