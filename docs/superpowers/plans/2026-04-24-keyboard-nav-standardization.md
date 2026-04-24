# Keyboard Navigation Standardization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize keyboard navigation across Sales Orders, Invoices, Payments, and Customers so that arrow/page key navigation triggers a full-detail API fetch on all four pages, and eliminate the duplicate keyboard event listener in `useOrdersWorkspace`.

**Architecture:** Add an optional `onNavigate` callback to `useEntityWorkspace` that fires on every keyboard navigation move (inside `selectAtIndex`). Each feature hook/page passes its lazy RTK Query fetch as `onNavigate`. `useOrdersWorkspace` removes its duplicate `useKeyboardShortcuts` registration and redundant navigation override handlers, delegating to the base hook.

**Tech Stack:** React 19, TypeScript, RTK Query (`useLazyGet*Query` hooks), Vitest

---

## File Map

| File | Action |
|------|--------|
| `frontend/src/hooks/useEntityWorkspace.ts` | Modify — add `onNavigate` to config and `selectAtIndex` |
| `frontend/src/hooks/useEntityWorkspace.test.ts` | Modify — add 3 tests for `onNavigate` |
| `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts` | Modify — remove duplicate listener + 6 nav overrides, add `onNavigate` |
| `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts` | Modify — add `useLazyGetInvoiceQuery` + `onNavigate` |
| `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts` | Modify — add `useLazyGetPaymentQuery` + `onNavigate` |
| `frontend/src/pages/sales/CustomersPage.tsx` | Modify — add `useLazyGetCustomerQuery` + `onNavigate` |
| `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx` | Modify — remove stale nav handler mocks |
| `frontend/src/pages/sales/__tests__/InvoicesPage.filterbar.test.tsx` | Modify — remove stale nav handler mocks |
| `frontend/src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx` | Modify — remove stale nav handler mocks |

---

## Task 1: Add `onNavigate` to `useEntityWorkspace`

**Files:**
- Modify: `frontend/src/hooks/useEntityWorkspace.ts`

- [ ] **Step 1: Add `onNavigate` to `UseEntityWorkspaceConfig`**

In `frontend/src/hooks/useEntityWorkspace.ts`, add the optional field to the config interface (after `onEscape`):

```ts
export interface UseEntityWorkspaceConfig<T extends { id: string }> {
  entities: T[]
  selectedEntity: T | null
  selectEntity: (entity: T | null) => void
  refetch: () => void
  navigate: NavigateFunction
  routes: {
    create: string
    edit: (id: string) => string
  }
  notifications: {
    showSuccess: (message: string) => void
    showError: (message: string) => void
  }
  deleteMutation: (id: string) => Promise<void>
  onEnter?: () => void
  onEscape?: () => void
  onNavigate?: (entity: T, index: number) => void
}
```

- [ ] **Step 2: Destructure `onNavigate` from config**

In the `useEntityWorkspace` function body, add `onNavigate` to the destructuring (after `onEscape`):

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
  onEnter,
  onEscape,
  onNavigate,
} = config
```

- [ ] **Step 3: Call `onNavigate` inside `selectAtIndex`**

Replace the existing `selectAtIndex` implementation (lines 118–127) with:

```ts
const selectAtIndex = useCallback((index: number) => {
  const entity = entities[index]

  if (!entity) {
    return
  }

  setFocusedIndex(index)
  selectEntity(entity)
  onNavigate?.(entity, index)
}, [entities, selectEntity, onNavigate])
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|useEntityWorkspace"
```

Expected: no errors related to `useEntityWorkspace`.

---

## Task 2: Test `onNavigate` in `useEntityWorkspace`

**Files:**
- Modify: `frontend/src/hooks/useEntityWorkspace.test.ts`

- [ ] **Step 1: Write three failing tests**

Add these three `it` blocks inside the existing `describe('useEntityWorkspace', ...)` block at the end of the file:

```ts
it('onNavigate is called when navigating down', () => {
  const onNavigate = vi.fn()
  const config = makeConfig({ onNavigate })
  const { result } = renderHook(() => useEntityWorkspace(config))

  act(() => {
    result.current.setFocusedIndex(0)
  })
  act(() => {
    result.current.handleNavigateDown()
  })

  expect(onNavigate).toHaveBeenCalledWith(config.entities[1], 1)
})

