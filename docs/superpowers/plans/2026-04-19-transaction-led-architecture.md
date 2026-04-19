# Transaction-Led, Admin-Overridable Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Standardize access control, edit locking, child sync, and cascade deletion for GRN, VP, Invoices, and Customer Payments across both purchasing and sales domains.

**Architecture:** Add `@Auth(UserRole.ADMIN)` to manual create/delete endpoints on four child controllers. Move PO soft-delete, permanent-delete, and vendor-payment cascade logic into a new `PurchaseOrderLifecycleService` (mirroring the existing `SalesOrderLifecycleService`). Extend `SalesOrderLifecycleService` with item-lock checks and header sync. Add a lock banner to PO/SO item tables; no new frontend pages or dialogs needed.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, React 19, MUI v7, Jest (backend), Vitest (frontend)

---

## File Map

**Create:**
- `backend/src/modules/purchasing/services/purchase-order-lifecycle.service.ts` — soft-delete guard, permanent-delete guard, VP cascade cascade
- `backend/src/modules/purchasing/services/purchase-order-lifecycle.service.spec.ts` — unit tests

**Modify:**
- `backend/src/modules/purchasing/controllers/goods-received-note.controller.ts` — add `@Auth(UserRole.ADMIN)` to POST, DELETE /:id, DELETE /:id/permanent
- `backend/src/modules/purchasing/controllers/vendor-payment.controller.ts` — add `@Auth(UserRole.ADMIN)` to POST, DELETE /:id, DELETE /:id/permanent
- `backend/src/modules/sales/controllers/invoice.controller.ts` — add `@Auth(UserRole.ADMIN)` to DELETE /:id, DELETE /:id/permanent
- `backend/src/modules/sales/controllers/payment.controller.ts` — add `@Auth(UserRole.ADMIN)` to POST (record payment), DELETE /:id
- `backend/src/modules/purchasing/services/purchase-order.service.ts` — delegate soft-delete and permanent-delete to `PurchaseOrderLifecycleService`; remove inline lock checks from `update()` (they stay but header fields bypass them)
- `backend/src/modules/purchasing/purchasing.module.ts` — register `PurchaseOrderLifecycleService`
- `backend/src/modules/sales/services/sales-order-lifecycle.service.ts` — add `assertItemsNotLocked()`, extend `syncChildrenFromSalesOrder()` to also sync header fields to DRAFT invoices and UNPAID payments
- `backend/src/modules/sales/services/sales-order-lifecycle.service.spec.ts` — add tests for new methods
- `backend/src/modules/sales/services/sales-order.service.ts` — call `assertItemsNotLocked()` before item update
- `frontend/src/pages/purchasing/components/PurchaseOrderWorkspaceCard.tsx` — add lock banner above items table
- `frontend/src/pages/sales/components/OrderWorkspaceCard.tsx` — add lock banner above items table
- `frontend/src/pages/sales/components/PaymentContextHeader.tsx` — add "Navigate to SO" button

---

## Task 1: Add Admin role guard to GRN controller

**Files:**
- Modify: `backend/src/modules/purchasing/controllers/goods-received-note.controller.ts`

- [ ] **Step 1: Add `@Auth(UserRole.ADMIN)` to POST, DELETE /:id, and DELETE /:id/permanent**

Open `backend/src/modules/purchasing/controllers/goods-received-note.controller.ts`. Add the import and decorators:

```typescript
// Add to existing imports at top of file:
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
```

Then decorate the three methods:

```typescript
// Before the existing @Post() decorator on create():
@Auth(UserRole.ADMIN)
@Post()
// ... existing decorators and method

// Before the existing @Delete(':id') decorator on softDelete():
@Auth(UserRole.ADMIN)
@Delete(':id')
// ... existing decorators and method

// Before the existing @Delete(':id/permanent') decorator on permanentDelete():
@Auth(UserRole.ADMIN)
@Delete(':id/permanent')
// ... existing decorators and method
```

- [ ] **Step 2: Run backend TypeScript check**

```bash
cd backend && npx tsc --noEmit --project tsconfig.build.json 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors related to goods-received-note.controller.ts

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/purchasing/controllers/goods-received-note.controller.ts
git commit -m "feat: restrict GRN create/delete to Admin role (issue #393)"
```

---

## Task 2: Add Admin role guard to Vendor Payment controller

**Files:**
- Modify: `backend/src/modules/purchasing/controllers/vendor-payment.controller.ts`

- [ ] **Step 1: Add `@Auth(UserRole.ADMIN)` to POST, DELETE /:id, and DELETE /:id/permanent**

Open `backend/src/modules/purchasing/controllers/vendor-payment.controller.ts`. Add imports and decorators:

```typescript
// Add to existing imports:
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
```

Apply to methods:

```typescript
// The create() method (POST /):
@Auth(UserRole.ADMIN)
@Post()
// ... existing decorators and method

// The softDelete() method (DELETE /:id):
@Auth(UserRole.ADMIN)
@Delete(':id')
// ... existing decorators and method

// The permanentDelete() method (DELETE /:id/permanent):
@Auth(UserRole.ADMIN)
@Delete(':id/permanent')
// ... existing decorators and method
```

Note: `POST /for-po/:poId` (create VP from PO workflow) must NOT get the Admin guard — standard users trigger VPs through the PO workflow.

