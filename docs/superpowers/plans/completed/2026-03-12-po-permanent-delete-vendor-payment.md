# PO Permanent Delete — VendorPayment FK Fix Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix permanent deletion of a PurchaseOrder failing with a FK constraint error when soft-deleted VendorPayment records still reference it.

**Architecture:** Add VendorPayment cascade deletion inside `PurchaseOrderService.permanentDelete`, mirroring the existing GRN cascade. No entity or migration changes required.

**Tech Stack:** NestJS 11, TypeORM, Jest

---

## Chunk 1: Service fix + JSDoc

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.ts`

---

### Task 1: Add VendorPayment cascade to `permanentDelete` and fix JSDoc

- [ ] **Step 1: Insert VendorPayment cascade block**

In `purchase-order.service.ts`, find the closing `}` of the `if (grn)` block (line 804) and the `// Log audit trail for PO permanent delete` comment that immediately follows it (line 806).

Insert the following block **between** those two lines (after line 804's closing brace, before line 806's comment):

```typescript
    // Find and permanently delete all associated VendorPayments (including soft-deleted)
    const vendorPayments = await this.vendorPaymentRepository.find({
      where: { purchaseOrderId: id },
      withDeleted: true,
    });

    for (const payment of vendorPayments) {
      await this.auditLogService.log(
        'PERMANENT_DELETE',
        'VendorPayment',
        `Permanently deleted vendor payment: ${payment.paymentNumber} (auto-deleted with PO)`,
        {
          entityId: payment.id,
          userId: userId || 'system',
          username,
          oldValues: {
            paymentNumber: payment.paymentNumber,
            amount: payment.amount,
            status: payment.status,
          },
        }
      );
    }

    if (vendorPayments.length > 0) {
      await this.vendorPaymentRepository.remove(vendorPayments);
      this.logger.log(`Deleted ${vendorPayments.length} vendor payment(s) for purchase order ${purchaseOrder.orderNumber}`);
    }

```

The cascade order after this fix:
1. Stock movements (existing, non-blocking)
2. GRN (existing)
3. VendorPayments **(new)**
4. PO audit log + `purchaseOrderRepository.remove(purchaseOrder)` (existing)

- [ ] **Step 2: Fix JSDoc in `markAsUnpaid`**

At line 1598, change:
```typescript
   * Mark purchase order as unpaid by hard deleting the vendor payment
```
to:
```typescript
   * Mark purchase order as unpaid by soft-deleting the vendor payment
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```
Expected: no output (no errors)

---

## Chunk 2: Tests

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.spec.ts`

---

### Task 2: Extend repository mocks and outer scope setup

The spec file's outer `beforeEach` creates `module` as a `const` local variable — it is not accessible inside nested `describe` blocks. The `PurchaseOrder` and `GoodsReceivedNote` repository mocks are also missing `remove`. Fix all of this before writing tests.

- [ ] **Step 1: Elevate `module` to outer `describe` scope**

At the top of the outer `describe('PurchaseOrderService', ...)` block, alongside the existing `let service`, `let purchaseOrderRepository`, etc. declarations (around line 25-34), add:

```typescript
  let module: TestingModule;
  let auditLogService: jest.Mocked<AuditLogService>;
```

Then in the outer `beforeEach` (line 99), change:
```typescript
    const module: TestingModule = await Test.createTestingModule({
```
to:
```typescript
    module = await Test.createTestingModule({
```

Then after the existing repository assignments at the bottom of the outer `beforeEach` (around line 205), add:
```typescript
    auditLogService = module.get(AuditLogService);
```

- [ ] **Step 2: Add `remove` to the `PurchaseOrder` repository mock**

Locate the `getRepositoryToken(PurchaseOrder)` provider (around line 104). Change:

```typescript
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            save: jest.fn(),
          },
        },
```
to:
```typescript
        {
          provide: getRepositoryToken(PurchaseOrder),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
          },
        },
```

- [ ] **Step 3: Add `remove` to the `GoodsReceivedNote` repository mock**

Locate the `getRepositoryToken(GoodsReceivedNote)` provider (around line 128). Change:

```typescript
        {
          provide: getRepositoryToken(GoodsReceivedNote),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
```
to:
```typescript
        {
          provide: getRepositoryToken(GoodsReceivedNote),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
          },
        },
```

- [ ] **Step 4: Add `find` and `remove` to the `VendorPayment` repository mock**

Locate the `getRepositoryToken(VendorPayment)` provider (around line 135). Change:

```typescript
        {
          provide: getRepositoryToken(VendorPayment),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            restore: jest.fn(),
          },
        },
```
to:
```typescript
        {
          provide: getRepositoryToken(VendorPayment),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
            restore: jest.fn(),
            remove: jest.fn(),
          },
        },
