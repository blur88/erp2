# Unified Module Engine Completion — Design Spec

**Date:** 2026-04-15
**Issues:** #372, #374
**Branch:** feat/unified-module-engine-completion

---

## Overview

This spec covers the completion of the unified module engine introduced in PR #373. Three layers of duplication remain: backend service boilerplate, frontend hook triplets, and per-entity list components. This work eliminates all three.

**Scope:**
- Backend: Remove hand-rolled CRUD methods shadowing `BaseCrudService` from 5 remaining services
- Frontend hooks: Collapse 27 hook files (9 triplets) into 9 single domain hooks
- Frontend components: Replace 11 per-entity list components with one generic `EntityTable<T>`

---

## Section 1: Backend

### Step 0 — Fix `BaseCrudService.findDeleted`

`findDeleted` currently calls `applySearch` but not `applyQueryBuilder`. Services with joins in `applyQueryBuilder` (e.g. CustomerService joins priceList) silently return incomplete data from the deleted-items endpoint. Fix:

```ts
// base-crud.service.ts — findDeleted, before getMany()
queryBuilder = this.applyQueryBuilder(queryBuilder, query)  // add this line
const entities = await queryBuilder.getMany()
```

**Before merging this change:** verify each already-migrated service's `applyQueryBuilder` has no joins that conflict with a `withDeleted` query. Known services: Customer (joins priceList — safe), Supplier (similar — safe), VendorPayment, Payment, GRN, StockAdjustment. All confirmed safe before proceeding.

### Per-service changes

All 5 services already declare `extends BaseCrudService` but carry hand-rolled methods that shadow the base. The fix is to delete the shadowing methods and wire query logic through the override hooks.

| Service | Delete | Wire via override |
|---|---|---|
| `SalesOrderService` | `findAll`, `findDeleted`, `restore`, `bulkRestore`, `permanentDelete` (all 1-line delegates to sub-services) | Add `buildWhereClause` + `applySearch` |
| `InvoiceService` | `findDeleted`, `restore`, `bulkRestore` (~200 lines) | Move `findAll` custom joins into `applyQueryBuilder`; `afterDelete` already exists |
| `PurchaseOrderService` | `findDeleted`, `restore`, `bulkRestore`, `permanentDelete`, `remove` (~300 lines) | Move `findAll` custom joins into `applyQueryBuilder` |
| `ProductService` | `restore`, `bulkRestore`, `permanentDelete`, `bulkPermanentDelete` (~350 lines) | Move `findAll` + `findDeleted` joins into `applyQueryBuilder` + `applySearch` |
| `CategoryService` | `restore`, `bulkRestore`, `permanentDelete`, `bulkPermanentDelete` (~250 lines) | Move `findAll` tree branching into `applyQueryBuilder` |

**Domain methods left untouched:** All stock/pricing/import/export methods in ProductService; all tree-traversal methods in CategoryService; all lifecycle/fulfillment/payment methods in SalesOrderService; all send/void/aging methods in InvoiceService; all receiveGoods/returnGoods/payment methods in PurchaseOrderService.

**Net result:** ~1,100 lines deleted. Soft-delete, restore, bulk ops, and audit logging handled uniformly by the base class across all services.

---

## Section 2: Frontend Hooks

### Strategy

Each page currently has 3 hook files: `{entity}PageState.ts` (state declarations), `{entity}Selection.ts` (auto-select, URL sync, keyboard), `{entity}Actions.ts` (domain mutations). These collapse into one `use{Entity}Workspace.ts` per page.

The new domain hook calls `useEntityWorkspace` for all plumbing and adds domain logic on top:

```ts
// Pattern — useOrdersWorkspace.ts
export function useOrdersWorkspace(config) {
  const workspace = useEntityWorkspace({ ... })  // handles all plumbing

  // Domain-only additions:
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false)
  const [blockedDialogOpen, setBlockedDialogOpen] = useState(false)
  const [journalEntryRef, setJournalEntryRef] = useState(null)
  // URL highlight handling, journal entry fetch, domain mutations...

  return { ...workspace, paymentDialogOpen, handleFulfill, handleConfirm, ... }
}
```

### What `useEntityWorkspace` already handles (do not re-implement)

- Auto-select first entity on load
- Keyboard navigation (up/down/pgup/pgdown/home/end/enter/escape)
- `focusedIndex`, `listRef`, `searchInputRef`
- `deleteConfirmOpen`, `deletedEntitiesDialogOpen`
- `handleDelete`, `handleCancelDelete`, `handleSelect`
- Search focus preservation

### What stays in domain hooks

- Domain mutations (confirm/ship/fulfill/pay for orders; receiveGoods/returnGoods for POs; etc.)
- `pendingEntityToSelect` / URL highlight param (`?highlight=id`)
- Journal entry ref fetching (Orders only)
- Location-based navigation selection (`location.state.selectedProductId`)
- Page-specific dialog state (payment dialog, blocked dialog, print dialog)
- Lazy fetch for single entity refresh

### `useEntityWorkspace` changes

None. The existing interface covers everything domain hooks need. Domain hooks spread its return and add their own.

### Consolidation summary

