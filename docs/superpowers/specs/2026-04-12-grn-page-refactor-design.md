# GRN Page Refactor Design

**Date:** 2026-04-12
**Issue:** #335
**Status:** Approved

## Overview

Refactor `GoodsReceivedPage.tsx` (919 lines, monolithic) to match the standardized Master-Detail pattern established by `PurchaseOrdersPage` and `SuppliersPage`. This involves decomposing the page into hooks and components, replacing the custom layout with `MasterDetailWorkspace`, and wiring up the `FilterBar`.

## Backend Changes

The `GoodsReceivedNoteQueryDto` already has `supplierId`, `status`, `receivedDateFrom`, and `receivedDateTo` fields. No DTO changes are needed.

**Verify** that `goods-received-note.service.ts` applies `supplierId` and `status` as WHERE clauses in the GRN list query. If either is missing, add the conditional clause. No migration needed — query-only change.

## File Structure

```
frontend/src/pages/purchasing/
├── GoodsReceivedPage.tsx              (~150 lines, thin orchestrator)
├── components/
│   ├── GRNTable.tsx                   (~120 lines, list rendering, memoized rows)
│   ├── GRNContextHeader.tsx           (~180 lines, detail header + PO link)
│   ├── GRNWorkspaceCard.tsx           (~120 lines, items table + journal entry link)
│   └── GRNDialogs.tsx                 (~40 lines, DeletedGRNsDialog + GRNPrint)
└── hooks/
    ├── useGRNPageState.ts             (~80 lines, dialog state, sorting, refs)
    └── useGRNSelection.ts             (~200 lines, selection, focus, keyboard nav, URL sync, journal entry fetch)
```

No `useGRNActions.ts` — GRNs are read-only. All mutations (receive goods, return goods) flow through Purchase Order actions.

## Hooks

### `useGRNPageState.ts`
Owns dialog visibility (`deletedGRNsOpen`, `printDialogOpen`), sorting state (`sortBy`, `sortOrder`), and `journalEntryRef` used to highlight the journal entry row. Returns setters for all of these.

### `useGRNSelection.ts`
Owns:
- Selected GRN synced to Redux + `?grnId=` URL param
- Focused index for keyboard navigation
- Auto-select-first logic when list loads
- Auto-scroll focused item into view
- Keyboard navigation (↑/↓ arrows)
- Lazy fetch of fresh GRN data on selection
- Lazy fetch of related journal entry (`sourceType: 'goods_received_note'`)

Simpler than `usePurchaseOrdersSelection.ts` — no "blocked" state, no multi-source journal entry lookup.

### `GoodsReceivedPage.tsx`
Thin orchestrator. Calls `useFilterBar`, `useGRNPageState`, `useGRNSelection`. Builds RTK Query params from applied filters. Renders `MasterDetailWorkspace` with four slot components. Renders `GRNDialogs`. No business logic inline.

## Components

### `GRNTable.tsx`
Left-pane list. Memoized row component with keyboard focus outline, selection highlight, auto-scroll ref.
Columns: GRN number, supplier name, received date, status chip, total quantity received.

Note: the current monolithic page shows only `grnNumber` in the list row. The refactor expands this to match the richer column pattern of `PurchaseOrdersTable`.

### `GRNContextHeader.tsx`
Right-pane header when a GRN is selected. Two info tables side-by-side:
- Left: GRN number, status, received date, created by
- Right: Supplier name, PO reference (navigable link → `/purchasing/purchase-orders?poId=<id>`), total quantity, notes

No action buttons — GRNs are read-only.

### `GRNWorkspaceCard.tsx`
Items table below the header: product name, quantity received, unit cost, line total.
Also renders the journal entry link row (highlighted via `journalEntryRef` if present).

### `GRNDialogs.tsx`
Two dialogs: `DeletedGRNsDialog` (existing component) and `GRNPrint` (existing print component). Accepts open/close booleans and handlers as props.

## FilterBar Configuration

```ts
const filterConfig = useMemo<FilterBarConfig<GRNFilters>>(() => ({
  search: { placeholder: 'Search goods received notes...' },
  fields: [
    { field: 'period',     label: 'Period',   type: 'period' },
    { field: 'supplierId', label: 'Supplier', type: 'supplier' },
    { field: 'status',     label: 'Status',   type: 'purchasing-status' },
  ],
  defaults: {
    search: '',
    period: { key: null, from: null, to: null },
    supplierId: null,
    status: null,
  },
}), [])
```

- `period` → maps to `receivedDateFrom` / `receivedDateTo` via `getPeriodDateRange`
- `supplierId` → passed directly to backend (already in DTO)
- `status` → passed directly to backend (already in DTO); uses existing `FilterPurchasingStatus` component (Draft / Received options)

No new filter components. No new filter types registered in `FilterBar.tsx`.

The existing manual date range picker UI in the monolithic page is removed entirely.

## PO Reference Link

In `GRNContextHeader.tsx`, the PO reference is rendered as a clickable link. Clicking navigates to `/purchasing/purchase-orders?poId=<purchaseOrderId>`, which auto-selects that PO in the PurchaseOrdersPage using the existing `?poId=` URL param pattern.

## Testing

### Frontend: `__tests__/GoodsReceivedPage.filterbar.test.tsx` (new)
Mirrors `PurchaseOrdersPage.filterbar.test.tsx`:
- FilterBar renders with correct default state
- Search input updates query params
- Period filter maps correctly to `receivedDateFrom` / `receivedDateTo`
- Supplier filter passes `supplierId` to API call
- Status filter passes `status` to API call
- Clearing filters resets to defaults

### Backend: `goods-received-note.service.spec.ts` (existing)
Add test cases for the GRN list query:
- `supplierId` present → WHERE clause applied
- `status` present → WHERE clause applied
- Neither present → no WHERE clause, all records returned

No new component-level tests for `GRNContextHeader` or `GRNWorkspaceCard` in this PR — consistent with existing pattern (component tests added separately if needed).

## Success Criteria

- `GoodsReceivedPage.tsx` reduced to ~150 lines (clean entry point)
- GRN page UI/UX is indistinguishable from `PurchaseOrdersPage` in layout and behavior
- All existing functionality preserved: filtering, sorting, printing, journal entry mapping, deleted GRNs dialog
- Keyboard navigation and auto-selection work correctly
- No regressions in other purchasing pages
- FilterBar test file passes