```

---

### Task 3: Write and verify tests for `permanentDelete`

- [ ] **Step 1: Write the failing tests**

Add the following `describe` block after the existing `describe('markAsUnpaid')` block:

```typescript
  describe('permanentDelete', () => {
    const mockPO = {
      id: 'po-1',
      orderNumber: 'PO-000001',
      supplierId: 'supplier-1',
      totalAmount: 500,
      isFullyReceived: false,
    } as unknown as PurchaseOrder;

    const mockVP1 = {
      id: 'vp-1',
      paymentNumber: 'VP-000001',
      amount: 250,
      status: 'completed',
    } as unknown as VendorPayment;

    const mockVP2 = {
      id: 'vp-2',
      paymentNumber: 'VP-000002',
      amount: 250,
      status: 'completed',
    } as unknown as VendorPayment;

    beforeEach(() => {
      purchaseOrderRepository.findOne.mockResolvedValue(mockPO);
      grnRepository.findOne.mockResolvedValue(null);
      stockMovementService.deleteByReference.mockResolvedValue({ deletedCount: 0 } as any);
      vendorPaymentRepository.find.mockResolvedValue([]);
      vendorPaymentRepository.remove.mockResolvedValue(undefined as any);
      purchaseOrderRepository.remove.mockResolvedValue(undefined as any);
      auditLogService.log.mockResolvedValue(undefined as any);
    });

    it('queries vendor payments with withDeleted: true', async () => {
      await service.permanentDelete('po-1', 'user-1', 'admin');
      expect(vendorPaymentRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { purchaseOrderId: 'po-1' },
          withDeleted: true,
        }),
      );
    });

    it('logs PERMANENT_DELETE audit entry for each vendor payment', async () => {
      vendorPaymentRepository.find.mockResolvedValue([mockVP1, mockVP2]);

      await service.permanentDelete('po-1', 'user-1', 'admin');

      expect(auditLogService.log).toHaveBeenCalledWith(
        'PERMANENT_DELETE',
        'VendorPayment',
        expect.stringContaining('VP-000001'),
        expect.objectContaining({ entityId: 'vp-1' }),
      );
      expect(auditLogService.log).toHaveBeenCalledWith(
        'PERMANENT_DELETE',
        'VendorPayment',
        expect.stringContaining('VP-000002'),
        expect.objectContaining({ entityId: 'vp-2' }),
      );
    });

    it('calls vendorPaymentRepository.remove with all payments', async () => {
      vendorPaymentRepository.find.mockResolvedValue([mockVP1, mockVP2]);

      await service.permanentDelete('po-1', 'user-1', 'admin');

      expect(vendorPaymentRepository.remove).toHaveBeenCalledWith([mockVP1, mockVP2]);
    });

    it('does not call remove when there are no vendor payments', async () => {
      vendorPaymentRepository.find.mockResolvedValue([]);

      await service.permanentDelete('po-1', 'user-1', 'admin');

      expect(vendorPaymentRepository.remove).not.toHaveBeenCalled();
    });

    it('still hard-deletes the PO after removing vendor payments', async () => {
      vendorPaymentRepository.find.mockResolvedValue([mockVP1]);

      await service.permanentDelete('po-1', 'user-1', 'admin');

      expect(purchaseOrderRepository.remove).toHaveBeenCalledWith(mockPO);
    });
  });
```

- [ ] **Step 2: Run the new tests to verify they fail before the service fix**

```bash
cd backend && npx jest src/modules/purchasing/services/purchase-order.service.spec.ts --no-coverage --testNamePattern="permanentDelete" 2>&1 | tail -20
```
Expected: tests fail (the service code doesn't have the cascade yet)

- [ ] **Step 3: Verify the full spec file still compiles (no import errors from the scope changes)**

```bash
cd backend && npx tsc --noEmit 2>&1 | head -20
```
Expected: no errors

- [ ] **Step 4: Run all tests after both Task 1 and Task 2 are complete**

```bash
cd backend && npx jest src/modules/purchasing/services/purchase-order.service.spec.ts --no-coverage 2>&1 | tail -30
```
Expected: all tests PASS, including the 5 new `permanentDelete` tests

- [ ] **Step 5: Run full purchasing module tests for regressions**

```bash
cd backend && npx jest src/modules/purchasing --no-coverage 2>&1 | tail -30
```
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/purchasing/services/purchase-order.service.ts \
        backend/src/modules/purchasing/services/purchase-order.service.spec.ts
git commit -m "fix(purchasing): cascade vendor payment deletion on PO permanent delete (issue #78)

- permanentDelete now finds all VendorPayments (incl. soft-deleted) and
  hard-deletes them before removing the PO, preventing FK constraint errors
- Each deleted payment gets a PERMANENT_DELETE audit log entry
- Fix markAsUnpaid JSDoc: soft-delete not hard-delete"
```
