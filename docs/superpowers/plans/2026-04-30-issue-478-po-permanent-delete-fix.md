# Issue #478 — PO Permanent Delete Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the permanent-delete deadlock for purchase orders with soft-deleted vendor payments, and fix error message masking in `GenericDeletedDialog`.

**Architecture:** Two independent fixes — (1) relax the backend `assertPermanentDeleteAllowed` guard to only block on real financial/inventory impact (`paidAmount > 0` or stock movements), not on the mere existence of soft-deleted/unpaid vendor payment records; (2) fix the frontend error handler in `GenericDeletedDialog` to correctly read `error.data` as a string (which is how `axiosBaseQuery` shapes it).

**Tech Stack:** NestJS 11 (backend), Jest (backend tests), React 19 / RTK Query (frontend), Vitest (frontend tests)

---

## File Map

| File | Change |
|------|--------|
| `backend/src/modules/purchasing/services/purchase-order-lifecycle.service.ts` | Relax `assertPermanentDeleteAllowed` vendor-payment check |
| `backend/src/modules/purchasing/services/purchase-order-lifecycle.service.spec.ts` | Update existing test + add new tests |
| `frontend/src/components/common/GenericDeletedDialog.tsx` | Fix `error.data.message` → `error.data` in all 4 catch blocks |
| `frontend/src/components/common/GenericDeletedDialog.test.tsx` | Add/update tests for error display in all 4 handlers |

---

