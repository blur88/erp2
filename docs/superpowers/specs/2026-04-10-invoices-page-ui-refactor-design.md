# Invoices Page UI Refactor Design

**Issue:** #327  
**Date:** 2026-04-10  
**Goal:** Refactor the Invoices page UI to match the modern Sales Orders page pattern. Functionality must remain identical.

---

## Overview

The Invoices page currently uses a bespoke layout with manual date filter state, no `PageHeader`, no `FilterBar`, and a monolithic `InvoiceDetailsPanel`. This refactor brings it in line with the `OrdersPage` pattern: `PageHeader` + `FilterBar` + `MasterDetailWorkspace` + split context header / workspace card components, plus a hook cleanup that removes manual filter state in favour of `useFilterBar`.

---

## Architecture

### Page Shell (`InvoicesPage.tsx`)

Restructured to match `OrdersPage`:

```tsx
<Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
  <PageHeader
    title="Invoices"
    subtitle="Track and manage customer invoices"
    variant="workflow"
    secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedInvoicesDialogOpen(true) }}
    toolbar={
      <FilterBar
        config={filterConfig}
        draftFilters={draftFilters}
        handlers={filterHandlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={pageState.searchInputRef}
        sort={{ field: 'invoiceNumber', sortBy, sortOrder, onSort: handleSort }}
      />
    }
  />
  <MasterDetailWorkspace
    isMobile={isMobile}
    listSlot={<InvoicesTable ... />}
    headerSlot={<InvoiceContextHeader ... />}
    workspaceSlot={<InvoiceWorkspaceCard ... />}
  />
  <InvoicesDialogs ... />
</Box>
```

**FilterBar config fields:** `search` (placeholder: "Search invoices..."), `period`, `customerId`. Note: `customerId` is a new filter field not present in the old page — it is added here because `FilterBar` + `useGetInvoicesQuery` already support it and it is consistent with the Orders page pattern. The backend endpoint already accepts `customerId` as a query param.

**Sort state:** `sortBy` / `sortOrder` via local `useState` in `InvoicesPage` (same pattern as `OrdersPage`). Default: `invoiceNumber` / `asc`.

**Date range:** Computed from `appliedFilters.period` using `getPeriodDateRange` (same utility as `OrdersPage`). The manual `getDateRange()` function is removed.

**`filterHandlers`:** Wraps `handlers` with `onSearchChange` that sets `shouldPreserveSearchFocus = true` before delegating (same pattern as `OrdersPage`).

---

## Hook Refactor (`useInvoicesPageState.ts`)

The `InvoiceFilters` type and all filter/sort state are removed. `useFilterBar` owns search, sort, and period state.

**Removed from hook:**
- `InvoiceFilters` type (entire type deleted)
- `filters` state object (`search`, `sortBy`, `sortOrder`, `dateFilter`, `customFromDate`, `customToDate`)
- `setFilters`

**Remains in hook** (page-local UI state only):
- `createDialog` / `setCreateDialog`
- `editDialog` / `setEditDialog`
- `deletedInvoicesDialogOpen` / `setDeletedInvoicesDialogOpen`
- `printDialogOpen` / `setPrintDialogOpen`
- `focusedInvoiceIndex` / `setFocusedInvoiceIndex`
- `shouldPreserveSearchFocus` / `setShouldPreserveSearchFocus`
- `journalEntryRef` / `setJournalEntryRef`
- `journalEntryRefLoading` / `setJournalEntryRefLoading`
- All refs: `searchInputRef`, `invoiceListRef`, `hasRestoredSelection`, `previousPathnameRef`, `selectedInvoiceRef`

---

## Components

### New: `InvoiceContextHeader.tsx`

Replaces the header/metadata portion of `InvoiceDetailsPanel`. Mirrors `OrderContextHeader`.

**Props:**
```ts
interface InvoiceContextHeaderProps {
  selectedInvoice: InvoiceListItem | null
  isLoading?: boolean
  journalEntryRef: InvoiceJournalEntryRef | null
  journalEntryRefLoading: boolean
  onPrint: () => void
  onNavigateToSalesOrder: (salesOrderId: string, event: React.MouseEvent) => void
  onNavigateToPayment: (paymentId: string, event?: React.MouseEvent) => void
  onNavigateToJournalEntry: () => void
}
```

**Empty state:** `<Paper>` with "Select an invoice to view details" centred text.

**Header bar:** Invoice number title + status chip (Paid/Partial Paid/Overpaid/draft) + Print icon button (info colour). No Edit or Delete buttons.

**Two-column detail table (same styling as `OrderContextHeader`):**
- Left — Invoice Information: Customer, Invoice Date, Order No (clickable link), Payment No (clickable links), Journal Entry No (clickable link or "Pending")
- Right — Payment Information: Sub-total, Shipping, Total Amount, Paid Amount, Balance Due / Overpaid Amount

Uses shared `sx` constants (`detailTableSx`, `labelCellSx`, `valueCellSx`) extracted at module level, same as `OrderContextHeader`.

### New: `InvoiceWorkspaceCard.tsx`

Replaces the items/notes portion of `InvoiceDetailsPanel`. Mirrors `OrderWorkspaceCard`.

**Props:**
```ts
interface InvoiceWorkspaceCardProps {
  selectedInvoice: InvoiceListItem | null
}
```

**Empty state:** `<Paper sx={{ flex: 1 }} />` (same as `OrderWorkspaceCard`).

**Content:** "Invoice Items" header, scrollable items table (Product, Quantity, Unit Price, Discount, Total), Notes section below if present.

### Deleted: `InvoiceDetailsPanel.tsx`

Entirely removed and replaced by `InvoiceContextHeader` + `InvoiceWorkspaceCard`.

### Updated: `InvoicesTable.tsx`

Minor addition: show "Searching..." spinner (caption + circular skeleton) when `loading && invoices.length > 0`, matching `OrdersTable` behaviour.

---

## Data Flow

- `useFilterBar(filterConfig)` → `appliedFilters` (search, period, customerId) + `draftFilters` + `handlers` + `hasActiveFilters`
- `getPeriodDateRange(appliedFilters.period.key, weekStartsOn)` → `{ fromDate, toDate }`
- `useGetInvoicesQuery({ search, sortBy, sortOrder, fromDate, toDate, customerId })` → `invoices`, `pagination`
- `useInvoicesPageState()` → UI-only state (dialogs, focus, refs)
- `useInvoicesSelection(...)` + `useInvoicesActions(...)` — unchanged

---

## What Does NOT Change

- `useInvoicesSelection.ts` — no changes
- `useInvoicesActions.ts` — no changes
- `InvoicesDialogs.tsx` — no changes
- All backend API endpoints and RTK Query hooks — no changes
- All keyboard shortcuts and selection behaviour — no changes
- Dialogs (create, edit, deleted, print) — no changes

---

## Testing

- Run existing frontend tests after refactor: `cd frontend && npx vitest run src/pages/sales/`
- Manually verify: invoice list renders, selecting an invoice shows context header + workspace card, FilterBar search/period/customer filters work, "View Deleted" opens dialog, Print button works, keyboard navigation works.
- No new test files required for a UI-only structural refactor.
