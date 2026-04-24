# Design: Standardize Workspace Keyboard Navigation (Issue #426)

## Problem

Keyboard navigation is inconsistent across the four main Sales workspace pages:

- **Sales Orders**: Navigation keystrokes trigger a lazy API fetch (`triggerGetSalesOrder`) to load full order details. However, `useOrdersWorkspace` achieves this by registering a second `useKeyboardShortcuts` listener on top of the one already inside `useEntityWorkspace`, causing duplicate event listeners and duplicated navigation logic.
- **Invoices / Payments / Customers**: Navigation keystrokes only move the visual focus indicator. No API fetch is triggered, so the detail panel shows only list-level data.

## Goal

- All four pages trigger a lazy API fetch when the user navigates with keyboard.
- Remove the duplicate `useKeyboardShortcuts` registration in `useOrdersWorkspace`.
- Keyboard navigation behavior (Arrow keys, PgUp/PgDn, Home/End) is identical across all workspace pages.

## Approach: `onNavigate` callback in `useEntityWorkspace`

Add one optional callback to `UseEntityWorkspaceConfig`:

```ts
onNavigate?: (entity: T, index: number) => void
```

`selectAtIndex` — the internal function called by every keyboard navigation handler — calls `onNavigate` after updating focused index and selecting the entity:

```ts
const selectAtIndex = useCallback((index: number) => {
  const entity = entities[index]
  if (!entity) return
  setFocusedIndex(index)
  selectEntity(entity)
  onNavigate?.(entity, index)
}, [entities, selectEntity, onNavigate])
```

`handleSelect` (mouse click) does NOT call `onNavigate`. Click handlers in each page already load full details on click and remain unchanged.

## File-by-File Changes

### 1. `frontend/src/hooks/useEntityWorkspace.ts`

- Add `onNavigate?: (entity: T, index: number) => void` to `UseEntityWorkspaceConfig`.
- Destructure `onNavigate` from config.
- Call `onNavigate?.(entity, index)` inside `selectAtIndex` after `selectEntity(entity)`.
- Add `onNavigate` to the `useCallback` dependency array of `selectAtIndex`.

### 2. `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`

- Remove the second `useKeyboardShortcuts` call (currently lines 839–852).
- Remove the six custom navigation handlers: `handleNavigateUp`, `handleNavigateDown`, `handleNavigateToFirst`, `handleNavigateToLast`, `handlePageUpNavigation`, `handlePageDownNavigation`.
- Remove `selectAndLoadOrder` helper (its logic moves into `onNavigate`).
- Add `onNavigate` to the `useEntityWorkspace` config:

```ts
onNavigate: (order) => {
  void triggerGetSalesOrder(order.id).unwrap().then((fullOrder) => {
    dispatch(setSelectedOrder(fullOrder))
  })
  userHasNavigatedRef.current = true
},
```

- Stop re-exporting the six removed navigation handlers from the return object (consumers use the base workspace spread).

### 3. `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`

- Import `useLazyGetInvoiceQuery` from `salesApi`.
- Add `onNavigate` to `useEntityWorkspace` config:

```ts
onNavigate: (invoice) => {
  void triggerGetInvoice(invoice.id).unwrap().then((fullInvoice) => {
    dispatch(setSelectedInvoice(fullInvoice as any))
  })
},
```

### 4. `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`

- Import `useLazyGetPaymentQuery` from `salesApi`.
- Add `onNavigate` to `useEntityWorkspace` config:

```ts
onNavigate: (payment) => {
  void triggerGetPayment(payment.id).unwrap().then((fullPayment) => {
    dispatch(setSelectedPayment(fullPayment))
  })
},
```

### 5. `frontend/src/pages/sales/CustomersPage.tsx`

- Import `useLazyGetCustomerQuery` from `salesApi`.
- Add `onNavigate` to `useEntityWorkspace` config:

```ts
onNavigate: (customer) => {
  void triggerGetCustomer(customer.id).unwrap().then((fullCustomer) => {
    dispatch(setSelectedCustomer(fullCustomer))
  })
},
```

## Visual Consistency

No changes needed. All four tables already pass `focusedIndex` to the shared `EntityTable` component which handles highlight styling uniformly.

## What Does NOT Change

- Click (`handleSelect` / row `onClick`) behavior on any page.
- `handleOrderSelect` in `useOrdersWorkspace` (explicit click handler, keeps its own fetch).
- `userHasNavigatedRef` and all highlight/pending-order logic in `useOrdersWorkspace`.
- Any other workspace hooks (accounting, inventory, purchasing) — they don't need `onNavigate`.

## Success Criteria

- [ ] `useEntityWorkspace` supports optional `onNavigate` callback.
- [ ] `useOrdersWorkspace` has no duplicate `useKeyboardShortcuts` call.
- [ ] Arrow/PgUp/PgDn/Home/End navigation triggers a full-detail API fetch on all four pages.
- [ ] Click selection behavior is unchanged on all four pages.
- [ ] Existing tests pass; new tests cover `onNavigate` in `useEntityWorkspace`.
