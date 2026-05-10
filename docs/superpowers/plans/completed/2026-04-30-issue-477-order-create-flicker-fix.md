# Issue #477 — Order Create Flicker Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the workspace card flicker when navigating from the create order page back to the orders list, in both Sales and Purchasing modules.

**Architecture:** Two coordinated fixes — (1) dispatch the newly created order into Redux before navigating so the list page has a non-null selection on mount; (2) add an `isLoading` guard to `useEntityWorkspace` so it never clears a valid selection while the entity list is mid-fetch.

**Tech Stack:** React 19, Redux Toolkit, RTK Query, React Router, Vitest

---

## File Map

| File | Change |
|---|---|
| `frontend/src/hooks/useEntityWorkspace.ts` | Add optional `isLoading` to config; guard clear-on-empty effect |
| `frontend/src/hooks/useEntityWorkspace.test.ts` | Add test: does not clear selection while loading |
| `frontend/src/pages/sales/CreateSalesOrderPage.tsx` | Dispatch `setSelectedOrder` before navigate in create branch |
| `frontend/src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx` | Verify dispatch fires on create |
| `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts` | Pass `isLoading` to config interface; forward from caller |
| `frontend/src/pages/sales/hooks/useOrdersWorkspace.test.tsx` | Pass `isLoading: false` to all `renderOrdersWorkspace` calls |
| `frontend/src/pages/sales/OrdersPage.tsx` | Pass `isLoading: loading` to `useOrdersWorkspace` |
| `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx` | Dispatch `setSelectedPurchaseOrder` before navigate in create branch; add import |
| `frontend/src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx` | Verify dispatch fires on create |
| `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts` | Add `isLoading` to config interface; forward from caller |
| `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.test.tsx` | Pass `isLoading: false` to all `renderPurchaseOrdersWorkspace` calls |
| `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` | Pass `isLoading: loading` to `usePurchaseOrdersWorkspace` |

---

## Task 1: Guard `useEntityWorkspace` against clearing selection while loading

**Files:**
- Modify: `frontend/src/hooks/useEntityWorkspace.ts:8-28` (config interface and effect)
- Test: `frontend/src/hooks/useEntityWorkspace.test.ts`

- [ ] **Step 1: Write the failing test**

Open `frontend/src/hooks/useEntityWorkspace.test.ts` and add this test inside the `describe('useEntityWorkspace')` block (after the existing tests):

```ts
it('does not clear selection when entities list is empty but isLoading is true', () => {
  const config = makeConfig({
    entities: [],
    selectedEntity: makeEntity('1'),
    isLoading: true,
  })

  renderHook(() => useEntityWorkspace(config), { wrapper: makeWrapper('/entities') })

  expect(config.selectEntity).not.toHaveBeenCalledWith(null)
})
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd frontend && npx vitest run src/hooks/useEntityWorkspace.test.ts --no-coverage
```

Expected: FAIL — `selectEntity` is called with `null` because the guard doesn't exist yet.

- [ ] **Step 3: Add `isLoading` to the config interface and guard the effect**

In `frontend/src/hooks/useEntityWorkspace.ts`, make these two changes:

**Change 1** — add `isLoading` to the interface (after `locationStateHighlightKeys`):

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
  highlightParam?: string
  locationStateHighlightKey?: string
  locationStateHighlightKeys?: string[]
  isLoading?: boolean
}
```

**Change 2** — destructure `isLoading` and guard the clear-on-empty effect. In the function body, add `isLoading = false` to the destructure:

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
  highlightParam,
  locationStateHighlightKey,
  locationStateHighlightKeys,
  isLoading = false,
} = config
```

Then update the effect (currently lines 86-120) — change the empty-list guard:

```ts
useEffect(() => {
  if (entities.length === 0) {
    hasAutoSelected.current = false
    setFocusedIndex(-1)
    if (!isLoading) {
      selectEntity(null)
    }
    return
  }

  // ... rest of the effect unchanged ...
}, [entities, focusedIndex, highlightParam, isLoading, location.state, locationStateHighlightKey, locationStateHighlightKeys, searchParams, selectedEntity, selectEntity])
```

Note: add `isLoading` to the dependency array of this effect.

- [ ] **Step 4: Run the test to verify it passes**

```bash
cd frontend && npx vitest run src/hooks/useEntityWorkspace.test.ts --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
cd frontend && git add src/hooks/useEntityWorkspace.ts src/hooks/useEntityWorkspace.test.ts
git commit -m "fix(workspace): guard against clearing selection while entity list is loading"
```

---

## Task 2: Fix `useOrdersWorkspace` — add `isLoading` to config and update callers

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`
- Modify: `frontend/src/pages/sales/hooks/useOrdersWorkspace.test.tsx`
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`

