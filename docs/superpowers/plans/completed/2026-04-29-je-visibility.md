# JE Visibility: Consistent Combined View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every document page (Sales Order, Invoice, GRN, Vendor Payment) shows the complete set of related Journal Entries — fulfillment JE + all payment JEs — so a solo operator can audit the full accounting picture from any document.

**Architecture:** Backend adds a top-level `payments` array to the SalesOrder response DTO (collected from `invoices[*].payments`). Frontend workspace hooks are updated to fetch JEs from all relevant sources. PO, GRN, and VendorPayments pages migrate from `useJournalEntryRef` (single — stops at first match) to `useJournalEntryRefs` (multiple) to show the complete JE set.

**Tech Stack:** NestJS 11, TypeORM, React 19, RTK Query, Vitest

---

## File Map

**Modified:**
- `backend/src/modules/sales/dto/sales-order.dto.ts` — add `payments` field to `SalesOrderResponseDto`
- `backend/src/modules/sales/services/sales-order.mapper.ts` — populate top-level `payments` from `invoices[*].payments`
- `frontend/src/types/index.ts` — add `payments` field to `SalesOrder` interface
- `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts` — replace `invoiceSources` with `paymentSources`
- `frontend/src/pages/sales/hooks/useOrdersWorkspace.test.tsx` — add test for payment JE fetch
- `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts` — lazy-fetch full order, derive sources
- `frontend/src/pages/sales/hooks/useInvoicesWorkspace.test.tsx` — add test for order fetch + correct sources
- `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts` — switch to `useJournalEntryRefs` (currently uses single-ref hook, misses vendor payment JEs)
- `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx` — update to use `journalEntryRefs` array and `navigateToJournalEntries`
- `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx` — accept `journalEntryRefs` array
- `frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts` — switch to `useJournalEntryRefs`, include vendor payments from parent PO
- `frontend/src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts` — switch to `useJournalEntryRefs`, include GRNs from parent PO
- `frontend/src/pages/purchasing/GoodsReceivedPage.tsx` — update `navigateToJournalEntry` → `navigateToJournalEntries`, update context header prop
- `frontend/src/pages/purchasing/VendorPaymentsPage.tsx` — same as GoodsReceivedPage
- `frontend/src/pages/purchasing/components/GRNContextHeader.tsx` — accept `journalEntryRefs` array instead of single ref
- `frontend/src/pages/purchasing/components/VendorPaymentContextHeader.tsx` — same as GRNContextHeader

---

## Task 1: Add `payments` to SalesOrderResponseDto and mapper

**Files:**
- Modify: `backend/src/modules/sales/dto/sales-order.dto.ts`
- Modify: `backend/src/modules/sales/services/sales-order.mapper.ts`

- [ ] **Step 1: Add `payments` field to `SalesOrderResponseDto`**

In `backend/src/modules/sales/dto/sales-order.dto.ts`, add after the `invoices` field (around line 302):

```ts
  @ApiProperty({ type: 'array', items: { type: 'object' } })
  payments: {
    id: string;
    paymentNumber: string;
    amount: number;
    paymentDate: Date | string;
  }[];
```

- [ ] **Step 2: Populate `payments` in the mapper**

In `backend/src/modules/sales/services/sales-order.mapper.ts`, after the `invoices` mapping (after line 103, before `createdAt`):

```ts
    payments: (order.invoices ?? []).flatMap(
      (invoice) =>
        (invoice.payments ?? []).map((payment) => ({
          id: payment.id,
          paymentNumber: payment.paymentNumber,
          amount: Number(payment.amount),
          paymentDate: payment.paymentDate,
        })),
    ),
```

- [ ] **Step 3: Build backend and verify no TypeScript errors**

```bash
cd backend && npm run build
```
Expected: exits with code 0, no errors.

- [ ] **Step 4: Verify API response includes `payments`**

```bash
TOKEN=$(curl -s http://localhost:3000/api/auth/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":".Aa880912"}' \
  | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

# Get an order ID that has payments
curl -s "http://localhost:3000/api/sales-orders?limit=5" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | grep -E '"id"|"paidAmount"' | head -20
```

