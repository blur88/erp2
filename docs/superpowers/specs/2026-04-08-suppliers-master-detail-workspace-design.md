# Suppliers Page — MasterDetailWorkspace Refactor

**Issue:** #312  
**Date:** 2026-04-08  
**Pattern reference:** `CustomersPage.tsx` / `CustomerFormPage.tsx`

---

## Objective

Refactor `SuppliersPage.tsx` from a flat Table + Dialog pattern to the established `MasterDetailWorkspace` layout used by `CustomersPage.tsx`. Includes backend endpoints for per-supplier history, type cleanup, and full keyboard navigation.

---

## Scope

- Backend: 3 new read-only supplier history endpoints
- Frontend: MasterDetailWorkspace layout + extracted hooks + sub-components + form page
- Type cleanup: address fields added to `Supplier` interface, `as any` casts removed
- Router: 2 new routes for create/edit form
- Tests: component tests for `SupplierContextHeader` and `SupplierWorkspaceCard`

---

## Backend

### New Endpoints (supplier.controller.ts / supplier.service.ts)

All three are read-only, guard-protected, scoped to a supplier by UUID.

**`GET /purchasing/suppliers/:id/purchase-orders`**
- Returns POs for the supplier, ordered by `orderDate DESC`, limit 50
- Response: `{ data: PurchaseOrder[], total: number }`
- Implementation: query `purchase_orders` filtered by `supplierId`

**`GET /purchasing/suppliers/:id/grns`**
- Returns GRNs linked to the supplier via their parent PO
- Response: `{ data: GoodsReceivedNote[], total: number }`
- Implementation: join GRN → PO → supplier, ordered by `receivedDate DESC`, limit 50

**`GET /purchasing/suppliers/:id/payments`**
- Returns vendor payments for the supplier, ordered by `paymentDate DESC`, limit 50
- Response: `{ data: VendorPayment[], total: number }`
- Implementation: query `vendor_payments` filtered by `supplierId`

No new entities, DTOs, or migrations required — reuses existing types.

---

## Type Changes

### `frontend/src/types/index.ts`

Add to `Supplier` interface:
```ts
isActive: boolean
streetAddress?: string | null
city?: string | null
state?: string | null
postalCode?: string | null
country?: string | null
```

Remove all `(supplier as any).streetAddress` etc. casts in `SuppliersPage.tsx`.

### `frontend/src/store/slices/purchasingSlice.ts`

Add to `PurchasingState`:
```ts
selectedSupplier: Supplier | null
```

Add reducer: `setSelectedSupplier(state, action: PayloadAction<Supplier | null>)`  
Add selector: `selectSelectedSupplier = (state: RootState) => state.purchasing.selectedSupplier`

### `frontend/src/store/api/purchasingApi.ts`

Add 3 query endpoints:
- `getSupplierPurchaseOrders(id: string)`
- `getSupplierGRNs(id: string)`
- `getSupplierPayments(id: string)`

---

## Frontend File Structure

### New files

```
frontend/src/pages/purchasing/
  SupplierFormPage.tsx
  components/
    SupplierList.tsx
    SupplierContextHeader.tsx
    SupplierWorkspaceCard.tsx
    SuppliersDialogs.tsx
    __tests__/
      SupplierContextHeader.test.tsx
      SupplierWorkspaceCard.test.tsx
  hooks/
    useSuppliersPageState.ts
    useSuppliersSelection.ts
    useSuppliersActions.ts
```

### Modified files

- `frontend/src/pages/purchasing/SuppliersPage.tsx` — gutted to ~100 lines
- `frontend/src/router.tsx` — 2 new routes
- `frontend/src/store/slices/purchasingSlice.ts` — selectedSupplier state
- `frontend/src/store/api/purchasingApi.ts` — 3 new query endpoints
- `frontend/src/types/index.ts` — Supplier interface address fields
- `backend/src/modules/purchasing/controllers/supplier.controller.ts` — 3 new routes
- `backend/src/modules/purchasing/services/supplier.service.ts` — 3 new service methods

---

## Component Designs

### `SuppliersPage.tsx` (refactored)