- [ ] **Step 1: Update the test helper to pass `isLoading`**

In `frontend/src/pages/sales/hooks/useOrdersWorkspace.test.tsx`, update `renderOrdersWorkspace` to pass `isLoading: false`:

```ts
const result = renderHook(
  () =>
    useOrdersWorkspace({
      dispatch: store.dispatch,
      getState: () => store.getState() as any,
      orders: [makeOrder('ord-1') as any, makeOrder('ord-2') as any],
      selectedOrder: null,
      refetchOrders: vi.fn(),
      isLoading: false,
    }),
  { wrapper },
)
```

Also update the two inline `renderHook` calls inside individual test cases (the ones that pass their own config object directly) — search for all occurrences of `useOrdersWorkspace({` in the file and add `isLoading: false` to each.

- [ ] **Step 2: Run the workspace tests to confirm they still pass (they should, since `isLoading` will be optional with a default)**

```bash
cd frontend && npx vitest run src/pages/sales/hooks/useOrdersWorkspace.test.tsx --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 3: Add `isLoading` to `UseOrdersWorkspaceConfig` and destructure it**

In `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`, update the config interface:

```ts
interface UseOrdersWorkspaceConfig {
  dispatch: AppDispatch
  getState: () => RootState
  orders: SalesOrder[]
  selectedOrder: SalesOrder | null
  refetchOrders: () => void
  isLoading: boolean
}
```

And in the function signature destructure:

```ts
export function useOrdersWorkspace({
  dispatch,
  getState,
  orders,
  selectedOrder,
  refetchOrders,
  isLoading,
}: UseOrdersWorkspaceConfig) {
```

Then find the effect that calls `dispatch(setSelectedOrder(null))` when `orders.length === 0` (around line 235) and pass `isLoading` through to `useEntityWorkspace`. The `useOrdersWorkspace` hook instantiates `useEntityWorkspace` via the `workspace` call — update that call to forward `isLoading`:

```ts
const workspace = useEntityWorkspace({
  entities: orders,
  selectedEntity: selectedOrder,
  selectEntity: (order) => dispatch(setSelectedOrder(order)),
  refetch: refetchOrders,
  navigate,
  highlightParam: 'highlight',
  routes: {
    create: '/sales/orders/create',
    edit: (id) => `/sales/orders/${id}/edit`,
  },
  notifications: { showSuccess: () => {}, showError: () => {} },
  deleteMutation: async () => {},
  isLoading,
  onEnter: () => { ... },
  onEscape: () => { ... },
})
```

Also find the manual clear-on-empty effect in `useOrdersWorkspace` itself (around line 214-240, the effect that calls `dispatch(setSelectedOrder(null))` and `dispatch(clearError())` when `orders.length === 0`) and add the same guard:

```ts
} else if (orders.length === 0) {
  if (!isLoading) {
    dispatch(setSelectedOrder(null))
    dispatch(clearError())
    workspace.setFocusedIndex(-1)
  }
}
```

- [ ] **Step 4: Pass `isLoading` from `OrdersPage` into the hook**

In `frontend/src/pages/sales/OrdersPage.tsx`, update the `useOrdersWorkspace` call (around line 112):

```ts
const workspace = useOrdersWorkspace({
  dispatch,
  getState: () => store.getState() as RootState,
  orders,
  selectedOrder,
  refetchOrders: loadOrders,
  isLoading: loading,
})
```

(`loading` is already available from `const { data: ordersData, isLoading: loading, ... } = useGetSalesOrdersQuery(...)` at line 104.)

- [ ] **Step 5: Run all sales workspace tests**

```bash
cd frontend && npx vitest run src/pages/sales/hooks/useOrdersWorkspace.test.tsx --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS|useOrdersWorkspace|OrdersPage" | head -20
```

Expected: no errors related to the changed files.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/pages/sales/hooks/useOrdersWorkspace.ts src/pages/sales/hooks/useOrdersWorkspace.test.tsx src/pages/sales/OrdersPage.tsx
git commit -m "fix(sales): forward isLoading into orders workspace to guard selection clear"
```

---

## Task 3: Fix `usePurchaseOrdersWorkspace` — add `isLoading` to config and update callers