Then fetch the full order:
```bash
curl -s "http://localhost:3000/api/sales-orders/<ORDER_ID>" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool | grep -E "payments|paymentNumber"
```
Expected: `"payments": [{ "id": "...", "paymentNumber": "PAY-...", ... }]` at the top level.

- [ ] **Step 5: Rebuild Docker backend and restart**

```bash
cd /home/blur/erp2
docker compose build backend --quiet && docker compose up -d backend
sleep 15
```

- [ ] **Step 6: Commit**

```bash
cd /home/blur/erp2
git add backend/src/modules/sales/dto/sales-order.dto.ts \
        backend/src/modules/sales/services/sales-order.mapper.ts
git commit -m "feat(sales): add top-level payments array to SalesOrderResponseDto"
```

---

## Task 2: Add `payments` to frontend `SalesOrder` type

**Files:**
- Modify: `frontend/src/types/index.ts`

- [ ] **Step 1: Add `payments` to the `SalesOrder` interface**

In `frontend/src/types/index.ts`, inside the `SalesOrder` interface (after the `invoices` field, around line 237), add:

```ts
  payments?: {
    id: string;
    paymentNumber: string;
    amount: number;
    paymentDate: Date | string;
  }[];
```

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: exits with code 0.

- [ ] **Step 3: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/types/index.ts
git commit -m "feat(types): add payments array to SalesOrder interface"
```

---

## Task 3: Update `useOrdersWorkspace` — replace invoiceSources with paymentSources

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`
- Modify: `frontend/src/pages/sales/hooks/useOrdersWorkspace.test.tsx`

- [ ] **Step 1: Write a failing test**

In `frontend/src/pages/sales/hooks/useOrdersWorkspace.test.tsx`, add after the existing `makeOrder` function (update `makeOrder` to accept payments and add a new test):

```ts
function makeOrderWithPayments(id: string) {
  return {
    ...makeOrder(id),
    isFulfilled: true,
    payments: [
      { id: 'pay-1', paymentNumber: 'PAY-001', amount: 100, paymentDate: '2026-04-01' },
    ],
  }
}
```

Add this test inside the `describe('useOrdersWorkspace')` block:

```ts
it('fetches payment JEs when order has payments', async () => {
  const store = configureStore({ reducer: { sales: salesReducer } })
  const wrapper = ({ children }: PropsWithChildren) => (
    <Provider store={store}>
      <MemoryRouter initialEntries={['/sales/orders']}>{children}</MemoryRouter>
    </Provider>
  )

  renderHook(
    () =>
      useOrdersWorkspace({
        dispatch: store.dispatch,
        getState: () => store.getState() as any,
        orders: [makeOrderWithPayments('ord-1') as any],
        selectedOrder: makeOrderWithPayments('ord-1') as any,
        refetchOrders: vi.fn(),
      }),
    { wrapper },
  )

  await waitFor(() => {
    expect(fetchJournalEntries).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'payment', sourceId: 'pay-1' }),
    )
  })
})

it('does not fetch invoice JEs', async () => {
  const store = configureStore({ reducer: { sales: salesReducer } })
  const wrapper = ({ children }: PropsWithChildren) => (
    <Provider store={store}>
      <MemoryRouter initialEntries={['/sales/orders']}>{children}</MemoryRouter>
    </Provider>
  )

  renderHook(
    () =>
      useOrdersWorkspace({
        dispatch: store.dispatch,
        getState: () => store.getState() as any,
        orders: [makeOrder('ord-1') as any],
        selectedOrder: { ...makeOrder('ord-1'), invoices: [{ id: 'inv-1', invoiceNumber: 'INV-001' }] } as any,
        refetchOrders: vi.fn(),
      }),
    { wrapper },
  )

  await new Promise((r) => setTimeout(r, 50))
  expect(fetchJournalEntries).not.toHaveBeenCalledWith(
    expect.objectContaining({ sourceType: 'invoice' }),
  )
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/sales/hooks/useOrdersWorkspace.test.tsx
```
Expected: the two new tests fail (invoiceSources still present).

