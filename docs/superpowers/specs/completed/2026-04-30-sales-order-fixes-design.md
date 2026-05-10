# Design Spec: Sales Order Price and Journal Entry Reference Fixes

## Problem Statement
1.  **Price Overwrite on Edit:** When editing a Sales Order, unit prices are overwritten with `0.00` due to a race condition in `CreateSalesOrderPage.tsx`. The `selectedCustomer` state and the form `reset()` call happen in the same render cycle, and React may re-run the price recalculation effect with the new customer after `orderToLoad` clears but before prices are locked in.
2.  **Incomplete Journal Entry (JE) References:** Payment views only show the payment's own JE. Invoice-linked payments with a related Sales Order fulfillment JE do not surface that JE in the Payment view.

## Current State (verified against code)

### Bug 1: Price Overwrite
`CreateSalesOrderPage.tsx` already has a guard at the price recalculation effect:
```typescript
if (loadingOrder || orderToLoad) {
  return
}
```
However, in the reset effect (`useEffect` on `[orderToLoad, products, customers, reset]`), `setSelectedCustomer(customer)` is called **before** `setOrderToLoad(null)`. React batches these state updates, but the `selectedCustomer` change triggers the price effect with `orderToLoad` already cleared in the same flush — allowing prices to be overwritten.

**Fix:** Move `setSelectedCustomer` to **after** `setOrderToLoad(null)` and `setLoadingOrder(false)`, so that when the price effect fires the guard is no longer needed for this case. No `setTimeout` hack, no new state variable.

### Bug 2: JE References — What's already done vs. what's missing

| View | Status |
|------|--------|
| Sales Order view | Already correct — shows fulfillment JE + all payment JEs via `useJournalEntryRefs` |
| Invoice view | **Already done** — `useInvoicesWorkspace.ts` already builds `jeSources` with `sales_order` source when `fullOrder?.isFulfilled` and all payment sources |
| Payment view | **Not done** — `usePaymentsWorkspace.ts` only passes `{ sourceType: 'payment', sourceId: selectedPayment?.id }` |

### Backend: `directPayments` not merged into DTO
`SalesOrderQueryService.findById` already fetches `directPayments` (payments with no `invoiceId` that mention the order number in notes), but instead of passing them to the mapper it tacks them on as a side-car property:
```typescript
const dto = mapSalesOrderToResponseDto(order);  // directPayments NOT passed
(dto as any).directPayments = directPayments;    // bolted on separately
```
The mapper signature needs a second parameter and must merge direct payments into `dto.payments`.

## Proposed Changes

### 1. Backend: Merge Direct Payments into DTO (2 files)

**`sales-order.mapper.ts`** — Accept optional `directPayments` parameter and merge with invoice payments, deduped by ID.

**`sales-order-query.service.ts`** — Pass `directPayments` to `mapSalesOrderToResponseDto` instead of bolting them on after.

### 2. Frontend: Fix Price Overwrite Race Condition (1 file)

**`CreateSalesOrderPage.tsx`** — In the reset effect, reorder state updates so `setSelectedCustomer` is called **after** `setOrderToLoad(null)` and `setLoadingOrder(false)`. This ensures the price recalculation effect fires with `orderToLoad` still truthy when `selectedCustomer` changes, keeping the existing guard effective.

### 3. Frontend: Payment View JE References (1 file)

**`usePaymentsWorkspace.ts`** — Add `useLazyGetSalesOrderQuery` to fetch the related order when `selectedPayment?.relatedOrderId` is present (this field is populated only for invoice-linked payments whose invoice has a `salesOrderId`). Include `{ sourceType: 'sales_order', sourceId: relatedOrder?.id }` when `relatedOrder?.isFulfilled` is true.

> Note: `relatedOrderId` on `PaymentListItem` is derived from `payment.invoice?.salesOrder?.id` — it is only set for invoice-linked payments, never for direct payments. Direct payments surface through the enriched Sales Order DTO (Task 1), not through the Payment view.

## Technical Details

### Backend Changes

**`backend/src/modules/sales/services/sales-order.mapper.ts`**
- Change signature to `mapSalesOrderToResponseDto(order: SalesOrder, directPayments?: Payment[])`
- Build `invoicePayments` from `order.invoices`
- Build `mappedDirectPayments` from the new parameter
- Merge and deduplicate by ID into `payments`

**`backend/src/modules/sales/services/sales-order-query.service.ts`**
- In `findById`, replace:
  ```typescript
  const dto = mapSalesOrderToResponseDto(order);
  (dto as any).directPayments = directPayments;
  ```
  with:
  ```typescript
  const dto = mapSalesOrderToResponseDto(order, directPayments);
  ```

### Frontend Changes

**`frontend/src/pages/sales/CreateSalesOrderPage.tsx`**
- In the reset effect, reorder the last three lines from:
  ```typescript
  setOrderToLoad(null)
  setLoadingOrder(false)
  // (setSelectedCustomer called earlier, before reset)
  ```
  to call `setSelectedCustomer` last, after both guards are cleared — but since the existing guard checks `orderToLoad`, we instead move `setSelectedCustomer(customer)` to run **after** `setOrderToLoad(null)`:
  ```typescript
  reset({ ... })
  setOrderToLoad(null)
  setLoadingOrder(false)
  if (customer) setSelectedCustomer(customer)
  ```

**`frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`**
- Import `useLazyGetSalesOrderQuery` from `@/store/api/salesApi`
- Add state: `const [relatedOrder, setRelatedOrder] = useState<any>(null)`
- Add effect: fetch order when `selectedPayment?.relatedOrderId` changes; clear when absent
- Update `useJournalEntryRefs` call to include both sources:
  ```typescript
  useJournalEntryRefs([
    { sourceType: 'payment', sourceId: selectedPayment?.id },
    { sourceType: 'sales_order', sourceId: relatedOrder?.isFulfilled ? relatedOrder?.id : undefined },
  ])
  ```

## Verification Plan

### Automated Tests
- **Backend unit test:** Add case to query service spec verifying `findById` merges direct payments into `dto.payments` (not just `dto.directPayments`).
- **Frontend unit test:** Add case to `CreateSalesOrderPage.test.tsx` verifying that loading an existing order for edit preserves the original unit prices.

### Manual Verification
1. Create a Sales Order with a custom price (not from any price list).
2. Edit the Sales Order — verify the price is unchanged after the form loads.
3. Fulfill the Sales Order (creates fulfillment JE).
4. Record a direct payment (creates payment JE — no invoice).
5. Link an invoice and record a second payment (creates another payment JE).
6. Open the Sales Order view — verify all 3 JEs are shown.
7. Open the Invoice view — verify fulfillment JE + both payment JEs are shown.
8. Open each Payment view — for the invoice-linked payment, verify the fulfillment JE is also shown.