- [ ] **Step 2: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit --project tsconfig.build.json 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/purchasing/controllers/vendor-payment.controller.ts
git commit -m "feat: restrict VP manual create/delete to Admin role (issue #393)"
```

---

## Task 3: Add Admin role guard to Invoice and Customer Payment controllers

**Files:**
- Modify: `backend/src/modules/sales/controllers/invoice.controller.ts`
- Modify: `backend/src/modules/sales/controllers/payment.controller.ts`

- [ ] **Step 1: Add guard to Invoice controller**

Open `backend/src/modules/sales/controllers/invoice.controller.ts`. Add imports:

```typescript
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
```

Apply to delete endpoints only (POST for invoice creation was removed in PR #388):

```typescript
// DELETE /:id (softDelete):
@Auth(UserRole.ADMIN)
@Delete(':id')
// ... existing decorators and method

// DELETE /:id/permanent (permanentDelete):
@Auth(UserRole.ADMIN)
@Delete(':id/permanent')
// ... existing decorators and method
```

- [ ] **Step 2: Add guard to Payment controller**

Open `backend/src/modules/sales/controllers/payment.controller.ts`. Add imports:

```typescript
import { Auth } from '../../auth/decorators/auth.decorator';
import { UserRole } from '../../../database/entities/user.entity';
```

Apply to create and delete:

```typescript
// POST / (recordPayment — manual create):
@Auth(UserRole.ADMIN)
@Post()
// ... existing decorators and method

// DELETE /:id (softDelete):
@Auth(UserRole.ADMIN)
@Delete(':id')
// ... existing decorators and method
```

Note: `POST /allocate`, `PUT /:id/complete`, `PUT /:id/cancel`, etc. remain unrestricted — those are workflow actions.

- [ ] **Step 3: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit --project tsconfig.build.json 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/sales/controllers/invoice.controller.ts backend/src/modules/sales/controllers/payment.controller.ts
git commit -m "feat: restrict Invoice/Payment manual create/delete to Admin role (issue #393)"
```

---

## Task 4: Create PurchaseOrderLifecycleService (soft-delete + permanent-delete guards)

**Files:**
- Create: `backend/src/modules/purchasing/services/purchase-order-lifecycle.service.ts`
- Create: `backend/src/modules/purchasing/services/purchase-order-lifecycle.service.spec.ts`

- [ ] **Step 1: Write the failing tests**

Create `backend/src/modules/purchasing/services/purchase-order-lifecycle.service.spec.ts`:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { PurchaseOrderLifecycleService } from './purchase-order-lifecycle.service';
import { PurchaseOrder } from '../../../database/entities/purchase-order.entity';
import { GoodsReceivedNote } from '../../../database/entities/goods-received-note.entity';
import { VendorPayment } from '../../../database/entities/vendor-payment.entity';
import { GrnStatus } from '../../../database/entities/goods-received-note.entity';
import { AuditLogService } from '../../audit-logs/services';
import { StockMovementService } from '../../inventory/services/stock-movement.service';