Mirrors `CustomersPage.tsx` exactly:
- `useAppSelector(selectSelectedSupplier)` for selected state
- `useSuppliersPageState()`, `useSuppliersSelection()`, `useSuppliersActions()` hooks
- `MasterDetailWorkspace` with `listSlot`, `headerSlot`, `workspaceSlot`
- `FilterBar` with search + status filter
- `PageHeader` with "New Supplier" primary action, "View Deleted" secondary action
- `SuppliersDialogs` for delete confirm + deleted dialog

### `useSuppliersPageState.ts`

State: `deleteConfirmOpen`, `deletedSuppliersDialogOpen`, `focusedSupplierIndex`, `shouldPreserveSearchFocus`  
Refs: `supplierListRef`, `searchInputRef`

### `useSuppliersSelection.ts`

- Auto-selects first supplier on load
- Dispatches `setSelectedSupplier` on click or keyboard navigation
- Scroll-into-view on keyboard move
- Handles: `handleSupplierSelect`, `handleNavigateUp/Down`, `handleNavigateToFirst/Last`, `handlePageUp/DownNavigation`, `handleEnterAction` (→ `/purchasing/suppliers/:id/edit`), `handleEscapeAction`

### `useSuppliersActions.ts`

- `handleDelete`: calls `deleteSupplier`, dispatches `setSelectedSupplier(null)`, closes dialog, refetches
- `handleCancelDelete`: closes dialog

### `SupplierList.tsx`

- Single-column table list of supplier company names
- Header: "Suppliers (N)" count
- Selected row: `action.selected` background
- Focused row: `action.focus` + primary outline (keyboard focus indicator)
- `data-supplier-index` attribute on each row for scroll-into-view
- Loading skeletons (10 rows) on initial load

### `SupplierContextHeader.tsx`

Header bar with company name + edit/delete icon buttons.

Two-column detail table:
- Left: Supplier Information (type chip, status, contact person, phone, address)
- Right: Purchase Statistics (total orders, total purchases, avg order value, first/last purchase date)

Empty state: "Select a supplier to view details"

### `SupplierWorkspaceCard.tsx`

Three tabs, each lazy-loaded on first visit:

| Tab | API endpoint | Columns |
|-----|-------------|---------|
| Purchase Orders | `GET /purchasing/suppliers/:id/purchase-orders` | Order #, Date, Status, Total |
| GRNs | `GET /purchasing/suppliers/:id/grns` | GRN #, Date, PO #, Status |
| Payments | `GET /purchasing/suppliers/:id/payments` | Payment #, Date, Method, Amount |

PO rows are clickable → navigate to `/purchasing/orders/:id/edit`.  
Empty state per tab when no records.

### `SuppliersDialogs.tsx`

Wraps:
- `ConfirmationDialog` for delete (same props pattern as `CustomersDialogs.tsx`)
- `DeletedSuppliersDialog` (existing component, reused as-is)

### `SupplierFormPage.tsx`

Mirrors `CustomerFormPage.tsx`:
- `useParams` for `id` (edit mode when present)
- Loads supplier via `api.get(/purchasing/suppliers/:id)` on mount
- Same form fields as current dialog: type, companyName, contactPerson, phone, address fields, notes
- Preserves duplicate company name check (debounced, 500ms)
- On save: navigates back to `/purchasing/suppliers`
- `PageHeader` with title "New Supplier" / "Edit Supplier"

---

## Routing

```ts
// router.tsx additions (before parameterized routes)
{ path: '/purchasing/suppliers/create', element: <SupplierFormPage />, handle: { title: 'New Supplier' } },
{ path: '/purchasing/suppliers/:id/edit', element: <SupplierFormPage />, handle: { title: 'Edit Supplier' } },
```

Existing route `/purchasing/suppliers` unchanged.

---

## Keyboard Navigation

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate list, select supplier |
| `PageUp` / `PageDown` | Jump ±20 rows |
| `Home` / `End` | First / last supplier |
| `Enter` | Navigate to edit form |
| `Escape` | Clear selection, close dialogs |
| `/` or `Ctrl+F` | Focus search input |

---

## Tests

- `SupplierContextHeader.test.tsx` — renders empty state, renders supplier details, edit/delete button callbacks
- `SupplierWorkspaceCard.test.tsx` — renders empty state, tab switching, loading states
- Existing `SuppliersPage.filterbar.test.tsx` — update to work with refactored page (mock new hooks)
