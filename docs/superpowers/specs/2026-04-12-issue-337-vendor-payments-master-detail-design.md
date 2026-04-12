# VendorPaymentsPage Master-Detail Refactor — Design Spec

**Issue:** #337
**Date:** 2026-04-12
**Pattern reference:** `GoodsReceivedPage` (issue #335, PR #336)

---

## Goal

Rewrite `VendorPaymentsPage.tsx` from its current monolithic manual-grid layout into the standardized Master-Detail pattern used by `SuppliersPage`, `PurchaseOrdersPage`, and `GoodsReceivedPage`.

---

## File Layout

All new files live under `frontend/src/pages/purchasing/`:

```
hooks/
  useVendorPaymentsPageState.ts
  useVendorPaymentsSelection.ts
components/
  VendorPaymentTable.tsx
  VendorPaymentContextHeader.tsx
  VendorPaymentWorkspaceCard.tsx
  VendorPaymentsDialogs.tsx
VendorPaymentsPage.tsx                          (rewritten)
__tests__/
  VendorPaymentsPage.filterbar.test.tsx
```

One API change: `frontend/src/store/api/purchasingApi.ts` — add `getVendorPayment` single-item query and export `useLazyGetVendorPaymentQuery`.

---

## API Layer

Add to `purchasingApi.ts`:

```ts
getVendorPayment: builder.query<VendorPayment, string>({
  query: (id) => `/purchasing/vendor-payments/${id}`,
  providesTags: ['VendorPayment'],
}),
```

Export `useLazyGetVendorPaymentQuery` alongside the existing exports. Used by `useVendorPaymentsSelection` to fetch fresh data on row click.

---

## Hooks

### `useVendorPaymentsPageState`

Manages local UI state. Returns:

| State | Type | Default |
|---|---|---|
| `sorting` | `{ sortBy: string; sortOrder: 'asc' \| 'desc' }` | `{ sortBy: 'paymentNumber', sortOrder: 'asc' }` |
| `focusedPaymentIndex` | `number` | `-1` |
| `deletedPaymentsOpen` | `boolean` | `false` |
| `printDialogOpen` | `boolean` | `false` |
| `journalEntryRef` | `VPJournalEntryRef \| null` | `null` |
| `journalEntryRefLoading` | `boolean` | `false` |
| `paymentListRef` | `RefObject<HTMLDivElement>` | — |
| `searchInputRef` | `RefObject<HTMLInputElement>` | — |
| `userHasNavigatedRef` | `MutableRefObject<boolean>` | — |

`VPJournalEntryRef` = `{ referenceNumber: string; sourceType: string; sourceId: string }` (mirrors `GRNJournalEntryRef`).

### `useVendorPaymentsSelection`

Handles selection, keyboard navigation, deep-linking, and journal entry lookup. Mirrors `useGRNSelection` exactly, substituting GRN → VendorPayment throughout:

- Deep-link param: `vpId` (already used by Purchase Orders page to link here)
- Slice action: `setSelectedVendorPayment`
- Selector: `selectSelectedVendorPayment`
- Lazy query: `useLazyGetVendorPaymentQuery`
- Journal entry `sourceType`: `'vendor_payment'`
- Auto-selects first item on load (same behaviour as GRN)
- Scrolls focused row into view via `data-payment-index` attribute

---

## Components

### `VendorPaymentTable`

Standard list table using `TABLE_STYLES`. Columns:

| Column | Value |
|---|---|
| Payment # | `payment.paymentNumber` |
| Supplier | `payment.supplier.companyName` |
| Date | `formatDate(payment.paymentDate)` |
| Amount | `formatCurrency(payment.amount)` |
| Status | Chip (pending / completed / cancelled) |

Row props: `data-payment-index={index}`, selected/focused highlight, click handler.

### `VendorPaymentContextHeader`

Two-column layout matching `GRNContextHeader`. Empty state: "Select a vendor payment to view details".

**Left — Payment Information:**
- Payment Number
- Status (text, capitalize)
- Payment Date
- Journal Entry (clickable link → accounting journal entries, or "Pending" italic)

**Right — Supplier & Order:**
- Supplier name
- Purchase Order (clickable button → `/purchasing/purchase-orders?poId=...`, or `—`)
- Amount (`formatCurrency`)
- Payment Method (`payment.paymentMethodEntity?.name ?? payment.paymentMethodId ?? '—'`)

**Actions (top-right):** Print icon only.

### `VendorPaymentWorkspaceCard`

Since VPs have no line items, shows a payment details summary table:

| Field | Value |
|---|---|
| Reference Number | `payment.referenceNumber \|\| '—'` |
| Notes | `payment.notes \|\| '—'` |
| Created At | `formatDate(payment.createdAt)` |
| Updated At | `formatDate(payment.updatedAt)` |
| Created By | `payment.createdBy \|\| '—'` |

Section header: "Payment Details". Empty state: blank `Paper` (same as GRN).

### `VendorPaymentsDialogs`

Thin wrapper. Props:

```ts
{
  selectedPayment: VendorPayment | null
  deletedPaymentsOpen: boolean
  onCloseDeletedPayments: () => void
  printDialogOpen: boolean
  onClosePrintDialog: () => void
}
```

Renders existing `DeletedVendorPaymentsDialog` and `VendorPaymentPrint` — no new dialog logic.

---

## VendorPaymentsPage (orchestrator)

Thin component. Responsibilities:

1. Instantiate `useVendorPaymentsPageState` and `useVendorPaymentsSelection`
2. Build `FilterBar` config (see below)
3. Call `useFilterBar` and derive `dateRange` via `getPeriodDateRange`
4. Call `useGetVendorPaymentsQuery` with derived params
5. Call `useKeyboardShortcuts`
6. Render `PageHeader` + `FilterBar` + `MasterDetailWorkspace` + `VendorPaymentsDialogs`

**FilterBar config:**

```ts
{
  search: { placeholder: 'Search vendor payments...' },
  fields: [
    { field: 'period',    label: 'Period',   type: 'period' },
    { field: 'supplierId', label: 'Supplier', type: 'supplier' },
    { field: 'status',    label: 'Status',   type: 'purchasing-status' },
  ],
  defaults: {
    search: '',
    supplierId: null,
    period: { key: null, from: null, to: null },
    status: null,
  },
}
```

Date range maps to `startDate` / `endDate` query params (matching current backend field names).

**PageHeader:** `secondaryAction` = "View Deleted" → opens deleted payments dialog.

**Sort default:** `paymentNumber` ascending.

---

## Tests

`VendorPaymentsPage.filterbar.test.tsx` mirrors `GoodsReceivedPage.filterbar.test.tsx`:

- Mock `useGetVendorPaymentsQuery`, `useLazyGetVendorPaymentQuery`, `useLazyGetJournalEntriesQuery`
- Mock `FilterBar` (spy to capture props), `MasterDetailWorkspace`, and all four new components
- Assert `FilterBar` receives correct config: search placeholder `'Search vendor payments...'`, fields `period` / `supplier` / `purchasing-status`
- Assert sort field is `paymentNumber`
- Assert `MasterDetailWorkspace` renders

---

## What is NOT in scope

- Payment method filter field (deferred to a future issue — requires adding `payment-method` type to `FilterBar`)
- Any changes to the backend or existing dialog components
- GRN link in the context header (VP → PO → GRN is sufficient)