describe('PurchaseOrderLifecycleService', () => {
  let service: PurchaseOrderLifecycleService;
  let poRepository: any;
  let grnRepository: any;
  let vpRepository: any;
  let auditLogService: any;
  let stockMovementService: any;

  const mockPO = {
    id: 'po-1',
    orderNumber: 'PO-000001',
    paidAmount: 0,
    supplierId: 'supplier-1',
    totalAmount: 100,
  } as unknown as PurchaseOrder;

  const mockDraftGrn = {
    id: 'grn-1',
    grnNumber: 'GRN-000001',
    status: GrnStatus.DRAFT,
    purchaseOrderId: 'po-1',
  } as unknown as GoodsReceivedNote;

  const mockReceivedGrn = {
    ...mockDraftGrn,
    status: GrnStatus.RECEIVED,
  } as unknown as GoodsReceivedNote;

  const mockVP = {
    id: 'vp-1',
    paymentNumber: 'VP-000001',
    amount: 50,
    purchaseOrderId: 'po-1',
  } as unknown as VendorPayment;

  beforeEach(async () => {
    poRepository = {
      findOne: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn(),
      })),
      remove: jest.fn(),
    };
    grnRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn(),
      })),
      remove: jest.fn(),
    };
    vpRepository = {
      find: jest.fn(),
      createQueryBuilder: jest.fn(() => ({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn(),
      })),
      remove: jest.fn(),
    };
    auditLogService = { log: jest.fn() };
    stockMovementService = { deleteByReference: jest.fn().mockResolvedValue({ deletedCount: 0 }) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchaseOrderLifecycleService,
        { provide: getRepositoryToken(PurchaseOrder), useValue: poRepository },
        { provide: getRepositoryToken(GoodsReceivedNote), useValue: grnRepository },
        { provide: getRepositoryToken(VendorPayment), useValue: vpRepository },
        { provide: AuditLogService, useValue: auditLogService },
        { provide: StockMovementService, useValue: stockMovementService },
      ],
    }).compile();

    service = module.get<PurchaseOrderLifecycleService>(PurchaseOrderLifecycleService);
  });

  describe('assertItemsNotLocked', () => {
    it('throws when paidAmount > 0', async () => {
      poRepository.findOne.mockResolvedValue({ ...mockPO, paidAmount: 50 });
      grnRepository.findOne.mockResolvedValue(mockDraftGrn);

      await expect(service.assertItemsNotLocked('po-1')).rejects.toThrow(
        'Cannot edit purchase order items that have been paid. Please unpay first.',
      );
    });

    it('throws when GRN status is RECEIVED', async () => {
      poRepository.findOne.mockResolvedValue(mockPO);
      grnRepository.findOne.mockResolvedValue(mockReceivedGrn);

      await expect(service.assertItemsNotLocked('po-1')).rejects.toThrow(
        'Cannot edit purchase order items with received goods. Please return goods first.',
      );
    });

    it('resolves when paidAmount is 0 and no received GRN', async () => {
      poRepository.findOne.mockResolvedValue(mockPO);
      grnRepository.findOne.mockResolvedValue(mockDraftGrn);

      await expect(service.assertItemsNotLocked('po-1')).resolves.toBeUndefined();
    });

    it('resolves when no GRN exists', async () => {
      poRepository.findOne.mockResolvedValue(mockPO);
      grnRepository.findOne.mockResolvedValue(null);

      await expect(service.assertItemsNotLocked('po-1')).resolves.toBeUndefined();
    });
  });

  describe('softDelete', () => {
    it('throws when paidAmount > 0', async () => {
      poRepository.findOne.mockResolvedValue({ ...mockPO, paidAmount: 50 });
      grnRepository.findOne.mockResolvedValue(mockDraftGrn);

      await expect(service.softDelete('po-1')).rejects.toThrow(
        'Cannot delete purchase order that has been paid. Please unpay first.',
      );
    });

    it('throws when GRN status is RECEIVED', async () => {
      poRepository.findOne.mockResolvedValue(mockPO);
      grnRepository.findOne.mockResolvedValue(mockReceivedGrn);

      await expect(service.softDelete('po-1')).rejects.toThrow(
        'Cannot delete purchase order with received goods. Please return goods first.',
      );
    });

    it('soft-deletes PO and cascades to GRN and VP with same timestamp', async () => {
      poRepository.findOne.mockResolvedValue(mockPO);
      grnRepository.findOne.mockResolvedValue(mockDraftGrn);
      vpRepository.find.mockResolvedValue([mockVP]);

      const poQb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn(),
      };
      const grnQb = { ...poQb };
      const vpQb = { ...poQb };

      poRepository.createQueryBuilder.mockReturnValue(poQb);
      grnRepository.createQueryBuilder.mockReturnValue(grnQb);
      vpRepository.createQueryBuilder.mockReturnValue(vpQb);

      await service.softDelete('po-1');

      expect(poQb.execute).toHaveBeenCalled();
      expect(grnQb.execute).toHaveBeenCalled();
      expect(vpQb.execute).toHaveBeenCalled();

      // Verify same deletedAt was used (captured via set() spy)
      const poSetArg = poQb.set.mock.calls[0][0];
      const grnSetArg = grnQb.set.mock.calls[0][0];
      const vpSetArg = vpQb.set.mock.calls[0][0];
      expect(poSetArg.deletedAt).toEqual(grnSetArg.deletedAt);
      expect(poSetArg.deletedAt).toEqual(vpSetArg.deletedAt);
    });
  });

  describe('assertPermanentDeleteAllowed', () => {
    it('throws when stock movements exist', async () => {
      grnRepository.find.mockResolvedValue([mockDraftGrn]);
      stockMovementService.deleteByReference = jest.fn(); // not called in check
      // Mock the stock movement count check
      const mockManager = {
        getRepository: jest.fn().mockReturnValue({
          count: jest.fn().mockResolvedValue(3),
        }),
      };
      poRepository.manager = mockManager;

      await expect(service.assertPermanentDeleteAllowed('po-1')).rejects.toThrow(
        'Cannot permanently delete purchase order with existing stock movements.',
      );
    });

    it('throws when vendor payments exist', async () => {
      grnRepository.find.mockResolvedValue([]);
      vpRepository.find.mockResolvedValue([mockVP]);
      const mockManager = {
        getRepository: jest.fn().mockReturnValue({
          count: jest.fn().mockResolvedValue(0),
        }),
      };
      poRepository.manager = mockManager;

      await expect(service.assertPermanentDeleteAllowed('po-1')).rejects.toThrow(
        'Cannot permanently delete purchase order with existing vendor payments.',
      );
    });

    it('resolves when no stock movements and no payments', async () => {
      grnRepository.find.mockResolvedValue([]);
      vpRepository.find.mockResolvedValue([]);
      const mockManager = {
        getRepository: jest.fn().mockReturnValue({
          count: jest.fn().mockResolvedValue(0),
        }),
      };
      poRepository.manager = mockManager;

      await expect(service.assertPermanentDeleteAllowed('po-1')).resolves.toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest src/modules/purchasing/services/purchase-order-lifecycle.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `Cannot find module './purchase-order-lifecycle.service'`

- [ ] **Step 3: Implement PurchaseOrderLifecycleService**

Create `backend/src/modules/purchasing/services/purchase-order-lifecycle.service.ts`:

```typescript
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GoodsReceivedNote, GrnStatus } from '../../../database/entities/goods-received-note.entity';
import { PurchaseOrder } from '../../../database/entities/purchase-order.entity';
import { VendorPayment } from '../../../database/entities/vendor-payment.entity';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import { AuditLogService } from '../../audit-logs/services';

@Injectable()
export class PurchaseOrderLifecycleService {
  private readonly logger = new Logger(PurchaseOrderLifecycleService.name);

  constructor(
    @InjectRepository(PurchaseOrder)
    private readonly poRepository: Repository<PurchaseOrder>,
    @InjectRepository(GoodsReceivedNote)
    private readonly grnRepository: Repository<GoodsReceivedNote>,
    @InjectRepository(VendorPayment)
    private readonly vpRepository: Repository<VendorPayment>,
    private readonly stockMovementService: StockMovementService,
    private readonly auditLogService: AuditLogService,
  ) {}

  async assertItemsNotLocked(poId: string): Promise<void> {
    const po = await this.poRepository.findOne({ where: { id: poId } });
    if (!po) throw new NotFoundException('Purchase order not found');

    if (Number(po.paidAmount || 0) > 0) {
      throw new BadRequestException(
        'Cannot edit purchase order items that have been paid. Please unpay first.',
      );
    }

    const grn = await this.grnRepository.findOne({ where: { purchaseOrderId: poId } });
    if (grn && grn.status === GrnStatus.RECEIVED) {
      throw new BadRequestException(
        'Cannot edit purchase order items with received goods. Please return goods first.',
      );
    }
  }

  async softDelete(poId: string, userId?: string, username?: string): Promise<void> {
    const po = await this.poRepository.findOne({ where: { id: poId } });
    if (!po) throw new NotFoundException('Purchase order not found');

    if (Number(po.paidAmount || 0) > 0) {
      throw new BadRequestException(
        'Cannot delete purchase order that has been paid. Please unpay first.',
      );
    }

    const grn = await this.grnRepository.findOne({ where: { purchaseOrderId: poId } });
    if (grn && grn.status === GrnStatus.RECEIVED) {
      throw new BadRequestException(
        'Cannot delete purchase order with received goods. Please return goods first.',
      );
    }

    const deletedAt = new Date();

    if (grn) {
      await this.grnRepository
        .createQueryBuilder()
        .update()
        .set({ deletedAt })
        .where('id = :id', { id: grn.id })
        .execute();

      await this.auditLogService.log('DELETE', 'GoodsReceivedNote', `Deleted GRN: ${grn.grnNumber} (cascaded from PO ${po.orderNumber})`, {
        entityId: grn.id,
        userId: userId || 'system',
        username,
        oldValues: { grnNumber: grn.grnNumber, purchaseOrderId: poId, status: grn.status },
      });
    }

    const vps = await this.vpRepository.find({ where: { purchaseOrderId: poId } });
    for (const vp of vps) {
      await this.vpRepository
        .createQueryBuilder()
        .update()
        .set({ deletedAt })
        .where('id = :id', { id: vp.id })
        .execute();

      await this.auditLogService.log('DELETE', 'VendorPayment', `Deleted VP: ${vp.paymentNumber} (cascaded from PO ${po.orderNumber})`, {
        entityId: vp.id,
        userId: userId || 'system',
        username,
        oldValues: { paymentNumber: vp.paymentNumber, amount: vp.amount },
      });
    }

    await this.poRepository
      .createQueryBuilder()
      .update()
      .set({ deletedAt })
      .where('id = :id', { id: poId })
      .execute();

    await this.auditLogService.log('DELETE', 'PurchaseOrder', `Deleted purchase order: ${po.orderNumber}`, {
      entityId: poId,
      userId: userId || 'system',
      username,
      oldValues: { orderNumber: po.orderNumber, totalAmount: po.totalAmount },
    });

    this.logger.log(`PO ${po.orderNumber} and children soft-deleted with timestamp ${deletedAt.toISOString()}`);
  }

  async assertPermanentDeleteAllowed(poId: string): Promise<void> {
    const grns = await this.grnRepository.find({ where: { purchaseOrderId: poId }, withDeleted: true });

    if (grns.length > 0) {
      const stockMovementRepo = this.poRepository.manager.getRepository('StockMovement' as any);
      const grnIds = grns.map((g) => g.id);
      const movementCount = await (stockMovementRepo as any).count({
        where: grnIds.map((id) => ({ referenceId: id, referenceType: 'goods_received_note' })),
      });

      if (movementCount > 0) {
        throw new BadRequestException(
          'Cannot permanently delete purchase order with existing stock movements.',
        );
      }
    }

    const vps = await this.vpRepository.find({ where: { purchaseOrderId: poId }, withDeleted: true });
    if (vps.length > 0) {
      throw new BadRequestException(
        'Cannot permanently delete purchase order with existing vendor payments.',
      );
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/modules/purchasing/services/purchase-order-lifecycle.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/purchasing/services/purchase-order-lifecycle.service.ts backend/src/modules/purchasing/services/purchase-order-lifecycle.service.spec.ts
git commit -m "feat: add PurchaseOrderLifecycleService with lock and cascade guards (issue #393)"
```

---

## Task 5: Register PurchaseOrderLifecycleService in PurchasingModule

**Files:**
- Modify: `backend/src/modules/purchasing/purchasing.module.ts`

- [ ] **Step 1: Add import and register as provider**

Open `backend/src/modules/purchasing/purchasing.module.ts`. Add import:

```typescript
import { PurchaseOrderLifecycleService } from './services/purchase-order-lifecycle.service';
```

Add to `providers` array (after `PurchaseOrderService`):

```typescript
providers: [
  SupplierService,
  PurchaseOrderService,
  PurchaseOrderLifecycleService,   // <-- add this
  GoodsReceivedNoteService,
  VendorPaymentService,
  PurchasingAnalyticsService,
  // ... rest of existing providers
],
```

If `PurchaseOrderLifecycleService` needs to be injected outside the module, also add to `exports`. For now it's only used within the purchasing module so `providers` only is sufficient.

- [ ] **Step 2: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit --project tsconfig.build.json 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/purchasing/purchasing.module.ts
git commit -m "feat: register PurchaseOrderLifecycleService in PurchasingModule (issue #393)"
```

---

## Task 6: Delegate PO soft-delete and permanent-delete to PurchaseOrderLifecycleService

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.ts`

- [ ] **Step 1: Inject PurchaseOrderLifecycleService and update `remove()` and `permanentDelete()`**

In `purchase-order.service.ts`, inject the lifecycle service in the constructor:

```typescript
// Add to constructor parameters:
private readonly purchaseOrderLifecycleService: PurchaseOrderLifecycleService,
```

Add import at top:

```typescript
import { PurchaseOrderLifecycleService } from './purchase-order-lifecycle.service';
```

Replace the body of `remove()` (currently ~lines 991–1080) with a delegation call:

```typescript
async remove(id: string, userId?: string, username?: string): Promise<void> {
  this.logger.log(`Soft deleting purchase order: ${id}`);
  await this.purchaseOrderLifecycleService.softDelete(id, userId, username);
}
```

In `permanentDelete()`, add guard call before the existing deletion logic (insert after the `if (!purchaseOrder)` block, around line 868):

```typescript
// After the purchaseOrder null check, before deleting stock movements:
await this.purchaseOrderLifecycleService.assertPermanentDeleteAllowed(id);
```

Leave the rest of `permanentDelete()` intact — it already handles stock movement deletion, VP deletion, and GRN deletion correctly.

Also update `update()` — **remove** the existing inline lock checks (lines ~505–518: the GRN RECEIVED check and the VP payment check) since items-only locking will now be enforced by calling `assertItemsNotLocked` only when items are in the DTO. Replace those two blocks with a single conditional call:

```typescript
// At the start of the try block inside update(), before Object.assign:
if (updatePurchaseOrderDto.items) {
  await this.purchaseOrderLifecycleService.assertItemsNotLocked(id);
}
// Header fields (dates, notes, supplier) are updated freely without this check
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit --project tsconfig.build.json 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors

- [ ] **Step 3: Run existing PO service tests**

```bash
cd backend && npx jest src/modules/purchasing/services/purchase-order.service.spec.ts --no-coverage 2>&1 | tail -30
```

Expected: all existing tests still PASS (mock `PurchaseOrderLifecycleService` if needed in the spec)

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/purchasing/services/purchase-order.service.ts
git commit -m "feat: delegate PO soft-delete/perm-delete/item-lock to lifecycle service (issue #393)"
```

---

## Task 7: Extend SalesOrderLifecycleService with item-lock and header sync

**Files:**
- Modify: `backend/src/modules/sales/services/sales-order-lifecycle.service.ts`
- Modify: `backend/src/modules/sales/services/sales-order-lifecycle.service.spec.ts` (create if not existing)

- [ ] **Step 1: Write failing tests for new methods**

Open (or create) `backend/src/modules/sales/services/sales-order-lifecycle.service.spec.ts` and add tests for the two new methods:

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException } from '@nestjs/common';
import { SalesOrderLifecycleService } from './sales-order-lifecycle.service';
import { SalesOrder } from '../../../database/entities/sales-order.entity';
import { SalesOrderItem } from '../../../database/entities/sales-order-item.entity';
import { Customer } from '../../../database/entities/customer.entity';
import { Invoice } from '../../../database/entities/invoice.entity';
import { InvoiceStatus } from '../../../database/entities/invoice.entity';
import { AuditLogService } from '../../audit-logs/services';
import { InventoryIntegrationService } from './inventory-integration.service';
import { StockMovementService } from '../../inventory/services/stock-movement.service';
import { ILike } from 'typeorm';

describe('SalesOrderLifecycleService — item lock and header sync', () => {
  let service: SalesOrderLifecycleService;
  let soRepository: any;
  let invoiceRepository: any;
  let auditLogService: any;

  const mockOrder = {
    id: 'so-1',
    orderNumber: 'SO-000001',
    paidAmount: 0,
    isFulfilled: false,
    customerId: 'cust-1',
    totalAmount: 200,
  } as unknown as SalesOrder;

  const mockDraftInvoice = {
    id: 'inv-1',
    invoiceNumber: 'INV-000001',
    status: InvoiceStatus.DRAFT,
    salesOrderId: 'so-1',
    customerId: 'cust-1',
    dueDate: new Date('2026-01-01'),
    notes: 'old notes',
  } as unknown as Invoice;

  const mockPaidInvoice = {
    ...mockDraftInvoice,
    status: InvoiceStatus.PAID,
  } as unknown as Invoice;

  beforeEach(async () => {
    soRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
      softDelete: jest.fn(),
      restore: jest.fn(),
      delete: jest.fn(),
      createQueryBuilder: jest.fn(),
      manager: { getRepository: jest.fn().mockReturnValue({ find: jest.fn().mockResolvedValue([]), softDelete: jest.fn(), restore: jest.fn(), delete: jest.fn() }) },
    };
    invoiceRepository = {
      find: jest.fn(),
      save: jest.fn(),
    };
    auditLogService = { log: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesOrderLifecycleService,
        { provide: getRepositoryToken(SalesOrder), useValue: soRepository },
        { provide: getRepositoryToken(SalesOrderItem), useValue: { delete: jest.fn() } },
        { provide: getRepositoryToken(Customer), useValue: { save: jest.fn() } },
        { provide: getRepositoryToken(Invoice), useValue: invoiceRepository },
        { provide: InventoryIntegrationService, useValue: { releaseReservation: jest.fn() } },
        { provide: StockMovementService, useValue: { deleteByReference: jest.fn().mockResolvedValue({ deletedCount: 0 }) } },
        { provide: AuditLogService, useValue: auditLogService },
      ],
    }).compile();

    service = module.get<SalesOrderLifecycleService>(SalesOrderLifecycleService);
  });

  describe('assertItemsNotLocked', () => {
    it('throws when paidAmount > 0', async () => {
      soRepository.findOne.mockResolvedValue({ ...mockOrder, paidAmount: 100 });

      await expect(service.assertItemsNotLocked('so-1')).rejects.toThrow(
        'Cannot edit sales order items that have been paid. Please unpay first.',
      );
    });

    it('throws when isFulfilled is true', async () => {
      soRepository.findOne.mockResolvedValue({ ...mockOrder, isFulfilled: true });

      await expect(service.assertItemsNotLocked('so-1')).rejects.toThrow(
        'Cannot edit sales order items that have been fulfilled. Please unfulfill first.',
      );
    });

    it('resolves when neither paid nor fulfilled', async () => {
      soRepository.findOne.mockResolvedValue(mockOrder);

      await expect(service.assertItemsNotLocked('so-1')).resolves.toBeUndefined();
    });
  });

  describe('syncChildHeaderFromSalesOrder', () => {
    it('syncs header fields to DRAFT invoice', async () => {
      const updatedOrder = {
        ...mockOrder,
        customerId: 'cust-new',
        orderDate: new Date('2026-04-01'),
        notes: 'new notes',
      } as unknown as SalesOrder;
      invoiceRepository.find.mockResolvedValue([mockDraftInvoice]);
      invoiceRepository.save.mockResolvedValue(mockDraftInvoice);

      await service.syncChildHeaderFromSalesOrder(updatedOrder);

      expect(invoiceRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ customerId: 'cust-new', notes: 'new notes' }),
      );
    });

    it('skips PAID invoices during header sync', async () => {
      const updatedOrder = { ...mockOrder, notes: 'new notes' } as unknown as SalesOrder;
      invoiceRepository.find.mockResolvedValue([mockPaidInvoice]);

      await service.syncChildHeaderFromSalesOrder(updatedOrder);

      expect(invoiceRepository.save).not.toHaveBeenCalled();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd backend && npx jest src/modules/sales/services/sales-order-lifecycle.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `service.assertItemsNotLocked is not a function` and `service.syncChildHeaderFromSalesOrder is not a function`

- [ ] **Step 3: Add new methods to SalesOrderLifecycleService**

Open `backend/src/modules/sales/services/sales-order-lifecycle.service.ts` and add two new methods before the closing `}` of the class:

```typescript
async assertItemsNotLocked(soId: string): Promise<void> {
  const order = await this.salesOrderRepository.findOne({ where: { id: soId } });
  if (!order) throw new BadRequestException('Sales order not found');

  if (Number(order.paidAmount || 0) > 0) {
    throw new BadRequestException(
      'Cannot edit sales order items that have been paid. Please unpay first.',
    );
  }

  if (order.isFulfilled) {
    throw new BadRequestException(
      'Cannot edit sales order items that have been fulfilled. Please unfulfill first.',
    );
  }
}

async syncChildHeaderFromSalesOrder(order: SalesOrder): Promise<void> {
  try {
    const invoices = await this.invoiceRepository.find({
      where: { salesOrderId: order.id },
    });

    for (const invoice of invoices) {
      if (invoice.status === InvoiceStatus.PAID) continue;

      invoice.customerId = order.customerId;
      if (order.notes !== undefined) invoice.notes = order.notes;
      // Sync dueDate from order orderDate if desired
      await this.invoiceRepository.save(invoice);
    }

    this.logger.log(`Synced header to ${invoices.filter(i => i.status !== InvoiceStatus.PAID).length} invoice(s) for SO ${order.orderNumber}`);
  } catch (error) {
    this.logger.error(`Failed to sync child header for SO ${order.orderNumber}: ${error.message}`);
    // Don't throw — header sync failure should not block SO update
  }
}
```

Also add the `InvoiceStatus` import at the top if not already present:

```typescript
import { Invoice, InvoiceStatus } from '../../../database/entities/invoice.entity';
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && npx jest src/modules/sales/services/sales-order-lifecycle.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: All new tests PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/sales/services/sales-order-lifecycle.service.ts backend/src/modules/sales/services/sales-order-lifecycle.service.spec.ts
git commit -m "feat: add assertItemsNotLocked and syncChildHeaderFromSalesOrder to SalesOrderLifecycleService (issue #393)"
```

---

## Task 8: Wire item-lock and header sync into SalesOrderService update()

**Files:**
- Modify: `backend/src/modules/sales/services/sales-order.service.ts`

- [ ] **Step 1: Locate the update method and add lock + sync calls**

Open `backend/src/modules/sales/services/sales-order.service.ts`. Find the `update()` method.

Add an item-lock check before items are processed (only when items are in the DTO):

```typescript
// At the start of update(), after loading the order:
if (updateDto.items) {
  await this.lifecycleService.assertItemsNotLocked(id);
}
```

Where `this.lifecycleService` is your existing `SalesOrderLifecycleService` injection. If the property name is different, use the actual property name.

After saving the updated order, call header sync unconditionally (it internally skips PAID invoices):

```typescript
// After await this.salesOrderRepository.save(order):
await this.lifecycleService.syncChildHeaderFromSalesOrder(savedOrder);
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit --project tsconfig.build.json 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors

- [ ] **Step 3: Run related tests**

```bash
cd backend && npx jest src/modules/sales/ --no-coverage 2>&1 | tail -30
```

Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/sales/services/sales-order.service.ts
git commit -m "feat: enforce item-lock and sync child header on SO update (issue #393)"
```

---

## Task 9: Add GRN supplier/header sync to PO update

**Files:**
- Modify: `backend/src/modules/purchasing/services/purchase-order.service.ts`

- [ ] **Step 1: Extend syncDraftGrn to also sync supplier and notes**

In `purchase-order.service.ts`, locate `syncDraftGrn()` (around line 1086). After the line that syncs GRN items, add supplier and notes sync before `await this.grnRepository.save(updatedGrn)`:

```typescript
// After updatedGrn.calculateTotals(), before save:
if (fullPO.supplierId) {
  updatedGrn.supplierId = fullPO.supplierId;
}
if (fullPO.notes !== undefined) {
  updatedGrn.notes = fullPO.notes;
}
```

Also ensure `syncGrnDate()` is called whenever `orderDate` changes (it already is at line 614 — no change needed).

Find the call site in `update()` where `syncDraftGrn` is called (line ~609) and also call a new `syncDraftGrnHeader()` method when non-item header fields change:

```typescript
// After the existing syncDraftGrn call for items:
if (updatePurchaseOrderDto.items) {
  await this.syncDraftGrn(updatedPurchaseOrder.id);
}

// Sync supplier/notes whenever they are provided (regardless of items):
if (updatePurchaseOrderDto.supplierId !== undefined || updatePurchaseOrderDto.notes !== undefined) {
  await this.syncDraftGrnHeader(updatedPurchaseOrder.id);
}
```

Add a new private method `syncDraftGrnHeader()` after `syncDraftGrn()`:

```typescript
private async syncDraftGrnHeader(purchaseOrderId: string): Promise<void> {
  try {
    const grn = await this.grnRepository.findOne({ where: { purchaseOrderId } });
    if (!grn || grn.status !== GrnStatus.DRAFT) return;

    const fullPO = await this.purchaseOrderRepository.findOne({ where: { id: purchaseOrderId } });
    if (!fullPO) return;

    if (fullPO.supplierId) grn.supplierId = fullPO.supplierId;
    if (fullPO.notes !== undefined) grn.notes = fullPO.notes;

    await this.grnRepository.save(grn);
    this.logger.log(`GRN ${grn.grnNumber} header synced from PO ${fullPO.orderNumber}`);
  } catch (error) {
    this.logger.error(`Error syncing draft GRN header: ${error.message}`, error.stack);
  }
}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd backend && npx tsc --noEmit --project tsconfig.build.json 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors

- [ ] **Step 3: Run PO service tests**

```bash
cd backend && npx jest src/modules/purchasing/services/purchase-order.service.spec.ts --no-coverage 2>&1 | tail -20
```

Expected: all tests PASS

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/purchasing/services/purchase-order.service.ts
git commit -m "feat: sync GRN header (supplier, notes) from PO on update (issue #393)"
```

---

## Task 10: Add lock banner to PO items table (frontend)

**Files:**
- Modify: `frontend/src/pages/purchasing/components/PurchaseOrderWorkspaceCard.tsx`

- [ ] **Step 1: Add lock banner above items table when PO is locked**

Open `frontend/src/pages/purchasing/components/PurchaseOrderWorkspaceCard.tsx`.

Add the necessary MUI import if not already present:

```typescript
import Alert from '@mui/material/Alert';
```

Locate where the items table is rendered. Before the items table, add:

```typescript
{(() => {
  const isReceived = selectedOrder.goodsReceivedNotes?.some(
    (grn: any) => grn.status === 'received',
  );
  const isPaid = Number(selectedOrder.paidAmount || 0) > 0;
  const isLocked = isReceived || isPaid;

  if (!isLocked) return null;

  const reason = isReceived && isPaid
    ? 'return goods and unpay'
    : isReceived
    ? 'return goods'
    : 'unpay';

  return (
    <Alert severity="warning" sx={{ mb: 1, fontSize: '0.8rem', py: 0.5 }}>
      Items are locked — {reason} before editing
    </Alert>
  );
})()}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/purchasing/components/PurchaseOrderWorkspaceCard.tsx
git commit -m "feat: show item lock banner on PO workspace when paid or received (issue #393)"
```

---

## Task 11: Add lock banner to SO items table (frontend)

**Files:**
- Modify: `frontend/src/pages/sales/components/OrderWorkspaceCard.tsx`

- [ ] **Step 1: Add lock banner above items table when SO is locked**

Open `frontend/src/pages/sales/components/OrderWorkspaceCard.tsx`.

Add Alert import if not already present:

```typescript
import Alert from '@mui/material/Alert';
```

Locate where the items table is rendered. Before the items table, add:

```typescript
{(() => {
  const isPaid = Number(selectedOrder.paidAmount || 0) > 0;
  const isFulfilled = selectedOrder.isFulfilled;
  const isLocked = isPaid || isFulfilled;

  if (!isLocked) return null;

  const reason = isPaid && isFulfilled
    ? 'unpay and unfulfill'
    : isPaid
    ? 'unpay'
    : 'unfulfill';

  return (
    <Alert severity="warning" sx={{ mb: 1, fontSize: '0.8rem', py: 0.5 }}>
      Items are locked — {reason} before editing
    </Alert>
  );
})()}
```

- [ ] **Step 2: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/sales/components/OrderWorkspaceCard.tsx
git commit -m "feat: show item lock banner on SO workspace when paid or fulfilled (issue #393)"
```

---

## Task 12: Add "Navigate to SO" button to Payment context header

**Files:**
- Modify: `frontend/src/pages/sales/components/PaymentContextHeader.tsx`

- [ ] **Step 1: Check current state of PaymentContextHeader**

The current `PaymentContextHeader` has `onInvoiceClick` but no "Navigate to SO" link. Customer Payments link to Invoices which link to SO — so navigating to SO from a payment requires going through the invoice's `salesOrderId`.

Open `frontend/src/pages/sales/components/PaymentContextHeader.tsx`. Add a "Navigate to Invoice" action (since payments link directly to invoices, not SO) using the existing `onInvoiceClick` prop. If a direct SO navigation is desired, it requires fetching the invoice's SO id.

The simpler and correct approach: the payment already shows the linked invoice. The existing `onInvoiceClick` navigates to the invoice, which then shows the SO link. So PaymentContextHeader already has the navigation chain covered.

Verify that `onInvoiceClick` is wired up in the parent hook (`useInvoicesWorkspace` or `usePaymentsWorkspace`) and navigates to the InvoicesPage with the invoice selected. If it does, no change is needed.

```bash
grep -n "onInvoiceClick\|invoiceClick\|navigate.*invoice" /home/blur/erp2/frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts 2>/dev/null | head -10
grep -n "onInvoiceClick\|navigate" /home/blur/erp2/frontend/src/pages/sales/components/PaymentContextHeader.tsx | head -10
```

- [ ] **Step 2: If onInvoiceClick navigation is missing, add it**

If `onInvoiceClick` does not navigate to the invoice page, open the payments workspace hook and add:

```typescript
const handleInvoiceClick = useCallback((invoiceId: string, event: React.MouseEvent) => {
  event.stopPropagation();
  navigate(`/sales/invoices?invoiceId=${invoiceId}`);
}, [navigate]);
```

Pass this as `onInvoiceClick` to `PaymentContextHeader`.

- [ ] **Step 3: Run TypeScript check**

```bash
cd frontend && npm run type-check 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/sales/components/PaymentContextHeader.tsx frontend/src/pages/sales/hooks/usePaymentsWorkspace.ts
git commit -m "feat: ensure Payment context header navigates to parent Invoice (issue #393)"
```

---

## Task 13: Run full backend test suite and verify

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npm run test 2>&1 | tail -40
```

Expected: all tests pass, no regressions

- [ ] **Step 2: Run TypeScript check for both packages**

```bash
cd backend && npx tsc --noEmit --project tsconfig.build.json 2>&1 | grep -E "error TS" | head -20
cd frontend && npm run type-check 2>&1 | grep -E "error TS" | head -20
```

Expected: no errors in either

- [ ] **Step 3: Commit if any lint fixes needed**

```bash
cd backend && npm run lint -- --fix && npm run format
git add -A && git commit -m "chore: lint and format after transaction-led architecture (issue #393)"
```

---

## Task 14: Create PR

- [ ] **Step 1: Push branch and create PR**

```bash
git push origin HEAD
gh pr create \
  --title "feat: transaction-led, admin-overridable architecture for GRN/VP/Invoice/Payment (issue #393)" \
  --body "$(cat <<'EOF'
## Summary
- Add `@Auth(UserRole.ADMIN)` to manual create/delete endpoints on GRN, Vendor Payment, Invoice, and Customer Payment controllers
- Add `PurchaseOrderLifecycleService` with item-lock guard, soft-delete cascade (PO→GRN→VP), and permanent-delete guard
- Extend `SalesOrderLifecycleService` with `assertItemsNotLocked()` and `syncChildHeaderFromSalesOrder()`
- PO/SO item edits blocked when paid or fulfilled (header fields always editable)
- PO update syncs supplier/notes to DRAFT GRN in addition to items
- SO update syncs customer/notes to DRAFT invoices
- Lock banner shown on PO/SO workspace items table when locked

## Test plan
- [ ] Standard user cannot POST/DELETE GRN, VP, Invoice, Payment — gets 403
- [ ] Admin can manually create/delete all four
- [ ] PO with paid VP → item edit blocked, header (dates, notes, supplier) edit allowed
- [ ] PO with RECEIVED GRN → item edit blocked
- [ ] PO soft-delete blocked until unpaid + returned; GRN and VP cascade with same deletedAt timestamp
- [ ] PO permanent delete blocked if stock movements or payments exist in DB
- [ ] SO equivalents of the above
- [ ] Editing PO items syncs to DRAFT GRN items; editing supplier/notes syncs to DRAFT GRN header
- [ ] Editing SO items syncs to DRAFT invoice; editing notes/customer syncs to DRAFT invoice header
- [ ] Lock banner visible on PO workspace when isReceived or isPaid
- [ ] Lock banner visible on SO workspace when isFulfilled or isPaid > 0
- [ ] All backend tests pass

Closes #393

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Section 1 (access control): Tasks 1–3
- ✅ Section 2 (PurchaseOrderLifecycleService): Tasks 4–6, 9
- ✅ Section 3 (SalesOrderLifecycleService extensions): Tasks 7–8
- ✅ Section 4 (frontend archive pattern / lock banner): Tasks 10–12
- ✅ Section 5 (testing): Tasks 4, 7, 13, 14

**Decisions honoured:**
- ✅ Lock applies to items only — header fields bypass the lock check in both PO and SO
- ✅ Soft-delete cascade: PO→GRN→VP same timestamp; SO soft-delete guard already exists
- ✅ Permanent delete blocked if stock movements or payments in DB
- ✅ No new dialogs; existing BlockedPurchaseOrderDialog and SO blocked dialog remain
- ✅ Child sync: GRN items + header (supplier, notes, date); Invoice items (existing) + header (customer, notes)