it('onNavigate is called when navigating up', () => {
  const onNavigate = vi.fn()
  const config = makeConfig({ onNavigate })
  const { result } = renderHook(() => useEntityWorkspace(config))

  act(() => {
    result.current.setFocusedIndex(2)
  })
  act(() => {
    result.current.handleNavigateUp()
  })

  expect(onNavigate).toHaveBeenCalledWith(config.entities[1], 1)
})

it('onNavigate is NOT called when selecting via handleSelect (click)', () => {
  const onNavigate = vi.fn()
  const config = makeConfig({ onNavigate })
  const { result } = renderHook(() => useEntityWorkspace(config))

  act(() => {
    result.current.handleSelect(config.entities[1])
  })

  expect(onNavigate).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/hooks/useEntityWorkspace.test.ts
```

Expected: the three new tests FAIL (onNavigate not yet called / not yet in config).

- [ ] **Step 3: Verify tests pass after Task 1 changes**

```bash
cd frontend && npx vitest run src/hooks/useEntityWorkspace.test.ts
```

Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hooks/useEntityWorkspace.ts frontend/src/hooks/useEntityWorkspace.test.ts
git commit -m "feat(workspace): add onNavigate callback to useEntityWorkspace"
```

---

## Task 3: Refactor `useOrdersWorkspace`

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`

- [ ] **Step 1: Remove the duplicate `useKeyboardShortcuts` import usage**

The import at line 6 (`import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'`) is only used by the duplicate listener. Remove the entire second `useKeyboardShortcuts` call (currently lines 839–852):

```ts
// DELETE this entire block:
useKeyboardShortcuts({
  onSearch: () => {
    workspace.searchInputRef.current?.focus()
    workspace.searchInputRef.current?.select()
  },
  onArrowUp: handleNavigateUp,
  onArrowDown: handleNavigateDown,
  onEnter: workspace.handleEnterAction,
  onPageUp: handlePageUpNavigation,
  onPageDown: handlePageDownNavigation,
  onHome: handleNavigateToFirst,
  onEnd: handleNavigateToLast,
  onEscape: workspace.handleEscapeAction,
})
```

Also remove the `useKeyboardShortcuts` import line if it is no longer referenced anywhere else in the file.

- [ ] **Step 2: Remove `selectAndLoadOrder` and the six navigation overrides**

Delete the following functions entirely (they are replaced by `onNavigate`):

- `selectAndLoadOrder` (lines ~306–311)
- `handleNavigateUp` (lines ~313–317)
- `handleNavigateDown` (lines ~319–323)
- `handleNavigateToFirst` (lines ~325–329)
- `handleNavigateToLast` (lines ~331–335)
- `handlePageUpNavigation` (lines ~337–342)
- `handlePageDownNavigation` (lines ~344–349)

- [ ] **Step 3: Add `onNavigate` to the `useEntityWorkspace` config call**

In the existing `useEntityWorkspace({...})` call (around line 92), add `onNavigate` alongside the other config options:

```ts
const workspace = useEntityWorkspace({
  entities: orders,
  selectedEntity: selectedOrder,
  selectEntity: (order) => dispatch(setSelectedOrder(order)),
  refetch: refetchOrders,
  navigate,
  routes: {
    create: '/sales/orders/create',
    edit: (id) => `/sales/orders/${id}/edit`,
  },
  notifications: { showSuccess: () => {}, showError: () => {} },
  deleteMutation: async () => {},
  onNavigate: (order) => {
    void triggerGetSalesOrder(order.id).unwrap().then((fullOrder) => {
      dispatch(setSelectedOrder(fullOrder))
    })
    userHasNavigatedRef.current = true
  },
  onEnter: () => {
    if (workspaceRef.current?.focusedIndex != null && workspaceRef.current.focusedIndex >= 0) {
      const order = orders[workspaceRef.current.focusedIndex]
      if (order) {
        navigate(`/sales/orders/${order.id}/edit`)
      }
    }
  },
  onEscape: () => {
    workspaceRef.current?.setFocusedIndex(-1)
    dispatch(setSelectedOrder(null))
    setViewDialog(false)
    setBlockedDialogOpen(false)
    setDeletedOrdersDialogOpen(false)
    setDeleteConfirmOpen(false)
  },
})
```

- [ ] **Step 4: Remove the six nav handlers from the return object**

In the `return { ... }` at the bottom of `useOrdersWorkspace`, remove these six keys (they are now provided by the base workspace spread):

```ts
// REMOVE these from the return object:
handleNavigateUp,
handleNavigateDown,
handleNavigateToFirst,
handleNavigateToLast,
handlePageUpNavigation,
handlePageDownNavigation,
```

The `...workspace` spread already exposes the base hook's versions of these.

- [ ] **Step 5: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|useOrdersWorkspace"
```

Expected: no errors.

- [ ] **Step 6: Run orders workspace tests**

```bash
cd frontend && npx vitest run src/pages/sales/hooks/useOrdersWorkspace.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 7: Update `OrdersPage.filterbar.test.tsx` mock**

Open `frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx` and remove the six stale nav handler mock entries. Find the mock object (around line 65) and delete these lines:

```ts
// DELETE these lines from the mock:
handleNavigateUp: vi.fn(),
handleNavigateDown: vi.fn(),
handleNavigateToFirst: vi.fn(),
handleNavigateToLast: vi.fn(),
handlePageUpNavigation: vi.fn(),
handlePageDownNavigation: vi.fn(),
```

- [ ] **Step 8: Run filterbar test**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/pages/sales/hooks/useOrdersWorkspace.ts \
        frontend/src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx
git commit -m "feat(sales): remove duplicate keyboard listener from useOrdersWorkspace, add onNavigate"
```

---

## Task 4: Add `onNavigate` to `useInvoicesWorkspace`

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`

- [ ] **Step 1: Import `useLazyGetInvoiceQuery`**

Add to the existing import from `@/store/api/salesApi` (or add a new import line if not already importing from there):

```ts
import { useLazyGetInvoiceQuery } from '@/store/api/salesApi'
```

Verify the hook name exists:
```bash
grep "useLazyGetInvoiceQuery" frontend/src/store/api/salesApi.ts
```
Expected: one matching line.

- [ ] **Step 2: Instantiate the lazy query**

Inside `useInvoicesWorkspace`, after the existing `const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()` line, add:

```ts
const [triggerGetInvoice] = useLazyGetInvoiceQuery()
```

- [ ] **Step 3: Add `onNavigate` to the `useEntityWorkspace` config call**

In the existing `useEntityWorkspace({...})` call, add `onNavigate` alongside the other config options (after `deleteMutation`):

```ts
onNavigate: (invoice) => {
  void triggerGetInvoice(invoice.id).unwrap().then((fullInvoice) => {
    dispatch(setSelectedInvoice(fullInvoice as any))
  })
},
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|useInvoicesWorkspace"
```

Expected: no errors.

- [ ] **Step 5: Update `InvoicesPage.filterbar.test.tsx` mock**

Open `frontend/src/pages/sales/__tests__/InvoicesPage.filterbar.test.tsx` and remove the six stale nav handler mock entries (around line 52–58):

```ts
// DELETE these lines from the mock:
handleNavigateUp: vi.fn(),
handleNavigateDown: vi.fn(),
handleNavigateToFirst: vi.fn(),
handleNavigateToLast: vi.fn(),
handlePageUpNavigation: vi.fn(),
handlePageDownNavigation: vi.fn(),
```

- [ ] **Step 6: Run invoices tests**

```bash
cd frontend && npx vitest run src/pages/sales/hooks/useInvoicesWorkspace.test.tsx src/pages/sales/__tests__/InvoicesPage.filterbar.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts \
        frontend/src/pages/sales/__tests__/InvoicesPage.filterbar.test.tsx
git commit -m "feat(sales): add onNavigate lazy fetch to useInvoicesWorkspace"
```

---

## Task 5: Add `onNavigate` to `usePaymentsWorkspace`

**Files:**
- Modify: `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`

- [ ] **Step 1: Import `useLazyGetPaymentQuery`**

Add to the imports from `@/store/api/salesApi`:

```ts
import { useLazyGetPaymentQuery } from '@/store/api/salesApi'
```

Verify:
```bash
grep "useLazyGetPaymentQuery" frontend/src/store/api/salesApi.ts
```
Expected: one matching line.

- [ ] **Step 2: Instantiate the lazy query**

Inside `usePaymentsWorkspace`, after the existing `const [fetchJournalEntries] = useLazyGetJournalEntriesQuery()` line, add:

```ts
const [triggerGetPayment] = useLazyGetPaymentQuery()
```

- [ ] **Step 3: Add `onNavigate` to the `useEntityWorkspace` config call**

In the existing `useEntityWorkspace({...})` call, add `onNavigate` (after `deleteMutation`):

```ts
onNavigate: (payment) => {
  void triggerGetPayment(payment.id).unwrap().then((fullPayment) => {
    dispatch(setSelectedPayment(fullPayment as any))
  })
},
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|usePaymentsWorkspace"
```

Expected: no errors.

- [ ] **Step 5: Update `PaymentsPage.filterbar.test.tsx` mock**

Open `frontend/src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx` and remove the six stale nav handler mock entries (around line 61–67):

```ts
// DELETE these lines from the mock:
handleNavigateUp: vi.fn(),
handleNavigateDown: vi.fn(),
handleNavigateToFirst: vi.fn(),
handleNavigateToLast: vi.fn(),
handlePageUpNavigation: vi.fn(),
handlePageDownNavigation: vi.fn(),
```

- [ ] **Step 6: Run payments tests**

```bash
cd frontend && npx vitest run src/pages/sales/hooks/usePaymentsWorkspace.test.tsx src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts \
        frontend/src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx
git commit -m "feat(sales): add onNavigate lazy fetch to usePaymentsWorkspace"
```

---

## Task 6: Add `onNavigate` to `CustomersPage`

**Files:**
- Modify: `frontend/src/pages/sales/CustomersPage.tsx`

- [ ] **Step 1: Import `useLazyGetCustomerQuery`**

`CustomersPage.tsx` already imports from `@/store/api/salesApi`. Add `useLazyGetCustomerQuery` to that import:

```ts
import {
  useDeleteCustomerMutation,
  useGetCustomersQuery,
  useLazyGetCustomerQuery,
} from '@/store/api/salesApi'
```

Verify:
```bash
grep "useLazyGetCustomerQuery" frontend/src/store/api/salesApi.ts
```
Expected: one matching line.

- [ ] **Step 2: Instantiate the lazy query**

Inside `CustomersPage`, after the existing `const [deleteCustomer] = useDeleteCustomerMutation()` line, add:

```ts
const [triggerGetCustomer] = useLazyGetCustomerQuery()
```

- [ ] **Step 3: Add `onNavigate` to the `useEntityWorkspace` config call**

In the existing `useEntityWorkspace({...})` call (around line 75), add `onNavigate` after `deleteMutation`:

```ts
onNavigate: (customer) => {
  void triggerGetCustomer(customer.id).unwrap().then((fullCustomer) => {
    dispatch(setSelectedCustomer(fullCustomer))
  })
},
```

- [ ] **Step 4: Type-check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error|CustomersPage"
```

Expected: no errors.

- [ ] **Step 5: Run customers tests**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CustomersPage.filter.test.tsx src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/sales/CustomersPage.tsx
git commit -m "feat(sales): add onNavigate lazy fetch to CustomersPage"
```

---

## Task 7: Final Verification

- [ ] **Step 1: Run all affected test files**

```bash
cd frontend && npx vitest run \
  src/hooks/useEntityWorkspace.test.ts \
  src/pages/sales/hooks/useOrdersWorkspace.test.tsx \
  src/pages/sales/hooks/useInvoicesWorkspace.test.tsx \
  src/pages/sales/hooks/usePaymentsWorkspace.test.tsx \
  src/pages/sales/__tests__/OrdersPage.filterbar.test.tsx \
  src/pages/sales/__tests__/InvoicesPage.filterbar.test.tsx \
  src/pages/sales/__tests__/PaymentsPage.filterbar.test.tsx \
  src/pages/sales/__tests__/CustomersPage.filter.test.tsx \
  src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx
```

Expected: all PASS.

- [ ] **Step 2: Full type-check**

```bash
cd frontend && npm run type-check
```

Expected: zero errors.

- [ ] **Step 3: Open a PR**

```bash
gh pr create \
  --title "feat(workspace): standardize keyboard navigation with onNavigate callback" \
  --body "$(cat <<'EOF'
## Summary
- Adds optional `onNavigate` callback to `useEntityWorkspace` — fires on keyboard navigation (arrow/pgUp/pgDn/home/end), not on click
- Removes duplicate `useKeyboardShortcuts` registration from `useOrdersWorkspace` (was registering two listeners for the same keys)
- Invoices, Payments, and Customers now trigger a lazy API fetch on keyboard navigation, matching Sales Orders behavior

Closes #426
EOF
)"
```
