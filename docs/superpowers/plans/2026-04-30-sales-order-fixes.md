# Sales Order Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Sales Order price overwrite during edit and ensure all related Journal Entries are visible in Sales Order, Invoice, and Payment views.

**Architecture:** 
1. Enrich Sales Order DTO with direct payments on the backend.
2. Stabilize frontend price handling by ignoring updates during initial form population.
3. Update frontend hooks to include fulfillment and all payment JEs in the source list.

**Tech Stack:** NestJS (Backend), React (Frontend), TypeORM

---

### Task 1: Backend - Enrich Sales Order Response

**Files:**
- Modify: `backend/src/modules/sales/services/sales-order-query.service.ts`
- Modify: `backend/src/modules/sales/services/sales-order.mapper.ts`

- [ ] **Step 1: Update Mapper to handle direct payments**
Modify `mapSalesOrderToResponseDto` to merge `directPayments` if they exist.

```typescript
// backend/src/modules/sales/services/sales-order.mapper.ts
export function mapSalesOrderToResponseDto(order: SalesOrder, directPayments?: any[]): SalesOrderResponseDto {
  const invoicePayments = (order.invoices ?? []).flatMap(
    (invoice) =>
      (invoice.payments ?? []).map((payment) => ({
        id: payment.id,
        paymentNumber: payment.paymentNumber,
        amount: Number(payment.amount),
        paymentDate: payment.paymentDate,
        status: payment.status,
      })),
  );

  const mappedDirectPayments = (directPayments ?? []).map(p => ({
    id: p.id,
    paymentNumber: p.paymentNumber,
    amount: Number(p.amount),
    paymentDate: p.paymentDate,
    status: p.status,
  }));

  // Combine and remove duplicates by ID
  const allPayments = [...invoicePayments, ...mappedDirectPayments].filter(
    (v, i, a) => a.findIndex(t => t.id === v.id) === i
  );

  return {
    // ... rest of mapping
    payments: allPayments,
    // ...
  };
}
```

- [ ] **Step 2: Update Query Service to pass direct payments**
Update `findById` to pass the fetched `directPayments` to the mapper.

```typescript
// backend/src/modules/sales/services/sales-order-query.service.ts
// Inside findById
const dto = mapSalesOrderToResponseDto(order, directPayments);
return dto;
```

- [ ] **Step 3: Commit**
```bash
git add backend/src/modules/sales/services/sales-order-query.service.ts backend/src/modules/sales/services/sales-order.mapper.ts
git commit -m "feat(backend): include direct payments in sales order response"
```

### Task 2: Frontend - Stabilize Price Handling on Edit

**Files:**
- Modify: `frontend/src/pages/sales/CreateSalesOrderPage.tsx`

- [ ] **Step 1: Add isInitialLoad state**
```typescript
const [isInitialLoad, setIsInitialLoad] = useState(false);
```

- [ ] **Step 2: Set isInitialLoad during data fetching**
Update `loadSalesOrder` and the reset effect.

```typescript
const loadSalesOrder = async (orderId: string) => {
    setLoadingOrder(true);
    setIsInitialLoad(true); // Set true here
    // ...
}

useEffect(() => {
    if (orderToLoad && products.length > 0) {
        // ... mapping logic
        reset({ ... });
        setOrderToLoad(null);
        setLoadingOrder(false);
        // Delay clearing isInitialLoad to ensure effects don't trigger
        setTimeout(() => setIsInitialLoad(false), 500);
    }
}, [orderToLoad, products, customers, reset]);
```

- [ ] **Step 3: Guard price re-calculation**
```typescript
useEffect(() => {
    if (isInitialLoad || loadingOrder || orderToLoad) {
      return;
    }
    // ... re-calculation logic
}, [selectedCustomer, setValue, loadingOrder, orderToLoad, isInitialLoad]);
```

- [ ] **Step 4: Commit**
```bash
git add frontend/src/pages/sales/CreateSalesOrderPage.tsx
git commit -m "fix(frontend): prevent price overwrite during sales order edit"
```

### Task 3: Frontend - Unified JE References in Invoices

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`

- [ ] **Step 1: Update jeSources to include fulfillment**
Ensure `jeSources` includes the Sales Order fulfillment.

```typescript
// frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts
const jeSources = useMemo(
    () => [
      { sourceType: 'sales_order' as const, sourceId: fullOrder?.isFulfilled ? fullOrder?.id : undefined },
      ...(fullOrder?.payments ?? []).map((payment) => ({ sourceType: 'payment' as const, sourceId: payment.id })),
    ],
    [fullOrder?.id, fullOrder?.isFulfilled, fullOrder?.payments],
)
```

- [ ] **Step 2: Commit**
```bash
git add frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts
git commit -m "feat(frontend): show all related JEs in invoice view"
```

### Task 4: Frontend - Unified JE References in Payments

**Files:**
- Modify: `frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts`

- [ ] **Step 1: Update jeSources to include related order fulfillment**
Fetch related order status to see if it's fulfilled.

```typescript
// frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts
// Add useLazyGetSalesOrderQuery
const [triggerGetSalesOrder] = useLazyGetSalesOrderQuery();
const [relatedOrder, setRelatedOrder] = useState<any>(null);

useEffect(() => {
    if (selectedPayment?.relatedOrderId) {
        triggerGetSalesOrder(selectedPayment.relatedOrderId).unwrap().then(setRelatedOrder);
    } else {
        setRelatedOrder(null);
    }
}, [selectedPayment?.relatedOrderId]);

const { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries } = useJournalEntryRefs([
    { sourceType: 'payment', sourceId: selectedPayment?.id },
    { sourceType: 'sales_order', sourceId: relatedOrder?.isFulfilled ? relatedOrder?.id : undefined },
]);
```

- [ ] **Step 2: Commit**
```bash
git add frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts
git commit -m "feat(frontend): show all related JEs in payment view"
```
