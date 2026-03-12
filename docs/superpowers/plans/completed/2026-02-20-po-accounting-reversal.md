# PO Accounting Reversal & Vendor Payment Soft-Delete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix purchase order `returnGoods()` and `markAsUnpaid()` to reverse journal entries and soft-delete vendor payments, and make `recordOrderPayments()` restore the previous vendor payment record when re-paying.

**Architecture:** Three surgical changes to two backend service files. No frontend changes needed. Follows the same pattern as sales orders: non-fatal try/catch around accounting calls, soft-delete instead of hard-delete, restore before create on re-pay.

**Tech Stack:** NestJS, TypeORM, Jest (backend unit tests only — run with `cd backend && npm test -- --testPathPattern="purchase-order.service|vendor-payment.service" --no-coverage`)

---

## Context: How the codebase works

- **`reverseSourceEntries(sourceType, sourceId, userId)`** — in `AccountingService`. Finds all POSTED journal entries with that `sourceType`/`sourceId`, reverses them in the current fiscal period. Safe to call if no entries exist (returns silently).
- **`softDelete(id)`** — TypeORM built-in. Sets `deletedAt` timestamp. After this, normal `find()` queries skip the record automatically (TypeORM respects `@DeleteDateColumn`).
- **`restore(id)`** — TypeORM built-in. Clears `deletedAt`. Normal queries see the record again.
- **`findOne({ withDeleted: true })`** — finds including soft-deleted records.
- **`isActive`** — a redundant flag on `BaseEntity` used alongside `deletedAt`. Must be kept in sync manually.
- **GRN journal entry source:** `sourceType = 'goods_received_note'`, `sourceId = grn.id`
- **Vendor payment journal entry source:** `sourceType = 'vendor_payment'`, `sourceId = vendorPayment.id`

---

## Task 1: Add `softDeleteForUnpay()` to VendorPaymentService

**Files:**
- Modify: `backend/src/modules/purchasing/services/vendor-payment.service.ts` (after line ~423)
- Test: `backend/src/modules/purchasing/services/vendor-payment.service.spec.ts`

### Step 1: Write the failing test

In `vendor-payment.service.spec.ts`, find the existing test structure and add a new `describe` block. Look for the last `describe` block and add after it:

```typescript
describe('softDeleteForUnpay', () => {
  it('sets isActive=false and soft-deletes the vendor payment', async () => {
    const mockPayment = {
      id: 'vp-1',
      paymentNumber: 'VP-000001',
      isActive: true,
    } as VendorPayment;

    vendorPaymentRepository.findOne.mockResolvedValue(mockPayment);
    vendorPaymentRepository.save.mockResolvedValue({ ...mockPayment, isActive: false } as any);
    vendorPaymentRepository.softDelete.mockResolvedValue({} as any);

    await service.softDeleteForUnpay('vp-1');

    expect(vendorPaymentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ isActive: false }),
    );
    expect(vendorPaymentRepository.softDelete).toHaveBeenCalledWith('vp-1');
  });
});
```

### Step 2: Run test to verify it fails

```bash
cd /home/blur/erp2/backend && npm test -- --testPathPattern="vendor-payment.service.spec" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `service.softDeleteForUnpay is not a function`

### Step 3: Implement `softDeleteForUnpay()`

In `vendor-payment.service.ts`, find the `remove()` method (around line 394). Add the new method **directly after** the closing `}` of `remove()` (around line 423):

```typescript
  /**
   * Soft delete a vendor payment during unpay (no audit log needed — markAsUnpaid logs the parent operation)
   */
  async softDeleteForUnpay(id: string): Promise<void> {
    const payment = await this.vendorPaymentRepository.findOne({ where: { id } });
    if (!payment) return;
    payment.isActive = false;
    await this.vendorPaymentRepository.save(payment);
    await this.vendorPaymentRepository.softDelete(id);
  }