- [ ] **Step 3: Update `useOrdersWorkspace.ts`**

In `frontend/src/pages/sales/hooks/useOrdersWorkspace.ts`, replace the `invoiceSources` memo and the `useJournalEntryRefs` call (lines 111–126) with:

```ts
  const paymentSources = useMemo(
    () => (selectedOrder?.payments ?? []).map((p) => ({
      sourceType: 'payment' as const,
      sourceId: p.id,
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedOrder?.payments?.map((p) => p.id).join(',')],
  )

  const { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries } = useJournalEntryRefs([
    {
      sourceType: 'sales_order',
      sourceId: selectedOrder?.isFulfilled ? selectedOrder?.id : undefined,
    },
    ...paymentSources,
  ])
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/sales/hooks/useOrdersWorkspace.test.tsx
```
Expected: all tests pass.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/pages/sales/hooks/useOrdersWorkspace.ts \
        frontend/src/pages/sales/hooks/useOrdersWorkspace.test.tsx
git commit -m "feat(sales): show payment JEs on orders page, remove invoice JE fetch"
```

---

## Task 4: Update `useInvoicesWorkspace` — lazy-fetch full order for JE sources

**Files:**
- Modify: `frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts`
- Modify: `frontend/src/pages/sales/hooks/useInvoicesWorkspace.test.tsx`

- [ ] **Step 1: Write failing tests**

In `frontend/src/pages/sales/hooks/useInvoicesWorkspace.test.tsx`, add the following mock and tests.

Add to the top-level mocks section (alongside existing `vi.mock` calls):

```ts
const triggerGetSalesOrder = vi.fn((id: string) => ({
  unwrap: vi.fn().mockResolvedValue({
    id,
    orderNumber: `SO-${id}`,
    isFulfilled: true,
    payments: [
      { id: `pay-${id}`, paymentNumber: `PAY-001`, amount: 100, paymentDate: '2026-04-01' },
    ],
    invoices: [],
  }),
}))

vi.mock('@/store/api/salesApi', () => ({
  useLazyGetSalesOrderQuery: () => [triggerGetSalesOrder],
}))
```

Add these tests inside the `describe('useInvoicesWorkspace')` block:

```ts
it('fetches the full sales order when an invoice is selected', async () => {
  const { result } = renderInvoicesWorkspace('/sales/invoices')

  await act(async () => {
    result.current.handleInvoiceSelect(makeInvoice('inv-1'))
  })

  await waitFor(() => {
    expect(triggerGetSalesOrder).toHaveBeenCalledWith('order-inv-1')
  })
})

it('fetches payment JEs from the full order', async () => {
  const { result } = renderInvoicesWorkspace('/sales/invoices')

  await act(async () => {
    result.current.handleInvoiceSelect(makeInvoice('inv-1'))
  })

  await waitFor(() => {
    expect(fetchJournalEntries).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'payment', sourceId: 'pay-order-inv-1' }),
    )
  })
})

