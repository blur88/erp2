# Payments Page Refactor — Design Spec

**Issue:** #333  
**Date:** 2026-04-10  
**Status:** Approved

## Goal

Refactor `PaymentsPage.tsx` to match the architecture and UI patterns of `InvoicesPage.tsx`. Functionality must remain identical. The edit dialog (placeholder only) is removed — payments cannot be edited.

---

## File Structure

### New files

```
frontend/src/pages/sales/
  hooks/
    usePaymentsPageState.ts
    usePaymentsSelection.ts
  components/
    PaymentsTable.tsx
    PaymentContextHeader.tsx
    PaymentWorkspaceCard.tsx
    PaymentsDialogs.tsx

frontend/src/components/filters/
  FilterTransactionStatus.tsx
```

### Modified files

```
frontend/src/pages/sales/PaymentsPage.tsx        — thinned to ~100-line orchestrator
frontend/src/components/filters/FilterBar.tsx    — register 'transaction-status' type
backend/src/modules/sales/dto/payment.dto.ts     — add status field to QueryPaymentsDto
backend/src/modules/sales/services/payment.service.ts — add status filter in findAll
```

---

## Component Responsibilities

| File | Responsibility |
|---|---|
| `usePaymentsPageState` | All `useState`/`useRef`: dialog flags, `focusedPaymentIndex`, `journalEntryRef`, `journalEntryRefLoading`, `searchInputRef`, `paymentListRef`, `hasRestoredSelection`, `previousPathnameRef`, `selectedPaymentRef` |
| `usePaymentsSelection` | All `useEffect` + `useCallback` for selection, keyboard nav, scroll, auto-select, refetch-on-navigate, highlight from `?highlight` query param and `location.state.highlightPaymentId`, journal entry fetch |
| `PaymentsTable` | Left list panel: header with count, `ListSkeleton`, `CircularProgress` overlay, `TableContainer` with `PaymentRow` rows |
| `PaymentContextHeader` | Right detail header: payment number + status `Chip` + print `IconButton` + clickable links to order, invoice, journal entry |
| `PaymentWorkspaceCard` | Right detail body: Payment Information table, Related Information table, Payment Items table, Notes section |
| `PaymentsDialogs` | `DeletedPaymentsDialog` + `PaymentReceiptPrint` (no edit dialog) |
| `PaymentsPage` | Thin orchestrator: FilterBar config, query args, `MasterDetailWorkspace`, wires hooks and components |

---

## FilterBar

Matches Invoices pattern exactly:

```ts
fields: [
  { field: 'period',            label: 'Period',   type: 'period' },
  { field: 'customerId',        label: 'Customer', type: 'customer' },
  { field: 'transactionStatus', label: 'Status',   type: 'transaction-status' },
]
```

- Standalone sort `Button` removed; sort moves into FilterBar `sort` prop: `{ field: 'paymentNumber', sortBy, sortOrder, onSort: handleSort }`
- Preset customer chip (shown when navigating from a customer context) is preserved in the design — passed as `presetCustomerId` prop handled inside `PaymentsPage`

### `FilterTransactionStatus` (new component)

```
frontend/src/components/filters/FilterTransactionStatus.tsx
```

Options: Completed / Pending / Failed / Cancelled / Refunded  
Values: `'completed' | 'pending' | 'failed' | 'cancelled' | 'refunded'`

Must be registered in `FilterBar.tsx` under the `'transaction-status'` type.

---

## Query Args

```ts
{
  search:            string | undefined
  sortBy:            string
  sortOrder:         'ASC' | 'DESC'
  fromDate:          string | undefined   // derived from period filter via getPeriodDateRange
  toDate:            string | undefined
  customerId:        string | undefined
  status:            string | undefined   // payment transaction status
}
```

`useGetPaymentsQuery` already accepts `Record<string, unknown>` — no frontend API type changes needed.

---

## Backend Changes

### `payment.dto.ts` — add to `QueryPaymentsDto`

```ts
@ApiPropertyOptional({ description: 'Filter by payment status', enum: PaymentStatus })
@IsOptional()
@IsEnum(PaymentStatus)
status?: PaymentStatus;
```

### `payment.service.ts` — add in `findAll` after existing where assignments

```ts
if (status) where.status = status;
```

---

## Layout

Uses `MasterDetailWorkspace` (same as Invoices):
- `listSlot`: `PaymentsTable` (25% width)
- `headerSlot`: `PaymentContextHeader`
- `workspaceSlot`: `PaymentWorkspaceCard`

Mobile: stacked vertically (handled by `MasterDetailWorkspace`).

---

## Journal Entry Navigation

Fixed to match Invoices pattern:

```ts
navigate(`/accounting/journal-entries?sourceType=payment&sourceId=${selectedPayment.id}`)
```

Previously was navigating to `/accounting/journal-entries/:id` — inconsistent with Invoices.

---

## Removed

- Placeholder edit dialog ("Payment editing form will be implemented here.") — payments cannot be edited
- Standalone sort `Button` with `ArrowUpIcon`/`ArrowDownIcon`/`SortIcon` — replaced by FilterBar sort prop
- `editDialog` state and all related handlers (`handleEnterAction` no longer opens a dialog — it is a no-op or simply focuses)
- Unused imports: `EditIcon`, `DeleteIcon`, `SortIcon`, `ArrowUpIcon`, `ArrowDownIcon`, `FormControl`, `InputLabel`, `Select`, `MenuItem`, `Dialog`, `DialogTitle`, `DialogContent`, `DialogActions`, `Divider`, `Link`, `Stack`, `Grid` (replaced by `MasterDetailWorkspace`)

---

## Out of Scope

- Adding create/edit payment functionality
- Pagination UI (backend returns all matching payments, same as before)
- Changes to other pages