```

Also add `softDelete` to the repository mock in the test's `beforeEach` if it isn't already there. Look for `getRepositoryToken(VendorPayment)` in `vendor-payment.service.spec.ts` and ensure its `useValue` includes `softDelete: jest.fn()`.

### Step 4: Run test to verify it passes

```bash
cd /home/blur/erp2/backend && npm test -- --testPathPattern="vendor-payment.service.spec" --no-coverage 2>&1 | tail -20
```

Expected: PASS

### Step 5: Commit

```bash
cd /home/blur/erp2 && git add backend/src/modules/purchasing/services/vendor-payment.service.ts backend/src/modules/purchasing/services/vendor-payment.service.spec.ts && git commit -m "feat(purchasing): add softDeleteForUnpay to VendorPaymentService"
```

---

## Task 2: Fix `markAsUnpaid()` — reverse JE + soft-delete

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.ts` (lines ~1516–1554)
- Test: `backend/src/modules/purchasing/services/purchase-order.service.spec.ts`

### Step 1: Write the failing tests

In `purchase-order.service.spec.ts`, first update the `beforeEach` so the mocked services/repos have the needed methods. Find the `AccountingService` provider mock (around line 169) and update it:

```typescript
{
  provide: AccountingService,
  useValue: {
    postGoodsReceivedEntry: jest.fn(),
    reverseSourceEntries: jest.fn(),  // ADD THIS
  },
},
```

Find the `VendorPaymentService` provider mock (around line 145) and update it:

```typescript
{
  provide: VendorPaymentService,
  useValue: {
    findAllByPurchaseOrder: jest.fn(),  // ADD THIS
    softDeleteForUnpay: jest.fn(),      // ADD THIS
  },
},
```

Also add these variables at the top of the describe block (after `let stockMovementService`):

```typescript
let vendorPaymentService: jest.Mocked<VendorPaymentService>;
```

And in `beforeEach`, after `stockMovementService = module.get(StockMovementService);`, add:

```typescript
vendorPaymentService = module.get(VendorPaymentService);
```

Now add the new `describe` block for `markAsUnpaid`:

```typescript
describe('markAsUnpaid', () => {
  const mockPayment = {
    id: 'vp-1',
    paymentNumber: 'VP-000001',
    amount: 200,
  } as VendorPayment;

  const mockPaidOrder = {
    ...mockPurchaseOrder,
    paidAmount: 200,
  } as unknown as PurchaseOrder;

  beforeEach(() => {
    purchaseOrderRepository.findOne.mockResolvedValue(mockPaidOrder);
    // No GRN = no "must return goods first" guard
    grnRepository.findOne.mockResolvedValue(null);
    vendorPaymentService.findAllByPurchaseOrder.mockResolvedValue([mockPayment]);
    vendorPaymentService.softDeleteForUnpay.mockResolvedValue(undefined);
    accountingService.reverseSourceEntries.mockResolvedValue(undefined);
    // purchaseOrderRepository.save must exist in the mock
    (purchaseOrderRepository as any).save = jest.fn().mockResolvedValue(mockPaidOrder);
  });

  it('reverses accounting entries for each vendor payment', async () => {
    await service.markAsUnpaid('po-1');
    expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
      'vendor_payment', 'vp-1', 'system',
    );
  });

  it('soft-deletes vendor payments instead of hard-deleting', async () => {
    await service.markAsUnpaid('po-1');
    expect(vendorPaymentService.softDeleteForUnpay).toHaveBeenCalledWith('vp-1');
  });

  it('resets paidAmount to 0', async () => {
    await service.markAsUnpaid('po-1');
    expect((purchaseOrderRepository as any).save).toHaveBeenCalledWith(
      expect.objectContaining({ paidAmount: 0 }),
    );
  });
});
```

### Step 2: Run tests to verify they fail

```bash
cd /home/blur/erp2/backend && npm test -- --testPathPattern="purchase-order.service.spec" --no-coverage 2>&1 | tail -30
```

Expected: 3 failures in `markAsUnpaid` — methods not found / `permanentDelete` called instead.

### Step 3: Implement the fix in `markAsUnpaid()`

In `purchase-order.service.ts`, find the `markAsUnpaid()` method (around line 1516). Replace the hard-delete loop:

**Find this block** (lines ~1544–1547):
```typescript
    // Hard delete all vendor payments
    for (const payment of existingPayments) {
      await this.vendorPaymentService.permanentDelete(payment.id);
    }
```

**Replace with:**
```typescript
    // Reverse accounting entries and soft-delete each vendor payment
    for (const payment of existingPayments) {
      try {
        await this.accountingService.reverseSourceEntries('vendor_payment', payment.id, 'system');
      } catch (error) {
        this.logger.error(`Failed to reverse accounting for vendor payment ${payment.id}: ${error.message}`);
      }
      await this.vendorPaymentService.softDeleteForUnpay(payment.id);
    }
```

### Step 4: Run tests to verify they pass

```bash
cd /home/blur/erp2/backend && npm test -- --testPathPattern="purchase-order.service.spec" --no-coverage 2>&1 | tail -30
```

Expected: All `markAsUnpaid` tests PASS. `receiveGoods` tests still PASS.

### Step 5: Commit

```bash
cd /home/blur/erp2 && git add backend/src/modules/purchasing/services/purchase-order.service.ts backend/src/modules/purchasing/services/purchase-order.service.spec.ts && git commit -m "fix(purchasing): soft-delete vendor payments and reverse JE on markAsUnpaid"
```

---

## Task 3: Fix `returnGoods()` — reverse GRN journal entry

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.ts` (lines ~1340–1360)
- Test: `backend/src/modules/purchasing/services/purchase-order.service.spec.ts`

### Step 1: Write the failing test

In `purchase-order.service.spec.ts`, add a new `describe` block for `returnGoods`. Note: `reverseSourceEntries` is already in the mock from Task 2.

Also update the `StockMovementService` mock in `beforeEach` (find it around line 153) to add `deleteByReference`:

```typescript
{
  provide: StockMovementService,
  useValue: {
    create: jest.fn(),
    deleteByReference: jest.fn(),  // ADD THIS
  },
},
```

And update the variable assignment in `beforeEach`:
```typescript
stockMovementService = module.get(StockMovementService);
// Add this if not already present:
(stockMovementService as any).deleteByReference = jest.fn().mockResolvedValue({ deletedCount: 1 });
```

Now add the test:

```typescript
describe('returnGoods', () => {
  beforeEach(() => {
    purchaseOrderRepository.findOne.mockResolvedValue({
      ...mockPurchaseOrder,
      supplierId: 'supplier-1',
    } as any);
    grnRepository.findOne.mockResolvedValue(mockReceivedGrn);
    grnRepository.save.mockResolvedValue({ ...mockReceivedGrn, status: GrnStatus.DRAFT });
    jest.spyOn(service as any, 'reverseBaseCostsForGrn').mockResolvedValue(undefined);
    (module.get(GoodsReceivedNoteService) as any).updateGrnItems = jest.fn().mockResolvedValue(undefined);
    (stockMovementService as any).deleteByReference = jest.fn().mockResolvedValue({ deletedCount: 1 });
    accountingService.reverseSourceEntries.mockResolvedValue(undefined);
    purchaseOrderItemRepository.save.mockResolvedValue({} as any);
    purchaseOrderRepository.update.mockResolvedValue({} as any);
  });

  it('reverses the GRN accounting entry after returning goods', async () => {
    await service.returnGoods('po-1');
    expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
      'goods_received_note', 'grn-1', 'system',
    );
  });

  it('still succeeds even if accounting reversal fails', async () => {
    accountingService.reverseSourceEntries.mockRejectedValue(new Error('No fiscal period'));
    await expect(service.returnGoods('po-1')).resolves.not.toThrow();
  });
});
```

**Note on `module` reference:** The test uses `module.get(GoodsReceivedNoteService)` — `module` is declared in `beforeEach` scope in the spec file. Check if it is accessible. If `module` is not in scope, capture it: change the `beforeEach` to assign to an outer `let module: TestingModule;` variable.

Check the spec file's `beforeEach` (around line 96):
```typescript
// If it looks like:
beforeEach(async () => {
  const module: TestingModule = ...

// Change to:
let module: TestingModule;
beforeEach(async () => {
  module = await Test.createTestingModule(...
```

### Step 2: Run test to verify it fails

```bash
cd /home/blur/erp2/backend && npm test -- --testPathPattern="purchase-order.service.spec" --no-coverage 2>&1 | tail -30
```

Expected: FAIL — `reverseSourceEntries` not called in `returnGoods`.

### Step 3: Add the GRN accounting reversal in `returnGoods()`

In `purchase-order.service.ts`, find the `returnGoods()` method. Locate the block that deletes stock movements (around line 1341–1352):

```typescript
      // Delete stock movement records created during goods receipt
      try {
        const stockMovementResult = await this.stockMovementService.deleteByReference(
          'purchase_order',
          purchaseOrder.id
        );
        this.logger.log(
          `Deleted ${stockMovementResult.deletedCount} stock movements for purchase order ${purchaseOrder.orderNumber} return`
        );
      } catch (error) {
        this.logger.error(`Failed to delete stock movements for purchase order ${purchaseOrder.orderNumber}: ${error.message}`);
        // Don't throw error - return should still succeed
      }
```

**Add this block immediately after** (before "Reset PO item received quantities"):

```typescript
      // Reverse GRN journal entry (DR Inventory Asset / CR Accounts Payable)
      try {
        await this.accountingService.reverseSourceEntries('goods_received_note', grn.id, 'system');
        this.logger.log(`Reversed GRN accounting entry for PO ${purchaseOrder.orderNumber}`);
      } catch (error) {
        this.logger.error(`Failed to reverse GRN accounting entry for PO ${purchaseOrder.orderNumber}: ${error.message}`);
        // Non-fatal - return still succeeds
      }
```

### Step 4: Run tests to verify they pass

```bash
cd /home/blur/erp2/backend && npm test -- --testPathPattern="purchase-order.service.spec" --no-coverage 2>&1 | tail -30
```

Expected: All tests PASS including `returnGoods`.

### Step 5: Commit

```bash
cd /home/blur/erp2 && git add backend/src/modules/purchasing/services/purchase-order.service.ts backend/src/modules/purchasing/services/purchase-order.service.spec.ts && git commit -m "fix(purchasing): reverse GRN journal entry on returnGoods"
```

---

## Task 4: Fix `recordOrderPayments()` — restore previous VP on re-pay

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.ts` (lines ~1438–1480)
- Test: `backend/src/modules/purchasing/services/purchase-order.service.spec.ts`

### Step 1: Verify the `vendorPaymentRepository` mock has required methods

In `purchase-order.service.spec.ts`, find the `VendorPayment` repository mock (around line 131):

```typescript
{
  provide: getRepositoryToken(VendorPayment),
  useValue: {},
},
```

Update it to:

```typescript
{
  provide: getRepositoryToken(VendorPayment),
  useValue: {
    findOne: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
  },
},
```

And add the variable declaration at the top of the describe block:

```typescript
let vendorPaymentRepository: jest.Mocked<Repository<VendorPayment>>;
```

In `beforeEach`, after the existing `module.get(...)` calls, add:

```typescript
vendorPaymentRepository = module.get(getRepositoryToken(VendorPayment));
```

Also update the `VendorPaymentService` mock to add `create` and `findOne`:

```typescript
{
  provide: VendorPaymentService,
  useValue: {
    findAllByPurchaseOrder: jest.fn(),
    softDeleteForUnpay: jest.fn(),
    create: jest.fn(),      // ADD
    findOne: jest.fn(),     // ADD
  },
},
```

### Step 2: Write the failing tests

Add a new `describe` block for `recordOrderPayments`:

```typescript
describe('recordOrderPayments', () => {
  const mockDeletedPayment = {
    id: 'vp-old-1',
    paymentNumber: 'VP-000001',
    purchaseOrderId: 'po-1',
    deletedAt: new Date('2026-02-19'),
    isActive: false,
    paymentMethodId: 'pm-bank',
    amount: 100,
  } as unknown as VendorPayment;

  const mockRestoredPayment = {
    ...mockDeletedPayment,
    deletedAt: null,
    isActive: true,
  } as unknown as VendorPayment;

  const mockPurchaseOrderForPayment = {
    ...mockPurchaseOrder,
    supplierId: 'supplier-1',
    paidAmount: 0,
  } as unknown as PurchaseOrder;

  beforeEach(() => {
    purchaseOrderRepository.findOne.mockResolvedValue(mockPurchaseOrderForPayment);
    (purchaseOrderRepository as any).save = jest.fn().mockResolvedValue(mockPurchaseOrderForPayment);
    (vendorPaymentService as any).findOne = jest.fn().mockResolvedValue(mockRestoredPayment);
    accountingService.postVendorPaymentEntry = jest.fn().mockResolvedValue(undefined);
  });

  it('creates a new vendor payment when no previous soft-deleted payment exists', async () => {
    vendorPaymentRepository.findOne.mockResolvedValue(null);
    (vendorPaymentService as any).create = jest.fn().mockResolvedValue({ id: 'vp-new' });

    await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 200 }]);

    expect((vendorPaymentService as any).create).toHaveBeenCalled();
    expect(vendorPaymentRepository.restore).not.toHaveBeenCalled();
  });

  it('restores the previous soft-deleted payment on re-pay', async () => {
    vendorPaymentRepository.findOne.mockResolvedValue(mockDeletedPayment);
    vendorPaymentRepository.restore.mockResolvedValue({} as any);
    vendorPaymentRepository.save.mockResolvedValue(mockRestoredPayment);

    await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 200 }]);

    expect(vendorPaymentRepository.restore).toHaveBeenCalledWith('vp-old-1');
  });

  it('updates payment method and amount when restoring', async () => {
    vendorPaymentRepository.findOne.mockResolvedValue(mockDeletedPayment);
    vendorPaymentRepository.restore.mockResolvedValue({} as any);
    vendorPaymentRepository.save.mockResolvedValue(mockRestoredPayment);

    await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 300 }]);

    expect(vendorPaymentRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethodId: 'pm-cash', amount: 300, isActive: true }),
    );
  });

  it('re-posts accounting entry after restoring', async () => {
    vendorPaymentRepository.findOne.mockResolvedValue(mockDeletedPayment);
    vendorPaymentRepository.restore.mockResolvedValue({} as any);
    vendorPaymentRepository.save.mockResolvedValue(mockRestoredPayment);

    await service.recordOrderPayments('po-1', [{ paymentMethodId: 'pm-cash', amount: 200 }]);

    expect(accountingService.postVendorPaymentEntry).toHaveBeenCalledWith(
      mockRestoredPayment, 'system',
    );
  });
});
```

### Step 3: Run tests to verify they fail

```bash
cd /home/blur/erp2/backend && npm test -- --testPathPattern="purchase-order.service.spec" --no-coverage 2>&1 | tail -30
```

Expected: FAIL — restore logic not yet implemented.

### Step 4: Implement the restore logic in `recordOrderPayments()`

In `purchase-order.service.ts`, find `recordOrderPayments()` (around line 1438). The method starts with a `findOne` for the purchase order. Add the restore check **after** the `payments.length === 0` guard and `totalNewPayment` calculation:

**Find this block** (around line 1457–1470):
```typescript
    const totalNewPayment = payments.reduce((sum, p) => sum + p.amount, 0);

    // Create a vendor payment for each line
    for (const line of payments) {
      await this.vendorPaymentService.create({
```

**Replace with:**
```typescript
    const totalNewPayment = payments.reduce((sum, p) => sum + p.amount, 0);

    // Check for a previously soft-deleted payment for this PO (from a prior unpay)
    const previousPayment = await this.vendorPaymentRepository.findOne({
      where: { purchaseOrderId: id },
      withDeleted: true,
      order: { deletedAt: 'DESC' } as any,
    });

    if (previousPayment?.deletedAt) {
      // Restore the previous vendor payment and update it with the new payment details
      const firstLine = payments[0];
      await this.vendorPaymentRepository.restore(previousPayment.id);
      previousPayment.isActive = true;
      previousPayment.paymentMethodId = firstLine.paymentMethodId;
      previousPayment.amount = firstLine.amount;
      previousPayment.notes = firstLine.reference || previousPayment.notes;
      previousPayment.paymentDate = new Date() as any;
      await this.vendorPaymentRepository.save(previousPayment);

      // Re-post the accounting entry for the restored payment
      const fullPayment = await this.vendorPaymentService.findOne(previousPayment.id);
      await this.accountingService.postVendorPaymentEntry(fullPayment, 'system');

      // Create new vendor payments for any additional lines beyond the first
      for (const line of payments.slice(1)) {
        await this.vendorPaymentService.create({
          supplierId: purchaseOrder.supplierId,
          purchaseOrderId: id,
          amount: line.amount,
          paymentDate: new Date().toISOString().split('T')[0],
          paymentMethodId: line.paymentMethodId,
          status: 'completed',
          notes: line.reference || undefined,
        });
      }

      // Update paidAmount on the order
      purchaseOrder.paidAmount = totalNewPayment;
      await this.purchaseOrderRepository.save(purchaseOrder);
      this.logger.log(`Restored vendor payment ${previousPayment.paymentNumber} for PO ${purchaseOrder.orderNumber}`);
      return this.findOne(id);
    }

    // No previous payment — create a vendor payment for each line (original flow)
    for (const line of payments) {
      await this.vendorPaymentService.create({
```

Make sure `postVendorPaymentEntry` is available on `accountingService`. Check at the top of the service file for its injection, and add it to the mock if missing. Also add `findOne` to the `VendorPaymentService` mock if you haven't already.

### Step 5: Run tests to verify they pass

```bash
cd /home/blur/erp2/backend && npm test -- --testPathPattern="purchase-order.service.spec" --no-coverage 2>&1 | tail -30
```

Expected: All tests PASS.

### Step 6: Run the full purchasing test suite

```bash
cd /home/blur/erp2/backend && npm test -- --testPathPattern="purchasing" --no-coverage 2>&1 | tail -20
```

Expected: All purchasing tests PASS.

### Step 7: Commit

```bash
cd /home/blur/erp2 && git add backend/src/modules/purchasing/services/purchase-order.service.ts backend/src/modules/purchasing/services/purchase-order.service.spec.ts && git commit -m "feat(purchasing): restore previous vendor payment on re-pay after unpay"
```

---

## Task 5: Run full backend test suite

### Step 1: Run all backend tests

```bash
cd /home/blur/erp2/backend && npm test -- --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS. No regressions.

### Step 2: If any test fails

Check the error. Common issues:
- `accountingService.postVendorPaymentEntry` not in mock → add `postVendorPaymentEntry: jest.fn()` to AccountingService mock in the spec file
- `vendorPaymentRepository.restore` not in mock → add `restore: jest.fn()` to VendorPayment repository mock
- TypeScript error on `order: { deletedAt: 'DESC' }` → cast as `order: { deletedAt: 'DESC' } as any`

### Step 3: Commit if any test fixes were needed

```bash
cd /home/blur/erp2 && git add -A && git commit -m "fix(purchasing): fix test mocks for accounting reversal changes"
```

---

## Verification Checklist

After all tasks complete, verify end-to-end behaviour manually if Docker is running:

1. **Return goods test:**
   - Receive goods on a PO (creates GRN + journal entry with `sourceType=goods_received_note`)
   - Click "Return Goods"
   - Check journal entries: the original entry should have `status=REVERSED`, and a reversal entry should exist

2. **Unpay test:**
   - Pay a PO via the payment dialog
   - Check journal entries: `vendor_payment` entry exists with `status=POSTED`
   - Check vendor payments: record exists in DB
   - Click "Mark as Unpaid"
   - Check journal entries: original entry now `status=REVERSED`
   - Check vendor payments: record now has `deletedAt` set (soft-deleted, not gone)

3. **Re-pay test:**
   - After step 2, pay the PO again (different payment method)
   - Check vendor payments: same `paymentNumber` as before, `deletedAt=null`, new `paymentMethodId`
   - Check journal entries: new `vendor_payment` entry with `status=POSTED`