| Page | Before (files / lines) | After (files / lines) | Domain additions |
|---|---|---|---|
| OrdersPage | 3 / 921 | 1 / ~250 | 12 mutations, journal ref, URL highlight, payment dialog, blocked dialog |
| InvoicesPage | 3 / ~700 | 1 / ~200 | send/void/duplicate/allocate mutations, aging dialog |
| PaymentsPage | 2 / ~330 | 1 / ~120 | payment method context, period filter sync |
| PurchaseOrdersPage | 3 / ~557 | 1 / ~200 | receiveGoods/returnGoods/pay mutations, GRN sync |
| GoodsReceivedPage | 2 / ~176 | 1 / ~80 | GRN-specific status context |
| VendorPaymentsPage | 2 / ~176 | 1 / ~80 | vendor payment context |
| StockAdjustmentsPage | 3 / ~499 | 1 / ~150 | adjustment type context, export |
| ProductsPage | 3 / ~373 | 1 / ~150 | export, location nav selection, bulk price update |
| CategoriesPage | 3 / ~363 | 1 / ~150 | tree mode, move category, bulk update |

**Net result:** 27 files → 9 files. ~4,100 lines → ~1,380 lines. ~2,700 lines deleted.

---

## Section 3: `EntityTable<T>`

### Component signature

```ts
interface ColumnConfig<T> {
  key: string
  header?: string          // shown in list header count line; first column used for label
  render: (row: T) => React.ReactNode
  width?: string | number
}

interface EntityTableProps<T extends { id: string }> {
  rows: T[]
  columns: ColumnConfig<T>[]
  loading: boolean
  total: number
  label: string            // e.g. "Orders" — used in header count and empty state message
  selectedId?: string
  focusedIndex: number
  onSelect: (row: T) => void
  listRef: React.RefObject<HTMLDivElement | null>
  dataAttr?: string        // e.g. "order" → data-order-index={index}; defaults to "row"
}
```

### What it handles uniformly

- Paper container + header with count + "Searching..." indicator
- Skeleton rows on initial load (`loading && rows.length === 0`)
- Empty state row: `No {label} found` — applied to all 11 entities, normalising the inconsistency where OrdersTable previously had no empty state
- Row selection + focus highlight styles (the identical `sx` block currently duplicated across all 11 files)
- `data-{dataAttr}-index={index}` attribute for keyboard navigation

### Usage examples

Single-column (replaces OrdersTable):
```tsx
<EntityTable
  rows={orders}
  columns={[{ key: 'orderNumber', header: 'SO List', render: (o) => o.orderNumber }]}
  loading={loading}
  total={total}
  label="Orders"
  selectedId={selectedOrderId}
  focusedIndex={focusedOrderIndex}
  onSelect={onOrderSelect}
  listRef={orderListRef}
  dataAttr="order"
/>
```

Multi-column (InvoicesTable with amount):
```tsx
columns={[
  { key: 'number', header: 'Invoices', render: (inv) => inv.invoiceNumber },
  { key: 'amount', render: (inv) => formatCurrency(inv.totalAmount), width: 80 },
]}
```

### Migration strategy

Each of the 11 existing list component files is replaced by a thin wrapper (~5-10 lines) that calls `EntityTable` with its column config. The wrapper preserves the existing import path so page files need no prop changes. Once all pages are migrated, the wrappers can be removed in a follow-up cleanup.

**Files replaced:** `CustomerList.tsx`, `SupplierList.tsx`, `ProductList.tsx`, `CategoryList.tsx`, `StockAdjustmentList.tsx`, `OrdersTable.tsx`, `InvoicesTable.tsx`, `PaymentsTable.tsx`, `PurchaseOrdersTable.tsx`, `GRNTable.tsx`, `VendorPaymentTable.tsx`

**Net result:** ~1,600 lines of duplicated boilerplate → 1 component (~120 lines) + 11 wrappers (~5-10 lines each).

---

## Section 4: Testing & Success Criteria

### Backend tests

- `BaseCrudService` unit test: add case for `findDeleted` on a service with joins in `applyQueryBuilder` — confirms no double-join or error after the fix
- All existing service spec files (`product.service.spec.ts`, `invoice.service.spec.ts`, `purchase-order.service.spec.ts`, `category.service.spec.ts`) pass unchanged
- Explicitly test `restore` and `bulkRestore` through the base class on a service with an `afterDelete` override (ProductService) — confirms the hook still fires after method deletion

### Frontend tests

- All existing filterbar tests (`OrdersPage.filterbar.test.tsx`, etc.) pass unchanged
- Each new domain hook gets a focused unit test: auto-select on load, domain mutation happy path, dialog state toggling
- `EntityTable` gets a unit test: skeleton render, empty state, row selection highlight, multi-column render
- Existing list component tests (`ProductList.test.tsx`, `CategoryList.test.tsx`, `useCategoriesSelection.test.tsx`, etc.) are deleted alongside the components they test

### Success criteria

- All 9 page hook triplets collapsed to single domain hooks
- All 11 list components replaced by `EntityTable<T>`
- All 5 backend services: hand-rolled CRUD methods deleted, base class methods inherited
- Each migrated list page ≤ 80 lines
- All existing unit tests passing
- No regression in order totals, stock levels, or accounting entries

---

## Implementation Order

1. Fix `BaseCrudService.findDeleted` (verify existing services first)
2. Migrate 5 backend services (SalesOrder → Invoice → PurchaseOrder → Product → Category)
3. Build `EntityTable<T>` + migrate all 11 list components
4. Consolidate hook triplets into domain hooks (GRN + VendorPayments first as simplest, Orders last as most complex)
5. Run full test suite, fix regressions
