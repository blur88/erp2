# Journal Entries List & Context Header Polish — Design Spec

**Issue:** #466  
**Date:** 2026-04-28  
**Status:** Approved

## Overview

Two focused visual/layout changes to align the Journal Entries page with the established PO and SO patterns:

1. **JournalEntriesTable** — reduce to a single `referenceNumber` column (matching `PurchaseOrdersTable` / `OrdersTable`)
2. **JournalEntryContextHeader** — replace the flat 4-column table with a two-column `Grid` layout, add `sourceRefNumber` to the backend response so the source document reference can be displayed as a clickable link

## Scope

### Backend
- `journal-entry.entity.ts` — no entity change needed
- `journal-entries.service.ts` (or equivalent) — populate a `sourceRefNumber` field on the JE response by fetching the human-readable reference from the related source record (SO orderNumber, PO orderNumber, GRN grnNumber, VP paymentNumber, Stock Adjustment referenceNumber, etc.)
- `JournalEntry` DTO / response type — add `sourceRefNumber?: string`

### Frontend
- `frontend/src/types/index.ts` — add `sourceRefNumber?: string` to `JournalEntry` type
- `frontend/src/pages/accounting/components/JournalEntriesTable.tsx` — rewrite columns
- `frontend/src/pages/accounting/components/JournalEntryContextHeader.tsx` — rewrite layout

No changes to `JournalEntriesPage.tsx`, `useJournalEntriesWorkspace.ts`, or `JournalEntryWorkspaceCard.tsx`.

## Changes

### Backend: sourceRefNumber

When returning a `JournalEntry` (both list and single-entry endpoints), resolve the human-readable reference for the source document and include it as `sourceRefNumber`.

Source type → field mapping:

| sourceType | sourceRefNumber value |
|---|---|
| `sales_order` | `SalesOrder.orderNumber` |
| `payment` | `Payment.paymentNumber` |
| `goods_received_note` | `GoodsReceivedNote.grnNumber` |
| `vendor_payment` | `VendorPayment.paymentNumber` |
| `expense` | `Expense.referenceNumber` |
| `owner_equity_transaction` | `OwnerEquityTransaction.referenceNumber` |
| `fund_transfer` | `FundTransfer.referenceNumber` |
| `stock_adjustment` | `StockAdjustment.referenceNumber` |
| `manual` / no sourceId | `undefined` |

If the source record is not found, `sourceRefNumber` should be `undefined` (not an error).

### Frontend: JournalEntriesTable

Reduce to a single column — reference number only, matching `PurchaseOrdersTable`:

```tsx
const COLUMNS: ColumnConfig<JournalEntry>[] = [
  { key: 'reference', render: (entry) => entry.referenceNumber },
]
```

Remove all other columns: date, description, type chip, source link, debits, credits, status.

Props interface is unchanged — `onViewSource` prop can be removed since source navigation moves entirely to the context header.

### Frontend: JournalEntryContextHeader

Replace the current flat `Table` with a two-column `Grid` layout matching `PurchaseOrderContextHeader` and `OrderContextHeader`.

**Header bar:**
- Title: `"Journal Entry Details - {referenceNumber}"`
- Status chips: `EntityStatusChip(status)` + entry type `Chip` using `ENTRY_TYPE_LABELS`
- No actions slot (read-only)

**Left column — "Entry Information":**

| Label | Value |
|---|---|
| Date | `formatDate(entryDate)` |
| Description | `description` |
| Entry Type | `ENTRY_TYPE_LABELS[sourceType]` or `"Manual Entry"` |

**Right column — "References & Amounts":**

| Label | Value |
|---|---|
| Source | Clickable `sourceRefNumber` linking to source document via `SOURCE_ROUTES`; hidden when no `sourceType`/`sourceId`; shows italic "—" when `sourceRefNumber` is undefined |
| Debits | `formatCurrency(totalDebits)` |
| Credits | `formatCurrency(totalCredits)` |

**Styling:** Use the same `detailTableSx`, `labelCellSx`, `valueCellSx`, section header row, and alternating `grey.50` row pattern as `PurchaseOrderContextHeader`.

**Empty state:** unchanged — "Select a journal entry to view details" centered in a Paper.

**Props:** Remove `onNavigateToSource` callback — the component computes navigation internally using `useNavigate` and `SOURCE_ROUTES` (same pattern already used in `useJournalEntriesWorkspace`). The `SOURCE_ROUTES` map and `ENTRY_TYPE_LABELS` map currently duplicated between the table and header can be consolidated into a shared constants file or kept inline.

## Data Flow

No changes to the data flow. `sourceRefNumber` is returned from the existing list and single-entry API responses — no new API calls needed on the frontend.

## Testing

| File | Action |
|---|---|
| `JournalEntriesTable.tsx` test | Update — assert single `reference` column, no source link column |
| `JournalEntryContextHeader.tsx` test | Update — assert Grid layout, source link shows `sourceRefNumber`, assert left/right section titles |

## Acceptance Criteria

- `JournalEntriesTable` renders one column: `referenceNumber` only
- `JournalEntryContextHeader` uses a two-column `Grid` layout matching PO/SO style
- Title shows `"Journal Entry Details - {referenceNumber}"`
- Status chip + entry type chip shown in header bar
- Left column: Date, Description, Entry Type
- Right column: Source (clickable `sourceRefNumber`), Debits, Credits
- Source row is hidden when `sourceType` is absent or `manual`
- `sourceRefNumber` is populated by the backend for all auto-generated entry types
