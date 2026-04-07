# Customers Page Modernization — Design Spec

**Issue:** #305  
**Date:** 2026-04-07  
**Status:** Approved

## Overview

Update the Customers page and its related components to match the modernized UI patterns established in the Sales Orders page. Six inconsistencies are addressed in one pass.

---

## 1. CustomerList → CustomersTable

**File:** `frontend/src/pages/sales/components/CustomerList.tsx`

Rewrite internals to match `OrdersTable`:

- Outer wrapper: `Paper` with `height: '100%'`, `display: 'flex'`, `flexDirection: 'column'`
- Header bar: `"Customers ({total})"` label in `variant="tableHeader"` uppercase style; shows "Searching..." + skeleton circle when `loading && customers.length > 0`
- Body: `TableContainer` → `Table` (using `TABLE_STYLES`) → `TableBody`
- Each row: `TableRow` with hover, `cursor: pointer`, focus outline (`2px solid primary.main` via `outline` offset `-2px`), and `action.selected` background when selected — same `sx` pattern as `OrderRow`
- Row content: customer name in a single `TableCell` (`0.8rem` typography, `fontWeight: 400`)
- Skeleton: 10 skeleton rows when `loading && customers.length === 0`
- Empty state: single centered row "No customers found"
- Props: add `total: number`; rename `listRef` → `customerListRef` to match `OrdersTable` convention
- `CustomersPage` passes `total={customers.length}`

---

## 2. CustomerContextHeader

**File:** `frontend/src/pages/sales/components/CustomerContextHeader.tsx`

Rewrite to match `OrderContextHeader` structure:

- Outer wrapper: `Paper` with `overflow: 'hidden'`
- Empty state: `Paper` with centered "Select a customer to view details" (`variant="h6"`, `color="text.secondary"`)
- **Title bar row:**
  - Left: `"CUSTOMER - {name}"` in `variant="tableHeader"` uppercase style (`fontWeight: 600`, `fontSize: '0.8rem'`, `textTransform: 'uppercase'`, `letterSpacing: '0.5px'`)
  - Right: Edit (`primary.main`) + Delete (`error.main`) `IconButton`s using same `actionIconSx` sizing as `OrderContextHeader`
- **Detail table** (single column):
  - Rows: Type, Status, Phone, Email, Price List
  - Uses `labelCellSx` / `valueCellSx` / `detailTableSx` constants (same as `OrderContextHeader`)
  - No grid split (single column of data)
  - Phone/Email show "—" if not set; Price List shows chip name or "—"
- **Props change:** remove internal `navigate` call; add `onEdit: () => void` callback. Parent (`CustomersPage`) wires: `onEdit={() => navigate(\`/sales/customers/${selectedCustomer.id}/edit\`)}`

---

## 3. CustomerWorkspaceCard

**File:** `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx`

Minor structural fix:

- Change outer wrapper from `Box` to `Paper` with `flex: 1`, `overflow: 'hidden'`, `display: 'flex'`, `flexDirection: 'column'`
- Empty state: change from centered icon+text `Box` to `<Paper sx={{ flex: 1 }} />` — matches `OrderWorkspaceCard` empty state
- Inner content (stats cards, tabs, tables) unchanged

---

## 4. CustomersDialogs

**File:** `frontend/src/pages/sales/components/CustomersDialogs.tsx` (new)

Centralized dialog component matching `OrdersDialogs` pattern:

```ts
interface CustomersDialogsProps {
  selectedCustomer: Customer | null
  deleteConfirmOpen: boolean
  onConfirmDelete: () => Promise<void> | void
  onCancelDelete: () => void
  deletedCustomersDialogOpen: boolean
  onCloseDeletedCustomersDialog: () => void
}
```

Renders:
- `ConfirmationDialog` — delete confirmation (moved from inline in `CustomersPage`)
- `DeletedCustomersDialog` — view deleted customers (moved from inline in `CustomersPage`)

`CustomersPage` replaces the two inline dialogs with `<CustomersDialogs ... />`.

---

## 5. CustomersPage + useCustomersPageState + FilterBar Sort

### useCustomersPageState

**File:** `frontend/src/pages/sales/hooks/useCustomersPageState.ts`

Add:
- `shouldPreserveSearchFocus: boolean` (default `false`)
- `setShouldPreserveSearchFocus: (v: boolean) => void`

### CustomersPage

**File:** `frontend/src/pages/sales/CustomersPage.tsx`

Four changes:

1. **Sort state:** add `sortBy` (default `'name'`) and `sortOrder` (default `'asc'`) via `useState`; add `handleSort` callback matching `OrdersPage` pattern
2. **Focus preservation:** add `useEffect` (same as `OrdersPage`) that refocuses `searchInputRef` when `loading` changes and `shouldPreserveSearchFocus` is true; wrap `handlers.onSearchChange` to call `setShouldPreserveSearchFocus(true)` before delegating
3. **FilterBar sort prop:** pass `sort={{ field: 'name', sortBy, sortOrder, onSort: handleSort }}` to `FilterBar`
4. **Query params:** replace hardcoded `sortBy: 'name', sortOrder: 'ASC'` with state values; cast `sortOrder.toUpperCase() as 'ASC' | 'DESC'`

### onEdit wiring

`CustomersPage` passes `onEdit={() => navigate(\`/sales/customers/${selectedCustomer.id}/edit\`)}` to `CustomerContextHeader`.

---

## 6. Test Updates

Both existing test files (`CustomersPage.filter.test.tsx`, `CustomersPage.filterbar.test.tsx`) mock `useCustomersPageState`. Add to mock return values:
- `shouldPreserveSearchFocus: false`
- `setShouldPreserveSearchFocus: vi.fn()`

Both test files mock `CustomerList` — update mock to accept `total` prop (no assertion needed, just avoid prop warning).

---

## Files Changed

| File | Change |
|------|--------|
| `frontend/src/pages/sales/components/CustomerList.tsx` | Rewrite as `CustomersTable` |
| `frontend/src/pages/sales/components/CustomerContextHeader.tsx` | Rewrite with Paper + detail rows |
| `frontend/src/pages/sales/components/CustomerWorkspaceCard.tsx` | Outer wrapper Box → Paper |
| `frontend/src/pages/sales/components/CustomersDialogs.tsx` | New file |
| `frontend/src/pages/sales/CustomersPage.tsx` | Sort state, focus management, dialogs extraction |
| `frontend/src/pages/sales/hooks/useCustomersPageState.ts` | Add shouldPreserveSearchFocus |
| `frontend/src/pages/sales/__tests__/CustomersPage.filter.test.tsx` | Update mock |
| `frontend/src/pages/sales/__tests__/CustomersPage.filterbar.test.tsx` | Update mock |

No backend changes required.
