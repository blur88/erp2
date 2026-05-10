# Design: Fix UI Flicker After Creating Sales/Purchase Orders

**Issue:** #477
**Date:** 2026-04-30
**Scope:** Sales Orders, Purchase Orders

---

## Problem

When a user creates a new sales or purchase order and is navigated back to the list page, the workspace card (details panel) flickers — it briefly shows empty or the wrong order before populating correctly.

**Root causes (two independent paths to the same symptom):**

1. **Missing pre-navigation dispatch.** The create branch in `CreateSalesOrderPage` and `CreatePurchaseOrderPage` does not dispatch `setSelectedOrder` before calling `navigate()`. The edit branch already does this correctly. When the list page mounts with `selectedOrder === null`, `useEntityWorkspace` auto-selects order[0] instead of the newly created order, causing a visible jump when the highlight logic eventually fires.

2. **Clear-on-empty-list race.** `useOrdersWorkspace` clears `selectedOrder` when `orders.length === 0`. During the initial RTK Query refetch on mount, the list is momentarily empty. Even if the Redux state was pre-populated (fix #1), this effect fires and wipes it out before the list arrives.

---

## Solution

Two coordinated changes per module.

### Part 1 — Dispatch before navigation (Create pages)

**`frontend/src/pages/sales/CreateSalesOrderPage.tsx`**

In the create branch of `onSubmit` (currently ~line 347), dispatch `setSelectedOrder` immediately after a successful create and before `navigate()`:

```ts
const createdOrder = await createSalesOrder(orderData as any).unwrap()
dispatch(setSelectedOrder(createdOrder))           // add this line
showSuccess('Sales order created successfully')
navigate(`/sales/orders?highlight=${createdOrder.id}`)
```

Also clean up the intermediate `newOrderId` variable — use `createdOrder.id` directly.

**`frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx`**

Same pattern in the create branch (~line 272). Also requires adding the import for `setSelectedPurchaseOrder` from `@/store/slices/purchasingSlice`:

```ts
const result = await createPurchaseOrder(orderData as any).unwrap()
dispatch(setSelectedPurchaseOrder(result))         // add this line
showSuccess('Purchase order created successfully')
navigate(`/purchasing/orders?highlight=${result.id}`)
```

### Part 2 — Guard clear-on-empty during load (Workspace hooks)

**`frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`**

Add `isLoading: boolean` to `UseOrdersWorkspaceConfig`. In the effect that clears `selectedOrder` when the list is empty, skip the clear while loading:

```ts
// Config interface:
interface UseOrdersWorkspaceConfig {
  ...
  isLoading: boolean
}

// Effect guard (currently ~line 235):
} else if (orders.length === 0 && !isLoading) {
  dispatch(setSelectedOrder(null))
  dispatch(clearError())
  workspace.setFocusedIndex(-1)
}
```

**`frontend/src/pages/sales/OrdersPage.tsx`**

Pass `loading` (already available from `useGetSalesOrdersQuery`) into the workspace hook:

```ts
const workspace = useOrdersWorkspace({
  dispatch,
  getState: () => store.getState() as RootState,
  orders,
  selectedOrder,
  refetchOrders: loadOrders,
  isLoading: loading,    // add this
})
```

**`frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts`**

Add `isLoading: boolean` to `UsePurchaseOrdersWorkspaceConfig` and guard the equivalent clear-on-empty effect.

**`frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`** (or equivalent)

Pass `loading` from `useGetPurchaseOrdersQuery` into the workspace hook.

---

## Files Changed

| File | Change |
|---|---|
| `frontend/src/pages/sales/CreateSalesOrderPage.tsx` | Dispatch `setSelectedOrder` before navigate in create branch |
| `frontend/src/pages/purchasing/CreatePurchaseOrderPage.tsx` | Dispatch `setSelectedPurchaseOrder` before navigate in create branch; add import |
| `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts` | Add `isLoading` to config; guard clear-on-empty effect |
| `frontend/src/pages/sales/OrdersPage.tsx` | Pass `isLoading` to workspace hook |
| `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts` | Add `isLoading` to config; guard clear-on-empty effect |
| `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` | Pass `isLoading` to workspace hook |

---

## Testing

- **Existing tests:** `useOrdersWorkspace.test.tsx` and `usePurchaseOrdersWorkspace.test.tsx` must be updated to pass `isLoading: false` (or appropriate value) in mock configs.
- **Manual verification:** Create order → list page transition is instantaneous for the workspace card. No blank flash, no wrong-order flash.
- **Regression:** Selecting a different order from the list, navigating up/down, and filtering still work correctly.
- **Edge case:** Creating an order when the list is genuinely empty (first order) still auto-selects correctly after load.