it('does not fetch sales_order JEs directly from invoice', async () => {
  renderInvoicesWorkspace('/sales/invoices')

  await new Promise((r) => setTimeout(r, 50))
  expect(fetchJournalEntries).not.toHaveBeenCalledWith(
    expect.objectContaining({ sourceType: 'sales_order', sourceId: 'order-inv-1' }),
  )
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/sales/hooks/useInvoicesWorkspace.test.tsx
```
Expected: new tests fail.

- [ ] **Step 3: Update `useInvoicesWorkspace.ts`**

Replace the current `useJournalEntryRefs` block (lines 85–88) and add the necessary imports and state. The full updated imports section at top of file:

```ts
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useJournalEntryRefs } from '@/hooks/useJournalEntryRefs'
import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import type { EntityWorkspaceReturn } from '@/hooks/useEntityWorkspace'
import type { AppDispatch } from '@/store'
import { useLazyGetSalesOrderQuery } from '@/store/api/salesApi'
import { clearError, setSelectedInvoice } from '@/store/slices/salesSlice'
import type { InvoiceItem, SalesOrder } from '@/types'
```

Replace the `useJournalEntryRefs` call block (lines 85–88) with:

```ts
  const [triggerGetSalesOrder] = useLazyGetSalesOrderQuery()
  const [fullOrder, setFullOrder] = useState<SalesOrder | null>(null)

  useEffect(() => {
    if (selectedInvoice?.salesOrder?.id) {
      triggerGetSalesOrder(selectedInvoice.salesOrder.id)
        .unwrap()
        .then(setFullOrder)
        .catch(() => setFullOrder(null))
    } else {
      setFullOrder(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedInvoice?.salesOrder?.id])

  const jeSourcesKey = [
    fullOrder?.isFulfilled ? `sales_order:${fullOrder?.id}` : '',
    ...(fullOrder?.payments ?? []).map((p) => `payment:${p.id}`),
  ].join(',')

  const jeSources = useMemo(
    () => [
      { sourceType: 'sales_order' as const, sourceId: fullOrder?.isFulfilled ? fullOrder?.id : undefined },
      ...(fullOrder?.payments ?? []).map((p) => ({ sourceType: 'payment' as const, sourceId: p.id })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [jeSourcesKey],
  )

  const { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries } = useJournalEntryRefs(jeSources)
```

Also remove the old `useJournalEntryRefs` import and add the new one if not already present (the import was already `useJournalEntryRefs` — just verify the hook import at top is `useJournalEntryRefs` not `useJournalEntryRef`).

Update the return statement to include `navigateToJournalEntries`:

```ts
  return {
    ...workspace,
    focusedInvoiceIndex: workspace.focusedIndex,
    invoiceListRef: workspace.listRef,
    deletedInvoicesDialogOpen,
    setDeletedInvoicesDialogOpen,
    printDialogOpen,
    setPrintDialogOpen,
    journalEntryRefs,
    journalEntryRefsLoading,
    navigateToJournalEntries,
    handleInvoiceSelect,
    handleSalesOrderClick,
    handleNavigateToPayment,
    handleViewDeletedAction: () => {
      setDeletedInvoicesDialogOpen(true)
    },
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/sales/hooks/useInvoicesWorkspace.test.tsx
```
Expected: all tests pass.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/pages/sales/hooks/useInvoicesWorkspace.ts \
        frontend/src/pages/sales/hooks/useInvoicesWorkspace.test.tsx
git commit -m "feat(sales): show combined sales order + payment JEs on invoices page"
```

---

## Task 5: Update `usePurchaseOrdersWorkspace` — switch from single to multi JE refs

**Files:**
- Modify: `frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts`
- Modify: `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`
- Modify: `frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx`

The PO workspace currently uses `useJournalEntryRef` (single hook) which stops at the first JE it finds. So if a GRN JE exists, vendor payment JEs are never shown. We switch to `useJournalEntryRefs` to return all.

- [ ] **Step 1: Update `usePurchaseOrdersWorkspace.ts`**

Replace the import:
```ts
import { useJournalEntryRef } from '@/hooks/useJournalEntryRef'
```
with:
```ts
import { useJournalEntryRefs } from '@/hooks/useJournalEntryRefs'
import type { JournalEntryRef } from '@/hooks/useJournalEntryRef'
```

Replace the `useJournalEntryRef` call (lines 118–119) with `useJournalEntryRefs`:
```ts
  const { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries } =
    useJournalEntryRefs(journalSources)
```

Remove the `PurchaseJournalEntryRef` interface export (it's no longer used by the context header).

Update the return object — replace `journalEntryRef` / `journalEntryRefLoading` / `navigateToJournalEntry` with:
```ts
    journalEntryRefs,
    journalEntryRefsLoading,
    navigateToJournalEntries,
```

- [ ] **Step 2: Update `PurchaseOrdersPage.tsx`**

Find where `journalEntryRef`, `journalEntryRefLoading`, and `onNavigateToJournalEntry` are passed to `PurchaseOrderContextHeader` (around line 164) and update:

```tsx
journalEntryRefs={workspace.journalEntryRefs}
journalEntryRefLoading={workspace.journalEntryRefsLoading}
onNavigateToJournalEntry={workspace.navigateToJournalEntries}
```

- [ ] **Step 3: Update `PurchaseOrderContextHeader.tsx`**

Remove the `PurchaseJournalEntryRef` import:
```ts
import type { PurchaseJournalEntryRef } from '../hooks/usePurchaseOrdersWorkspace'
```

Add:
```ts
import type { JournalEntryRef } from '@/hooks/useJournalEntryRef'
```

Update Props interface — replace:
```ts
  journalEntryRef: PurchaseJournalEntryRef | null
```
with:
```ts
  journalEntryRefs: JournalEntryRef[]
```

Update the component function signature to use `journalEntryRefs`.

Replace the single ref render (around line 194) with multi-ref render:
```tsx
) : journalEntryRefs.length > 0 ? (
  <>
    {journalEntryRefs.map((ref, index) => (
      <span key={ref.sourceId}>
        <Typography
          component="button"
          onClick={onNavigateToJournalEntry}
          sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}
        >
          {ref.referenceNumber}
        </Typography>
        {index < journalEntryRefs.length - 1 && <span style={{ marginRight: 4 }}>,</span>}
      </span>
    ))}
  </>
```

Update any boolean guard `journalEntryRef ?` to `journalEntryRefs.length > 0 ?`.

- [ ] **Step 4: Fix filterbar test that mocks the workspace**

In `frontend/src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx`, find `journalEntryRef: null` and replace with `journalEntryRefs: []`.

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 6: Run PO filterbar test**

```bash
cd frontend && npx vitest run src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/pages/purchasing/hooks/usePurchaseOrdersWorkspace.ts \
        frontend/src/pages/purchasing/PurchaseOrdersPage.tsx \
        frontend/src/pages/purchasing/components/PurchaseOrderContextHeader.tsx \
        frontend/src/pages/purchasing/__tests__/PurchaseOrdersPage.filterbar.test.tsx
git commit -m "feat(purchasing): show all GRN + vendor payment JEs on purchase orders page"
```

---

## Task 6: Update `useGRNWorkspace` — combined GRN + vendor payment JEs

**Files:**
- Modify: `frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts`
- Modify: `frontend/src/pages/purchasing/GoodsReceivedPage.tsx`
- Modify: `frontend/src/pages/purchasing/components/GRNContextHeader.tsx`

- [ ] **Step 1: Update `useGRNWorkspace.ts`**

Replace the `useJournalEntryRef` import with `useJournalEntryRefs`:

```ts
import { useJournalEntryRefs } from '@/hooks/useJournalEntryRefs'
```

Remove the `GRNJournalEntryRef` interface export (it's no longer needed — `JournalEntryRef` from `useJournalEntryRefs` is used instead). Add this import:

```ts
import type { JournalEntryRef } from '@/hooks/useJournalEntryRef'
```

Replace the `useJournalEntryRef` call (lines 52–54) with:

```ts
  const grnSources = useMemo(
    () => [
      { sourceType: 'goods_received_note' as const, sourceId: selectedGRN?.id },
      ...(selectedGRN?.purchaseOrder?.vendorPayments ?? []).map((p: any) => ({
        sourceType: 'vendor_payment' as const,
        sourceId: p.id as string,
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedGRN?.id, (selectedGRN?.purchaseOrder?.vendorPayments ?? []).map((p: any) => p.id).join(',')],
  )

  const { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries } = useJournalEntryRefs(grnSources)
```

Add `useMemo` to the react import at the top.

Update the return object — replace `journalEntryRef` / `journalEntryRefLoading` with:

```ts
    journalEntryRefs,
    journalEntryRefsLoading,
    navigateToJournalEntries,
```

- [ ] **Step 2: Update `GoodsReceivedPage.tsx`**

Find the `navigateToJournalEntry` callback (around line 107) and replace it:

```ts
  const navigateToJournalEntry = useCallback(() => {
    workspace.navigateToJournalEntries()
  }, [workspace])
```

Find where `journalEntryRef` and `journalEntryRefLoading` are passed to the context header (around line 145) and update:

```tsx
journalEntryRefs={workspace.journalEntryRefs}
journalEntryRefLoading={workspace.journalEntryRefsLoading}
```

- [ ] **Step 3: Update `GRNContextHeader.tsx` to accept `journalEntryRefs` array**

In `frontend/src/pages/purchasing/components/GRNContextHeader.tsx`, update the `Props` interface. Replace:

```ts
  journalEntryRef: GRNJournalEntryRef | null
```

with:

```ts
  journalEntryRefs: JournalEntryRef[]
```

Add the import at the top:

```ts
import type { JournalEntryRef } from '@/hooks/useJournalEntryRef'
```

Update the destructured prop name in the component function signature from `journalEntryRef` to `journalEntryRefs`.

Find the rendering of the single ref (around line 134) and replace with a multi-ref render. The current pattern looks like:

```tsx
) : journalEntryRef ? (
  ...
    {journalEntryRef.referenceNumber}
  ...
```

Replace with:

```tsx
) : journalEntryRefs.length > 0 ? (
  <>
    {journalEntryRefs.map((ref, index) => (
      <span key={ref.sourceId}>
        <Typography
          component="button"
          onClick={onNavigateToJournalEntry}
          sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}
        >
          {ref.referenceNumber}
        </Typography>
        {index < journalEntryRefs.length - 1 && <span style={{ marginRight: 4 }}>,</span>}
      </span>
    ))}
  </>
```

Also update the condition guard that checks `journalEntryRef` for the loading state — replace `journalEntryRef` with `journalEntryRefs.length > 0` in any boolean checks.

- [ ] **Step 4: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/pages/purchasing/hooks/useGRNWorkspace.ts \
        frontend/src/pages/purchasing/GoodsReceivedPage.tsx \
        frontend/src/pages/purchasing/components/GRNContextHeader.tsx
git commit -m "feat(purchasing): show combined GRN + vendor payment JEs on GRN page"
```

---

## Task 7: Update `useVendorPaymentsWorkspace` — combined GRN + vendor payment JEs

**Files:**
- Modify: `frontend/src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts`
- Modify: `frontend/src/pages/purchasing/VendorPaymentsPage.tsx`
- Modify: `frontend/src/pages/purchasing/components/VendorPaymentContextHeader.tsx`

- [ ] **Step 1: Update `useVendorPaymentsWorkspace.ts`**

Replace the `useJournalEntryRef` import with `useJournalEntryRefs`:

```ts
import { useJournalEntryRefs } from '@/hooks/useJournalEntryRefs'
```

Add this import:

```ts
import type { JournalEntryRef } from '@/hooks/useJournalEntryRef'
```

Remove the `VPJournalEntryRef` interface export.

Replace the `useJournalEntryRef` call (lines 50–52) with:

```ts
  const vpSources = useMemo(
    () => [
      ...(selectedPayment?.purchaseOrder?.goodsReceivedNotes ?? []).map((grn: any) => ({
        sourceType: 'goods_received_note' as const,
        sourceId: grn.id as string,
      })),
      ...(selectedPayment?.purchaseOrder?.vendorPayments ?? []).map((p: any) => ({
        sourceType: 'vendor_payment' as const,
        sourceId: p.id as string,
      })),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      (selectedPayment?.purchaseOrder?.goodsReceivedNotes ?? []).map((g: any) => g.id).join(','),
      (selectedPayment?.purchaseOrder?.vendorPayments ?? []).map((p: any) => p.id).join(','),
    ],
  )

  const { journalEntryRefs, journalEntryRefsLoading, navigateToJournalEntries } = useJournalEntryRefs(vpSources)
```

Add `useMemo` to the react import at the top.

Update the return object — replace `journalEntryRef` / `journalEntryRefLoading` with:

```ts
    journalEntryRefs,
    journalEntryRefsLoading,
    navigateToJournalEntries,
```

- [ ] **Step 2: Update `VendorPaymentsPage.tsx`**

Find the `navigateToJournalEntry` callback (around line 105) and replace it:

```ts
  const navigateToJournalEntry = useCallback(() => {
    workspace.navigateToJournalEntries()
  }, [workspace])
```

Find where `journalEntryRef` and `journalEntryRefLoading` are passed to the context header (around line 143) and update:

```tsx
journalEntryRefs={workspace.journalEntryRefs}
journalEntryRefLoading={workspace.journalEntryRefsLoading}
```

- [ ] **Step 3: Update `VendorPaymentContextHeader.tsx` to accept `journalEntryRefs` array**

In `frontend/src/pages/purchasing/components/VendorPaymentContextHeader.tsx`, make the same changes as in Task 5 Step 3 for `GRNContextHeader.tsx`:

Update `Props` interface:
```ts
  journalEntryRefs: JournalEntryRef[]
```

Add import:
```ts
import type { JournalEntryRef } from '@/hooks/useJournalEntryRef'
```

Replace single ref render with multi-ref render:
```tsx
) : journalEntryRefs.length > 0 ? (
  <>
    {journalEntryRefs.map((ref, index) => (
      <span key={ref.sourceId}>
        <Typography
          component="button"
          onClick={onNavigateToJournalEntry}
          sx={{ fontSize: '0.8rem', color: 'primary.main', cursor: 'pointer', border: 'none', background: 'none', padding: 0 }}
        >
          {ref.referenceNumber}
        </Typography>
        {index < journalEntryRefs.length - 1 && <span style={{ marginRight: 4 }}>,</span>}
      </span>
    ))}
  </>
```

Update any boolean guards from `journalEntryRef` to `journalEntryRefs.length > 0`.

- [ ] **Step 4: Update existing tests that pass `journalEntryRef: null`**

In `frontend/src/pages/purchasing/components/__tests__/VendorPaymentContextHeader.test.tsx` and `GRNContextHeader.test.tsx`, replace all occurrences of:

```ts
journalEntryRef: null,
```

with:

```ts
journalEntryRefs: [],
```

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 6: Run existing purchasing context header tests**

```bash
cd frontend && npx vitest run src/pages/purchasing/components/__tests__/VendorPaymentContextHeader.test.tsx src/pages/purchasing/components/__tests__/GRNContextHeader.test.tsx
```
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
cd /home/blur/erp2
git add frontend/src/pages/purchasing/hooks/useVendorPaymentsWorkspace.ts \
        frontend/src/pages/purchasing/VendorPaymentsPage.tsx \
        frontend/src/pages/purchasing/components/VendorPaymentContextHeader.tsx \
        frontend/src/pages/purchasing/components/__tests__/VendorPaymentContextHeader.test.tsx \
        frontend/src/pages/purchasing/components/__tests__/GRNContextHeader.test.tsx
git commit -m "feat(purchasing): show combined GRN + vendor payment JEs on vendor payments page"
```

---

## Task 8: Final verification

- [ ] **Step 1: Run all affected test files**

```bash
cd frontend && npx vitest run \
  src/pages/sales/hooks/useOrdersWorkspace.test.tsx \
  src/pages/sales/hooks/useInvoicesWorkspace.test.tsx \
  src/pages/purchasing/components/__tests__/VendorPaymentContextHeader.test.tsx \
  src/pages/purchasing/components/__tests__/GRNContextHeader.test.tsx
```
Expected: all pass.

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npm run type-check
```
Expected: no errors.

- [ ] **Step 3: Lint check**

```bash
cd frontend && npm run lint
cd backend && npm run lint
```
Expected: no errors.

- [ ] **Step 4: Rebuild and restart Docker frontend**

```bash
cd /home/blur/erp2
docker compose build frontend --quiet && docker compose up -d frontend
sleep 15
```

- [ ] **Step 5: Manual smoke test**

1. Open the Sales Orders page — select a fulfilled, paid order → verify the JE panel shows both `JE-XX-XXX` (fulfillment) and `JE-XX-XXX` (payment) refs
2. Click "View Journal Entries" → verify it navigates to `/accounting/journal-entries?ids=...` showing both JEs
3. Open the Invoices page — select an invoice linked to the same order → verify same JE refs appear
4. Open the GRN page — select a received GRN → verify both the GRN JE and vendor payment JE appear
5. Open the Vendor Payments page — select a payment → verify both GRN JE and vendor payment JE appear