**Files:**
- Modify: `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts`
- Modify: `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.test.tsx`
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`

- [ ] **Step 1: Update the test helper to pass `isLoading`**

In `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.test.tsx`, update `renderPurchaseOrdersWorkspace` to pass `isLoading: false`:

```ts
const result = renderHook(
  ({ purchaseOrders }) =>
    usePurchaseOrdersWorkspace({
      dispatch: store.dispatch,
      purchaseOrders,
      selectedOrder: null,
      refetchOrders: vi.fn(),
      isLoading: false,
    }),
  { wrapper, initialProps: { purchaseOrders: initialPurchaseOrders } },
)
```

Also find any other inline `usePurchaseOrdersWorkspace({` calls in the test file and add `isLoading: false` to each.

- [ ] **Step 2: Run the workspace tests to confirm they pass**

```bash
cd frontend && npx vitest run src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.test.tsx --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 3: Add `isLoading` to `UsePurchaseOrdersWorkspaceConfig` and forward it**

In `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts`, update the config interface:

```ts
export interface UsePurchaseOrdersWorkspaceConfig {
  dispatch: AppDispatch
  purchaseOrders: PurchaseOrder[]
  selectedOrder: PurchaseOrder | null
  refetchOrders: () => void
  isLoading: boolean
}
```

Destructure it in the function:

```ts
export function usePurchaseOrdersWorkspace({
  dispatch,
  purchaseOrders,
  selectedOrder,
  refetchOrders,
  isLoading,
}: UsePurchaseOrdersWorkspaceConfig) {
```

Forward it to `useEntityWorkspace`:

```ts
const workspace = useEntityWorkspace({
  entities: purchaseOrders,
  selectedEntity: selectedOrder,
  selectEntity: (order) => dispatch(setSelectedPurchaseOrder(order)),
  refetch: refetchOrders,
  navigate,
  highlightParam: 'highlight',
  routes: {
    create: '/purchasing/orders/create',
    edit: (id) => `/purchasing/orders/${id}/edit`,
  },
  notifications: { showSuccess, showError },
  deleteMutation: async (id) => {
    await deletePurchaseOrder(id).unwrap()
  },
  isLoading,
  onEscape: () => {
    dispatch(setSelectedPurchaseOrder(null))
    setDeleteConfirmOpen(false)
    setBlockedDialogOpen(false)
    setDeletedOrdersDialogOpen(false)
  },
})
```

- [ ] **Step 4: Pass `isLoading` from `PurchaseOrdersPage` into the hook**

In `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`, update the `usePurchaseOrdersWorkspace` call (around line 116):

```ts
const workspace = usePurchaseOrdersWorkspace({
  dispatch,
  purchaseOrders,
  selectedOrder,
  refetchOrders: loadOrders,
  isLoading: loading,
})
```

(`loading` is already available as `isFetching: loading` from `useGetPurchaseOrdersQuery` at line 101.)

- [ ] **Step 5: Run all purchasing workspace tests**

```bash
cd frontend && npx vitest run src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.test.tsx --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS|usePurchaseOrders|PurchaseOrdersPage" | head -20
```

Expected: no errors related to the changed files.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.test.tsx src/pages/purchasing/PurchaseOrdersPage.tsx
git commit -m "fix(purchasing): forward isLoading into purchase orders workspace to guard selection clear"
```

---

## Task 4: Pre-populate Redux before navigating — Sales Orders create page

**Files:**
- Modify: `frontend/src/pages/sales/CreateSalesOrderPage.tsx`
- Test: `frontend/src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx`

- [ ] **Step 1: Check what the existing create test does**

```bash
cd frontend && grep -n "createSalesOrder\|navigate\|setSelectedOrder\|dispatch" src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx | head -30
```

This tells you what mocks are already in place.

- [ ] **Step 2: Add a failing test verifying `setSelectedOrder` is dispatched on create**

Open `frontend/src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx`. Find the test that covers successful order creation and verify it asserts on the Redux dispatch. If no such assertion exists, add one.

The test should confirm that after a successful create, `setSelectedOrder` is dispatched with the created order before `navigate` is called. Look for the mock setup for `useCreateSalesOrderMutation` — it returns a fake order. The test should then check:

```ts
// After form submission succeeds:
expect(mockDispatch).toHaveBeenCalledWith(
  expect.objectContaining({
    type: expect.stringContaining('setSelectedOrder'),
    payload: expect.objectContaining({ id: 'new-order-id' }),
  })
)
```

If `mockDispatch` is not already set up in the test file, add it by mocking `useAppDispatch`:

```ts
const mockDispatch = vi.fn()
vi.mock('@/hooks/useRedux', () => ({
  useAppDispatch: () => mockDispatch,
  useAppSelector: vi.fn(),
}))
```

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx --no-coverage
```

Expected: FAIL — `setSelectedOrder` is not dispatched in the create branch yet.

- [ ] **Step 4: Dispatch `setSelectedOrder` before `navigate` in the create branch**

In `frontend/src/pages/sales/CreateSalesOrderPage.tsx`, find the create branch in `onSubmit` (around line 347). Change it from:

```ts
const createdOrder = await createSalesOrder(orderData as any).unwrap()
const newOrderId = (createdOrder as any).id
showSuccess('Sales order created successfully')
navigate(`/sales/orders?highlight=${newOrderId}`)
```

To:

```ts
const createdOrder = await createSalesOrder(orderData as any).unwrap()
dispatch(setSelectedOrder(createdOrder as any))
showSuccess('Sales order created successfully')
navigate(`/sales/orders?highlight=${(createdOrder as any).id}`)
```

(`setSelectedOrder` and `dispatch` are already imported and available in this file.)

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd frontend && npx vitest run src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd frontend && git add src/pages/sales/CreateSalesOrderPage.tsx src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx
git commit -m "fix(sales): dispatch setSelectedOrder before navigating after order create"
```

---

## Task 5: Pre-populate Redux before navigating — Purchase Orders create page

**Files:**
- Modify: `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`
- Test: `frontend/src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx`

- [ ] **Step 1: Check what the existing create test does**

```bash
cd frontend && grep -n "createPurchaseOrder\|navigate\|setSelectedPurchaseOrder\|dispatch" src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx | head -30
```

- [ ] **Step 2: Add a failing test verifying `setSelectedPurchaseOrder` is dispatched on create**

Open `frontend/src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx`. Add an assertion in the successful-create test that `setSelectedPurchaseOrder` is dispatched with the created order before `navigate`:

```ts
expect(mockDispatch).toHaveBeenCalledWith(
  expect.objectContaining({
    type: expect.stringContaining('setSelectedPurchaseOrder'),
    payload: expect.objectContaining({ id: 'new-po-id' }),
  })
)
```

If `mockDispatch` is not set up, add it the same way as Task 4 Step 2.

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx --no-coverage
```

Expected: FAIL — `setSelectedPurchaseOrder` is not dispatched in the create branch yet.

- [ ] **Step 4: Add the import and dispatch in the create branch**

In `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`:

**Add the import** (the file already imports from `purchasingSlice` for `updatePurchaseOrderInPlace` — add `setSelectedPurchaseOrder` to the same import):

```ts
import { updatePurchaseOrderInPlace, setSelectedPurchaseOrder } from '@/store/slices/purchasingSlice'
```

**Update the create branch** in `onSubmit` (around line 272) from:

```ts
const result = await createPurchaseOrder(orderData as any).unwrap()
const newOrderId = (result as any).id
showSuccess('Purchase order created successfully')
navigate(`/purchasing/orders?highlight=${newOrderId}`)
```

To:

```ts
const result = await createPurchaseOrder(orderData as any).unwrap()
dispatch(setSelectedPurchaseOrder(result as any))
showSuccess('Purchase order created successfully')
navigate(`/purchasing/orders?highlight=${(result as any).id}`)
```

(`dispatch` is already available from `useAppDispatch` in this file.)

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 6: TypeScript check across all changed files**

```bash
cd frontend && npm run type-check 2>&1 | grep "error TS" | head -20
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
cd frontend && git add src/pages/purchasing/CreatePurchaseOrderPage.tsx src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx
git commit -m "fix(purchasing): dispatch setSelectedPurchaseOrder before navigating after order create"
```

---

## Task 6: Final verification

- [ ] **Step 1: Run the full set of affected test files**

```bash
cd frontend && npx vitest run \
  src/hooks/useEntityWorkspace.test.ts \
  src/pages/sales/hooks/useOrdersWorkspace.test.tsx \
  src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.test.tsx \
  src/pages/sales/__tests__/CreateSalesOrderPage.test.tsx \
  src/pages/purchasing/__tests__/CreatePurchaseOrderPage.test.tsx \
  --no-coverage
```

Expected: all tests PASS.

- [ ] **Step 2: Full TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep "error TS" | head -20
```

Expected: no errors.

- [ ] **Step 3: Open a PR closing issue #477**

```bash
gh pr create \
  --title "fix: eliminate workspace card flicker after creating sales/purchase orders" \
  --body "$(cat <<'EOF'
## Summary

- Dispatch `setSelectedOrder` / `setSelectedPurchaseOrder` before navigating after a successful create, so the list page has a non-null selection on mount
- Add `isLoading` prop to `useEntityWorkspace` to guard against clearing a valid selection when the entity list is momentarily empty during an RTK Query refetch
- Forward `isLoading` from both `OrdersPage` and `PurchaseOrdersPage` into their respective workspace hooks

Closes #477

## Test plan

- [ ] Create a new sales order → lands on list page with workspace card populated instantly (no flicker)
- [ ] Create a new purchase order → same result
- [ ] Edit an existing order → workspace card still shows correctly on return
- [ ] Filter the orders list → filtering still works, selection clears correctly when list is empty after filter
- [ ] All affected unit tests pass

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
