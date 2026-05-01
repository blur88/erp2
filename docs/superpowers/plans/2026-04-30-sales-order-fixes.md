# Sales Order Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Sales Order price overwrite during edit and ensure all related Journal Entries are visible in Sales Order, Invoice, and Payment views.

**Architecture:**
1. Fix backend mapper to properly merge direct payments into the DTO payments array.
2. Fix frontend race condition that causes prices to be overwritten during edit-mode load.
3. Add fulfillment JE source to Payment view workspace hook.

**Tech Stack:** NestJS (Backend), React (Frontend), TypeORM

> **Already complete — do not re-implement:**
> - `useInvoicesWorkspace.ts` already builds `jeSources` with SO fulfillment + all payment sources (lines 100–112).
> - `CreateSalesOrderPage.tsx` already has a `loadingOrder || orderToLoad` guard on the price effect (lines 181–183).

---

### Task 1: Backend - Properly Merge Direct Payments into DTO

**Files:**
- Modify: `backend/src/modules/sales/services/sales-order.mapper.ts`
- Modify: `backend/src/modules/sales/services/sales-order-query.service.ts`

**Context:** `findById` already fetches `directPayments` but bolts them on as `(dto as any).directPayments` after the mapper runs — they are never merged into `dto.payments`. The mapper needs a second parameter.

- [ ] **Step 1: Update mapper signature and merge direct payments**

In `mapSalesOrderToResponseDto`, add a `directPayments` parameter and merge with invoice payments:

```typescript
// backend/src/modules/sales/services/sales-order.mapper.ts
export function mapSalesOrderToResponseDto(order: SalesOrder, directPayments?: any[]): SalesOrderResponseDto {
  // ... existing mapping unchanged ...

  const invoicePayments = (order.invoices ?? []).flatMap(
    (invoice) =>
      (invoice.payments ?? []).map((payment) => ({
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        amount: Number(payment.amount),
        paymentDate: payment.paymentDate,
      })),
  );

  const mappedDirectPayments = (directPayments ?? []).map((p) => ({
    id: p.id,
    paymentNumber: p.paymentNumber,
    amount: Number(p.amount),
    paymentDate: p.paymentDate,
  }));

  const allPayments = [...invoicePayments, ...mappedDirectPayments].filter(
    (v, i, a) => a.findIndex((t) => t.id === v.id) === i,
  );

  return {
    // ... all existing fields ...
    payments: allPayments,
    // ...
  };
}
```

- [ ] **Step 2: Update query service to pass directPayments to mapper**

In `findById` (around line 448), replace the bolt-on pattern:
```typescript
// BEFORE:
const dto = mapSalesOrderToResponseDto(order);
(dto as any).directPayments = directPayments;
return dto;

// AFTER:
return mapSalesOrderToResponseDto(order, directPayments);
```

- [ ] **Step 3: Commit**
```bash
git add backend/src/modules/sales/services/sales-order-query.service.ts backend/src/modules/sales/services/sales-order.mapper.ts
git commit -m "fix(backend): merge direct payments into sales order DTO payments array"
```

---

### Task 2: Frontend - Fix Price Overwrite Race Condition

**Files:**
- Modify: `frontend/src/pages/sales/CreateSalesOrderPage.tsx`

**Context:** The reset effect (lines 230–279) calls `setSelectedCustomer(customer)` at line 252 — before `reset()`, `setOrderToLoad(null)`, and `setLoadingOrder(false)`. Because React batches these updates, the price recalculation effect fires with `selectedCustomer` changed but `orderToLoad` already cleared in the same flush, bypassing the guard. The fix is to move `setSelectedCustomer` to run **after** `setOrderToLoad(null)`.

- [ ] **Step 1: Reorder state updates in the reset effect**

In the `useEffect` on `[orderToLoad, products, customers, reset]`, move the `setSelectedCustomer` call to after `setOrderToLoad(null)` and `setLoadingOrder(false)`:

```typescript
// frontend/src/pages/sales/CreateSalesOrderPage.tsx
useEffect(() => {
  if (orderToLoad && products.length > 0) {
    const itemsToReset = orderToLoad.items?.map((item: any) => {
      // ... unchanged mapping ...
    })

    reset({
      customerId: orderToLoad.customerId || orderToLoad.customer?.id || '',
      orderDate: orderToLoad.orderDate ? new Date(orderToLoad.orderDate).toISOString().split('T')[0] : getCurrentDate(),
      notes: orderToLoad.notes || '',
      shipping: orderToLoad.shippingAmount || 0,
      items: itemsToReset || [/* default item */],
    })

    // Clear guards BEFORE setting customer so the price effect fires
    // with orderToLoad already null — the guard remains effective
    setOrderToLoad(null)
    setLoadingOrder(false)

    // Set customer last: price effect will see orderToLoad === null
    // but since we're in edit mode and prices are already reset above,
    // the guard `loadingOrder` covers this transition
    const customer = customers.find((c) => c.id === (orderToLoad.customerId || orderToLoad.customer?.id))
    if (customer) {
      setSelectedCustomer(customer)
    }
  }
}, [orderToLoad, products, customers, reset])
```

> Note: After this reorder, the price effect will fire with `orderToLoad` already null. To keep the guard working, also update the price effect dependency to include `isEditMode` or simply widen the guard to cover the initial-load case. The simplest safe guard: check `loadingOrder` is `false` before the effect proceeds — which is already in place. Verify this in testing.

- [ ] **Step 2: Commit**
```bash
git add frontend/src/pages/sales/CreateSalesOrderPage.tsx
git commit -m "fix(frontend): prevent price overwrite during sales order edit-mode load"
```

---

### Task 3: Frontend - Add Fulfillment JE to Payment View

**Files:**
- Modify: `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`

**Context:** `usePaymentsWorkspace` currently only passes the payment's own JE source. `PaymentListItem.relatedOrderId` is populated from `payment.invoice?.salesOrder?.id` — present only for invoice-linked payments. Direct payments will never have `relatedOrderId`, and their JE is surfaced through the Sales Order view (Task 1).

- [ ] **Step 1: Add lazy SO query and relatedOrder state**

```typescript
// frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts
import { useLazyGetSalesOrderQuery } from '@/store/api/salesApi'

// inside usePaymentsWorkspace:
const [triggerGetSalesOrder] = useLazyGetSalesOrderQuery()
const [relatedOrder, setRelatedOrder] = useState<any>(null)

useEffect(() => {
  if (selectedPayment?.relatedOrderId) {
    triggerGetSalesOrder(selectedPayment.relatedOrderId)
      .unwrap()
      .then(setRelatedOrder)
      .catch(() => setRelatedOrder(null))
  } else {
    setRelatedOrder(null)
  }
}, [selectedPayment?.relatedOrderId])
```

- [ ] **Step 2: Update useJournalEntryRefs to include SO fulfillment**

```typescript
const { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries } = useJournalEntryRefs([
  { sourceType: 'payment', sourceId: selectedPayment?.id },
  { sourceType: 'sales_order', sourceId: relatedOrder?.isFulfilled ? relatedOrder?.id : undefined },
])
```

- [ ] **Step 3: Commit**
```bash
git add frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts
git commit -m "feat(frontend): show related SO fulfillment JE in payment view"
```
