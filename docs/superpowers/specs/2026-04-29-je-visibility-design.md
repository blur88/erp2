# JE Visibility: Consistent Combined View Across Sales and Purchasing

**Date:** 2026-04-29
**Issue:** #471
**Status:** Approved

## Problem

Sales Order and Invoice pages show overlapping/incomplete Journal Entry references. Invoice page fetches the linked sales order's JE causing duplication. Payment JEs are not shown at all on the sales side. The purchasing side (PO page) already shows combined GRN + vendor payment JEs correctly, but GRN and Vendor Payment pages only show their own single JE.

The goal is a consistent pattern: every document page shows the **complete set of JEs for the parent transaction**, making it easy for a solo operator to audit the full accounting picture from any related document.

## Design Principle

Every page shows the full transaction JE set:

- **Sales side**: fulfillment JE (`sales_order`) + all payment JEs (`payment`)
- **Purchasing side**: GRN JE (`goods_received_note`) + all vendor payment JEs (`vendor_payment`)

Clicking "View Journal Entries" navigates to `/accounting/journal-entries?ids=je1,je2,...` showing all JEs together. This navigation already works for multiple JEs.

## Backend Changes

### Sales Order DTO — add `payments` field

Add a `payments` array to the `SalesOrder` response DTO, mirroring how `PurchaseOrder` already returns `vendorPayments`:

```ts
payments?: {
  id: string;
  paymentNumber: string;
  amount: number;
  paymentDate: string;
}[]
```

Load the `payments` relation in `SalesOrderService` (or mapper) when building the full order response. No new endpoint needed.

### Frontend type — add `payments` to `SalesOrder`

```ts
payments?: {
  id: string;
  paymentNumber: string;
  amount: number;
  paymentDate: string;
}[]
```

### No backend changes for purchasing

`PurchaseOrder` already returns `vendorPayments` and `goodsReceivedNotes` with IDs. `GoodsReceivedNote` and `VendorPayment` types already carry a full `purchaseOrder` object including both arrays.

## Frontend Changes

### Source fetch pattern per page

| Page | JE sources fetched |
|---|---|
| Sales Order | `sales_order` (if fulfilled) + each `payment.id` from `selectedOrder.payments` |
| Invoice | `sales_order` (linked order, if fulfilled) + each `payment.id` from linked order |
| Purchase Order | already correct — GRN + vendor payments ✓ |
| GRN | `goods_received_note` (this GRN) + each `vendor_payment.id` from `selectedGRN.purchaseOrder.vendorPayments` |
| Vendor Payment | each `goods_received_note.id` from `selectedPayment.purchaseOrder.goodsReceivedNotes` + each `vendor_payment.id` from `selectedPayment.purchaseOrder.vendorPayments` |

### useOrdersWorkspace.ts

Replace the current `invoiceSources` memo (which fetches invoice JEs — incorrect, invoices don't generate JEs) with a `paymentSources` memo derived from `selectedOrder.payments`:

```ts
const paymentSources = useMemo(
  () => (selectedOrder?.payments ?? []).map((p) => ({
    sourceType: 'payment' as const,
    sourceId: p.id,
  })),
  [selectedOrder?.payments?.map((p) => p.id).join(',')]
)

const { journalEntryRefs, ... } = useJournalEntryRefs([
  { sourceType: 'sales_order', sourceId: selectedOrder?.isFulfilled ? selectedOrder?.id : undefined },
  ...paymentSources,
])
```

### useInvoicesWorkspace.ts

Remove the `sales_order` source from the current fetch. Instead, lazy-fetch the full sales order when an invoice is selected (using `useLazyGetSalesOrderQuery`), then derive sources from it:

```ts
// Fetch full order to get payment IDs
const [triggerGetSalesOrder] = useLazyGetSalesOrderQuery()
const [fullOrder, setFullOrder] = useState(null)

useEffect(() => {
  if (selectedInvoice?.salesOrder?.id) {
    triggerGetSalesOrder(selectedInvoice.salesOrder.id).unwrap().then(setFullOrder)
  } else {
    setFullOrder(null)
  }
}, [selectedInvoice?.salesOrder?.id])

const sources = useMemo(() => [
  { sourceType: 'sales_order', sourceId: fullOrder?.isFulfilled ? fullOrder?.id : undefined },
  ...(fullOrder?.payments ?? []).map((p) => ({ sourceType: 'payment', sourceId: p.id })),
], [fullOrder])

const { journalEntryRefs, ... } = useJournalEntryRefs(sources)
```

### useGRNWorkspace.ts

Replace single `goods_received_note` source with combined sources from the parent PO:

```ts
const sources = useMemo(() => [
  { sourceType: 'goods_received_note', sourceId: selectedGRN?.id },
  ...(selectedGRN?.purchaseOrder?.vendorPayments ?? []).map((p) => ({
    sourceType: 'vendor_payment',
    sourceId: p.id,
  })),
], [selectedGRN])

const { journalEntryRefs, ... } = useJournalEntryRefs(sources)
```

Switch from `useJournalEntryRef` (single) to `useJournalEntryRefs` (multiple).

### useVendorPaymentsWorkspace.ts

Replace single `vendor_payment` source with combined sources from the parent PO:

```ts
const sources = useMemo(() => [
  ...(selectedPayment?.purchaseOrder?.goodsReceivedNotes ?? []).map((grn) => ({
    sourceType: 'goods_received_note',
    sourceId: grn.id,
  })),
  ...(selectedPayment?.purchaseOrder?.vendorPayments ?? []).map((p) => ({
    sourceType: 'vendor_payment',
    sourceId: p.id,
  })),
], [selectedPayment])

const { journalEntryRefs, ... } = useJournalEntryRefs(sources)
```

Switch from `useJournalEntryRef` (single) to `useJournalEntryRefs` (multiple).

## What Does NOT Change

- `JournalEntriesTable.tsx` — no column changes
- Backend purchasing side — already correct
- JE navigation (`?ids=` multi-JE) — already works
- `resolveSourceRefNumber` — already handles all source types including `payment`
- `useJournalEntryRefs` hook — no changes needed

## Files to Change

**Backend:**
- `backend/src/modules/sales/services/sales-order.service.ts` (or mapper) — load payments relation
- `backend/src/modules/sales/dto/sales-order.dto.ts` — add payments to response DTO

**Frontend:**
- `frontend/src/types/index.ts` — add `payments` to `SalesOrder` interface
- `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts` — replace invoiceSources with paymentSources
- `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts` — lazy-fetch order, derive sources
- `frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts` — expand to combined sources
- `frontend/src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts` — expand to combined sources

## Testing

- `useOrdersWorkspace.test.tsx` — verify payment JEs are fetched, invoice JEs are not
- `useInvoicesWorkspace.test.tsx` — verify full order is fetched, correct sources derived
- `useGRNWorkspace` — verify combined sources include vendor payments from parent PO
- `useVendorPaymentsWorkspace` — verify combined sources include GRN from parent PO