## Task 1: Fix `assertPermanentDeleteAllowed` — update failing test first

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchase-order-lifecycle.service.spec.ts`

The existing test at line 201 asserts that the method throws when vendor payments exist. After the fix, soft-deleted/unpaid payments should not block deletion. We update this test and add a new one that asserts blocking when `paidAmount > 0`.

- [ ] **Step 1: Read the existing spec to understand the test structure**

Open `backend/src/modules/purchasing/services/purchase-order-lifecycle.service.spec.ts` and note the `assertPermanentDeleteAllowed` describe block (lines 187–218). The mock setup creates `mockVendorPayment` with `amount: 50` at line 62.

- [ ] **Step 2: Replace the existing "throws when vendor payments exist" test**

In `backend/src/modules/purchasing/services/purchase-order-lifecycle.service.spec.ts`, locate the `assertPermanentDeleteAllowed` describe block and replace its contents with the following three tests:

```typescript
describe('assertPermanentDeleteAllowed', () => {
  it('throws when stock movements exist for the purchase order', async () => {
    const count = jest.fn().mockResolvedValue(2);
    (poRepository.manager.getRepository as jest.Mock).mockReturnValue({ count });

    await expect(service.assertPermanentDeleteAllowed('po-1')).rejects.toThrow(
      'Cannot permanently delete purchase order with existing stock movements.',
    );
    expect(poRepository.manager.getRepository).toHaveBeenCalledWith(StockMovement);
    expect(count).toHaveBeenCalledWith({
      where: { referenceType: 'purchase_order', referenceId: 'po-1' },
    });
  });

  it('throws when the purchase order has a paid amount greater than zero', async () => {
    const count = jest.fn().mockResolvedValue(0);
    (poRepository.manager.getRepository as jest.Mock).mockReturnValue({ count });
    poRepository.findOne.mockResolvedValue({ ...mockOrder, paidAmount: 50 } as PurchaseOrder);

    await expect(service.assertPermanentDeleteAllowed('po-1')).rejects.toThrow(
      'Cannot permanently delete purchase order that has payments recorded. Please unpay first.',
    );
  });

  it('allows deletion when soft-deleted vendor payments exist but paidAmount is zero', async () => {
    const count = jest.fn().mockResolvedValue(0);
    (poRepository.manager.getRepository as jest.Mock).mockReturnValue({ count });
    poRepository.findOne.mockResolvedValue({ ...mockOrder, paidAmount: 0 } as PurchaseOrder);

    await expect(service.assertPermanentDeleteAllowed('po-1')).resolves.toBeUndefined();
  });

  it('resolves when neither stock movements nor paid amount exist', async () => {
    const count = jest.fn().mockResolvedValue(0);
    (poRepository.manager.getRepository as jest.Mock).mockReturnValue({ count });
    poRepository.findOne.mockResolvedValue(mockOrder);

    await expect(service.assertPermanentDeleteAllowed('po-1')).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the updated tests to confirm they fail (because implementation not changed yet)**

```bash
cd backend && npx jest src/modules/purchasing/services/purchase-order-lifecycle.service.spec.ts --no-coverage
```

Expected: The two new tests ("throws when paidAmount > 0" and "allows deletion when soft-deleted payments exist") should FAIL because the current implementation still blocks on vendor payment existence. The existing stock-movements test and the "resolves when neither" test may pass.

---

## Task 2: Fix `assertPermanentDeleteAllowed` implementation

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchase-order-lifecycle.service.ts`

- [ ] **Step 1: Replace the `assertPermanentDeleteAllowed` method body**

In `backend/src/modules/purchasing/services/purchase-order-lifecycle.service.ts`, replace the entire `assertPermanentDeleteAllowed` method (lines 152–174) with:

```typescript
async assertPermanentDeleteAllowed(purchaseOrderId: string): Promise<void> {
  const stockMovementRepository = this.purchaseOrderRepository.manager.getRepository(StockMovement);
  const stockMovementCount = await stockMovementRepository.count({
    where: { referenceType: 'purchase_order', referenceId: purchaseOrderId },
  });

  if (stockMovementCount > 0) {
    throw new BadRequestException(
      'Cannot permanently delete purchase order with existing stock movements.',
    );
  }

  const purchaseOrder = await this.purchaseOrderRepository.findOne({
    where: { id: purchaseOrderId },
    withDeleted: true,
  });

  if (Number(purchaseOrder?.paidAmount || 0) > 0) {
    throw new BadRequestException(
      'Cannot permanently delete purchase order that has payments recorded. Please unpay first.',
    );
  }
}
```

Note: The `vendorPaymentRepository` `find` call is removed entirely. The method now checks the PO's own `paidAmount` (the same pattern used in `softDelete` and `assertItemsNotLocked`), which is the authoritative signal that real payments were made.

- [ ] **Step 2: Run the tests again to confirm they pass**

```bash
cd backend && npx jest src/modules/purchasing/services/purchase-order-lifecycle.service.spec.ts --no-coverage
```

Expected: All tests in the file PASS.

- [ ] **Step 3: Commit**

```bash
cd backend && git add src/modules/purchasing/services/purchase-order-lifecycle.service.ts src/modules/purchasing/services/purchase-order-lifecycle.service.spec.ts
git commit -m "fix(purchasing): relax assertPermanentDeleteAllowed to only block on paidAmount or stock movements

Closes #478 (partial)"
```

---

## Task 3: Fix frontend error masking in `GenericDeletedDialog` — write failing tests first

**Files:**
- Modify: `frontend/src/components/common/GenericDeletedDialog.test.tsx`

First, read the existing test file to understand its structure:

- [ ] **Step 1: Read the existing test file**

Open `frontend/src/components/common/GenericDeletedDialog.test.tsx` to understand the test setup (mock mutations, how errors are thrown, etc.).

- [ ] **Step 2: Add error-message tests for all four handlers**

The `axiosBaseQuery` in `frontend/src/store/api/baseQuery.ts` shapes RTK Query errors as `{ status?: number; data: string }` — `error.data` is always a **string** (the message extracted from the backend response). The bug is that the current handlers access `error?.data?.message` (which is `undefined` on a string) instead of `error?.data`.

Add the following tests to the relevant describe blocks. If the test file doesn't have separate describe blocks per handler, add them at the bottom of the file:

```typescript
describe('error message display', () => {
  const rtkError = { data: 'Cannot permanently delete purchase order that has payments recorded. Please unpay first.' };

  it('shows backend error message from error.data string on permanent delete', async () => {
    const permanentDeleteMock = jest.fn().mockReturnValue({
      unwrap: () => Promise.reject(rtkError),
    });
    // render with usePermanentDeleteMutation returning permanentDeleteMock
    // trigger permanent delete on an item
    // assert showError was called with rtkError.data
    // (adapt to the existing render helper pattern in this test file)
  });

  it('shows backend error message from error.data string on restore', async () => {
    const restoreMock = jest.fn().mockReturnValue({
      unwrap: () => Promise.reject(rtkError),
    });
    // render with useRestoreMutation returning restoreMock
    // trigger restore on an item
    // assert showError was called with rtkError.data
  });

  it('shows backend error message from error.data string on bulk restore', async () => {
    const bulkRestoreMock = jest.fn().mockReturnValue({
      unwrap: () => Promise.reject(rtkError),
    });
    // render with useBulkRestoreMutation returning bulkRestoreMock
    // select items, trigger bulk restore
    // assert showError was called with rtkError.data
  });

  it('shows backend error message from error.data string on bulk permanent delete', async () => {
    const bulkPermanentDeleteMock = jest.fn().mockReturnValue({
      unwrap: () => Promise.reject(rtkError),
    });
    // render with useBulkPermanentDeleteMutation returning bulkPermanentDeleteMock
    // select items, trigger bulk delete
    // assert showError was called with rtkError.data
  });
});
```

> **Important:** After reading the existing test file in Step 1, replace the placeholder comments with real render calls and assertions that match the existing test patterns. The key assertion in each test is that `showError` (or the notification mock) is called with the string `'Cannot permanently delete purchase order that has payments recorded. Please unpay first.'` — not the generic fallback.

- [ ] **Step 3: Run the new tests to confirm they fail**

```bash
cd frontend && npx vitest run src/components/common/GenericDeletedDialog.test.tsx
```

Expected: The four new error-message tests FAIL (because the implementation currently uses `error?.data?.message` which is `undefined`).

---

## Task 4: Fix the four catch blocks in `GenericDeletedDialog`

**Files:**
- Modify: `frontend/src/components/common/GenericDeletedDialog.tsx`

- [ ] **Step 1: Fix `handleRestore` catch (line 185)**

Replace:
```typescript
showError(error?.data?.message || error?.message || `Failed to restore ${entityLabel}`)
```
With:
```typescript
showError(error?.data || error?.message || `Failed to restore ${entityLabel}`)
```

- [ ] **Step 2: Fix `handlePermanentDelete` catch (line 202)**

Replace:
```typescript
showError(error?.data?.message || error?.message || `Failed to permanently delete ${entityLabel}`)
```
With:
```typescript
showError(error?.data || error?.message || `Failed to permanently delete ${entityLabel}`)
```

- [ ] **Step 3: Fix `handleBulkRestore` catch (line 231)**

Replace:
```typescript
showError(error?.data?.message || error?.message || `Failed to bulk restore ${entityLabelPlural}`)
```
With:
```typescript
showError(error?.data || error?.message || `Failed to bulk restore ${entityLabelPlural}`)
```

- [ ] **Step 4: Fix `handleBulkPermanentDelete` catch (line 260)**

Replace:
```typescript
showError(error?.data?.message || error?.message || `Failed to bulk delete ${entityLabelPlural}`)
```
With:
```typescript
showError(error?.data || error?.message || `Failed to bulk delete ${entityLabelPlural}`)
```

- [ ] **Step 5: Run the tests to confirm all pass**

```bash
cd frontend && npx vitest run src/components/common/GenericDeletedDialog.test.tsx
```

Expected: All tests PASS, including the four new error-message tests.

- [ ] **Step 6: TypeScript check**

```bash
cd frontend && npm run type-check
```

Expected: No new errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/common/GenericDeletedDialog.tsx frontend/src/components/common/GenericDeletedDialog.test.tsx
git commit -m "fix(ui): show backend error message string from error.data in GenericDeletedDialog

Closes #478"
```

---

## Self-Review Notes

- **Spec coverage:** Both root causes from issue #478 are addressed — backend deadlock (Tasks 1–2) and frontend error masking (Tasks 3–4). Verification plan (unit tests + error message fix) is covered.
- **No placeholders:** Task 3 Step 2 contains placeholder comments that must be filled in after reading the existing test file. This is intentional — the exact render pattern depends on the existing test scaffolding. The instruction to fill them in is explicit.
- **Type consistency:** `assertPermanentDeleteAllowed` signature is unchanged. `mockOrder.paidAmount` is `0` in the existing spec fixture, which is correct for the "allows deletion" test case.
- **`vendorPaymentRepository` injection:** After the fix, `vendorPaymentRepository` is no longer used in `assertPermanentDeleteAllowed`. It is still used in `softDelete`, so the injection stays. No change needed to the module wiring.
