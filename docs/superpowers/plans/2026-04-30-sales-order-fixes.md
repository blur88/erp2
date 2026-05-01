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

**Context:** The reset effect calls `setSelectedCustomer(customer)` before `setOrderToLoad(null)` and `setLoadingOrder(false)`. React 18 automatic batching flushes all state updates from one event/effect in a single render, so when the price effect fires after that render, both guards (`orderToLoad`, `loadingOrder`) are already cleared — the existing guard cannot protect against the overwrite.

**Actual fix (implemented):** Two-part solution:
1. Reorder so `setSelectedCustomer` runs after `setOrderToLoad(null)` — same render, but with a `skipNextPriceRecalculationRef` ref set to `true` immediately before the customer update.
2. The price effect checks `skipNextPriceRecalculationRef.current` first and skips exactly one recalculation (the one triggered by edit-mode customer load), then clears the ref.

This is more reliable than the state-reorder alone because React 18 batching means the guard state is cleared in the same render flush as `setSelectedCustomer`.

- [x] **Step 1: Add skip ref and reorder state updates** *(implemented)*

```typescript
// frontend/src/pages/sales/CreateSalesOrderPage.tsx
const skipNextPriceRecalculationRef = useRef(false)

// Price effect — check ref first:
useEffect(() => {
  if (loadingOrder || orderToLoad) return
  if (skipNextPriceRecalculationRef.current) {
    skipNextPriceRecalculationRef.current = false
    return
  }
  // ... recalculation logic
}, [selectedCustomer, setValue, loadingOrder, orderToLoad])

// Reset effect — set ref before customer update:
reset({ ... })
setOrderToLoad(null)
setLoadingOrder(false)
const customer = customers.find((c) => c.id === ...)
if (customer) {
  skipNextPriceRecalculationRef.current = true
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
