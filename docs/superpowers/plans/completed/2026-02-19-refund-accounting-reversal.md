# Refund & Accounting Reversal Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix missing accounting journal entry reversals when unpaying/unfulfilling sales orders, and add a proper refund flow (supporting different payment methods) accessible from the order detail page.

**Architecture:** Add `reverseSourceEntries()` and `reversePaymentEntry()` helpers to `AccountingService`, wire them into `unpayOrder()`, `unfulfillOrder()`, and `payment.refund()`. Extend `RefundPaymentDto` with an optional `refundPaymentMethodId`. Add a Refund button + dialog to the order detail payments table in the frontend.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, React 18, MUI v7, Redux Toolkit, TypeScript

---

## Key Files Reference

| File | Purpose |
|---|---|
| `backend/src/modules/accounting/services/accounting.service.ts` | Add reversal helpers |
| `backend/src/modules/accounting/services/accounting.service.spec.ts` | Tests for new helpers |
| `backend/src/modules/sales/services/payment.service.ts` | Wire refund → accounting |
| `backend/src/modules/sales/dto/payment.dto.ts` | Add `refundPaymentMethodId` field |
| `backend/src/modules/sales/services/sales-order.service.ts` | Wire unpay/unfulfill → accounting |
| `frontend/src/pages/sales/OrdersPage.tsx` | Add Refund button + dialog |
| `frontend/src/services/salesApi.ts` | Update refund API call |

---

## Task 1: Add `reverseSourceEntries()` to AccountingService

**Files:**
- Modify: `backend/src/modules/accounting/services/accounting.service.ts`
- Modify: `backend/src/modules/accounting/services/accounting.service.spec.ts`

**Context:** `AccountingService` already has `journalEntryService` and `fiscalPeriodService` injected. `JournalEntryService.reverseEntry(id, userId)` exists and reverses a POSTED entry — but it currently checks if the original entry's fiscal period is open, which will fail for closed periods. We need to override the fiscal period to the current open one. Read the `reverseEntry` implementation at `journal-entry.service.ts:403-472` before starting.

**Step 1: Read the existing reverseEntry method**

Read `backend/src/modules/accounting/services/journal-entry.service.ts` lines 398-480.

Note: `reverseEntry()` currently uses `originalEntry.fiscalPeriodId` for the reversal. It calls `checkPeriodOpen(originalEntry.fiscalPeriodId)` and throws if closed. We need a version that accepts an override `fiscalPeriodId`.

**Step 2: Add `reverseEntryInPeriod()` to JournalEntryService**

In `journal-entry.service.ts`, add this method after `reverseEntry()`:

```typescript
async reverseEntryInPeriod(
  id: string,
  fiscalPeriodId: string,
  userId: string = 'system',
): Promise<JournalEntryResponseDto> {
  this.logger.log(`Reversing journal entry ${id} into period ${fiscalPeriodId}`);

  const originalEntry = await this.journalEntryRepository.findOne({
    where: { id },
    relations: ['fiscalPeriod', 'lines', 'lines.account'],
  });

  if (!originalEntry) {
    throw new NotFoundException(`Journal entry with ID '${id}' not found`);
  }

  if (originalEntry.status !== JournalEntryStatus.POSTED) {
    throw new BadRequestException(
      `Cannot reverse journal entry with status '${originalEntry.status}'. Only POSTED entries can be reversed.`,
    );
  }

  if (originalEntry.reversedById) {
    throw new BadRequestException(
      `Journal entry '${originalEntry.referenceNumber}' has already been reversed`,
    );
  }

  const periodIsOpen = await this.fiscalPeriodService.checkPeriodOpen(fiscalPeriodId);
  if (!periodIsOpen) {
    throw new BadRequestException(
      `Cannot reverse journal entry - target fiscal period is closed`,
    );
  }

  const reversalReferenceNumber = await this.generateReferenceNumber(new Date(), 'REV');

  const reversalEntry = this.journalEntryRepository.create({
    entryDate: new Date(),
    referenceNumber: reversalReferenceNumber,
    description: `Reversal of ${originalEntry.referenceNumber} - ${originalEntry.description}`,
    fiscalPeriodId,
    reversalOfId: originalEntry.id,
    status: JournalEntryStatus.POSTED,
    sourceType: originalEntry.sourceType,
    sourceId: originalEntry.sourceId,
  });

  const savedReversalEntry = await this.journalEntryRepository.save(reversalEntry);

  const reversalLines = originalEntry.lines.map((line) =>
    this.journalEntryLineRepository.create({
      journalEntryId: savedReversalEntry.id,
      accountId: line.accountId,
      debitAmount: line.creditAmount,
      creditAmount: line.debitAmount,
      memo: line.memo ? `Reversal: ${line.memo}` : 'Reversal entry',
    }),
  );

  await this.journalEntryLineRepository.save(reversalLines);

  originalEntry.status = JournalEntryStatus.REVERSED;
  originalEntry.reversedById = savedReversalEntry.id;
  await this.journalEntryRepository.save(originalEntry);

  this.logger.log(`Journal entry reversed: ${id} -> ${savedReversalEntry.id}`);
  return this.findOne(savedReversalEntry.id);
}
```

**Step 3: Write the failing tests for `reverseSourceEntries()` in accounting.service.spec.ts**

Add a new `describe` block at the end of `accounting.service.spec.ts`:

```typescript
describe('reverseSourceEntries', () => {
  const mockOpenPeriod = {
    id: 'period-open-123',
    status: FiscalPeriodStatus.OPEN,
    startDate: new Date('2026-02-01'),
    endDate: new Date('2026-02-28'),
  };

  const mockPostedEntry = {
    id: 'je-123',
    status: 'POSTED',
    reversedById: null,
    sourceType: 'payment',
    sourceId: 'pay-123',
  };

  it('should reverse all posted entries matching sourceType and sourceId', async () => {
    journalEntryService.findBySource = jest.fn().mockResolvedValue([mockPostedEntry]);
    fiscalPeriodService.getCurrentPeriod = jest.fn().mockResolvedValue(mockOpenPeriod);
    journalEntryService.reverseEntryInPeriod = jest.fn().mockResolvedValue({});

    await service.reverseSourceEntries('payment', 'pay-123', 'system');

    expect(journalEntryService.reverseEntryInPeriod).toHaveBeenCalledWith(
      'je-123',
      'period-open-123',
      'system',
    );
  });

  it('should throw BadRequestException if no open fiscal period', async () => {
    journalEntryService.findBySource = jest.fn().mockResolvedValue([mockPostedEntry]);
    fiscalPeriodService.getCurrentPeriod = jest.fn().mockResolvedValue(null);

    await expect(
      service.reverseSourceEntries('payment', 'pay-123', 'system'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should skip entries that are already reversed', async () => {
    const alreadyReversed = { ...mockPostedEntry, reversedById: 'je-456' };
    journalEntryService.findBySource = jest.fn().mockResolvedValue([alreadyReversed]);
    fiscalPeriodService.getCurrentPeriod = jest.fn().mockResolvedValue(mockOpenPeriod);
    journalEntryService.reverseEntryInPeriod = jest.fn();

    await service.reverseSourceEntries('payment', 'pay-123', 'system');

    expect(journalEntryService.reverseEntryInPeriod).not.toHaveBeenCalled();
  });

  it('should skip entries that are not POSTED', async () => {
    const draftEntry = { ...mockPostedEntry, status: 'DRAFT', reversedById: null };
    journalEntryService.findBySource = jest.fn().mockResolvedValue([draftEntry]);
    fiscalPeriodService.getCurrentPeriod = jest.fn().mockResolvedValue(mockOpenPeriod);
    journalEntryService.reverseEntryInPeriod = jest.fn();

    await service.reverseSourceEntries('payment', 'pay-123', 'system');

    expect(journalEntryService.reverseEntryInPeriod).not.toHaveBeenCalled();
  });

  it('should do nothing if no entries found', async () => {
    journalEntryService.findBySource = jest.fn().mockResolvedValue([]);
    fiscalPeriodService.getCurrentPeriod = jest.fn();
    journalEntryService.reverseEntryInPeriod = jest.fn();

    await service.reverseSourceEntries('payment', 'pay-123', 'system');

    expect(fiscalPeriodService.getCurrentPeriod).not.toHaveBeenCalled();
    expect(journalEntryService.reverseEntryInPeriod).not.toHaveBeenCalled();
  });
});
```

**Step 4: Run tests to verify they fail**

```bash
cd /home/blur/erp2/backend && npm run test -- --testPathPattern="accounting.service.spec" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `reverseSourceEntries is not a function`

**Step 5: Add `findBySource()` to JournalEntryService**

In `journal-entry.service.ts`, add this method (can go after `reverseEntryInPeriod`):

```typescript
async findBySource(sourceType: string, sourceId: string): Promise<JournalEntry[]> {
  return this.journalEntryRepository.find({
    where: { sourceType, sourceId },
    relations: ['lines'],
  });
}
```

**Step 6: Add `reverseSourceEntries()` to AccountingService**

In `accounting.service.ts`, add this method after `postExpenseEntry()`:

```typescript
async reverseSourceEntries(
  sourceType: string,
  sourceId: string,
  userId: string,
): Promise<void> {
  this.logger.log(`Reversing source entries: ${sourceType}/${sourceId}`);

  const entries = await this.journalEntryService.findBySource(sourceType, sourceId);

  if (entries.length === 0) {
    this.logger.warn(`No journal entries found for ${sourceType}/${sourceId} — nothing to reverse`);
    return;
  }

  // Get current open period — all reversals go here
  const currentPeriod = await this.fiscalPeriodService.getCurrentPeriod();
  if (!currentPeriod) {
    throw new BadRequestException(
      'No open fiscal period found. Please open a fiscal period before processing reversals.',
    );
  }

  for (const entry of entries) {
    // Skip non-posted or already-reversed entries
    if (entry.status !== 'POSTED' || entry.reversedById) {
      this.logger.warn(`Skipping entry ${entry.id} — status: ${entry.status}, reversedById: ${entry.reversedById}`);
      continue;
    }

    await this.journalEntryService.reverseEntryInPeriod(entry.id, currentPeriod.id, userId);
    this.logger.log(`Reversed entry ${entry.id} into period ${currentPeriod.id}`);
  }
}
```

**Step 7: Run tests to verify they pass**

```bash
cd /home/blur/erp2/backend && npm run test -- --testPathPattern="accounting.service.spec" --no-coverage 2>&1 | tail -20
```

Expected: All `reverseSourceEntries` tests PASS.

**Step 8: Commit**

```bash
cd /home/blur/erp2 && git add backend/src/modules/accounting/services/accounting.service.ts backend/src/modules/accounting/services/accounting.service.spec.ts backend/src/modules/accounting/services/journal-entry.service.ts && git commit -m "feat(accounting): add reverseSourceEntries and reverseEntryInPeriod helpers"
```

---

## Task 2: Add `reversePaymentEntry()` to AccountingService (different-method refund)

**Files:**
- Modify: `backend/src/modules/accounting/services/accounting.service.ts`
- Modify: `backend/src/modules/accounting/services/accounting.service.spec.ts`

**Context:** When refunding via a different payment method, we don't reverse A/R — instead we move cash between payment method accounts:
```
DR [Original Payment Method Account]   amount
CR [Refund Payment Method Account]     amount
```
The `accountMappingService.getMappings()` returns a map where `payment_cash`, `payment_bank`, etc. are keys. We need to look up both accounts by their payment method codes.

**Step 1: Write failing tests**

Add to `accounting.service.spec.ts`:

```typescript
describe('reversePaymentEntry', () => {
  const mockOpenPeriod = {
    id: 'period-open-123',
    status: FiscalPeriodStatus.OPEN,
    startDate: new Date('2026-02-01'),
    endDate: new Date('2026-02-28'),
  };

  it('should create a 2-line JE transferring between payment accounts', async () => {
    fiscalPeriodService.getCurrentPeriod = jest.fn().mockResolvedValue(mockOpenPeriod);
    accountMappingService.getMappings = jest.fn().mockResolvedValue({
      payment_cash: 'cash-account-id',
      payment_bank: 'bank-account-id',
      [MappingType.PAYMENT_AR]: 'ar-account-id',
    });
    journalEntryService.create = jest.fn().mockResolvedValue({ id: 'je-new' });
    journalEntryService.postEntry = jest.fn().mockResolvedValue({ id: 'je-new', status: 'POSTED' });

    await service.reversePaymentEntry(
      'original-pay-id',
      'CASH',
      'BANK',
      200,
      'system',
    );

    expect(journalEntryService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: expect.arrayContaining([
          expect.objectContaining({ accountId: 'cash-account-id', debitAmount: 200, creditAmount: 0 }),
          expect.objectContaining({ accountId: 'bank-account-id', debitAmount: 0, creditAmount: 200 }),
        ]),
      }),
      'system',
    );
  });

  it('should throw if no open fiscal period', async () => {
    fiscalPeriodService.getCurrentPeriod = jest.fn().mockResolvedValue(null);

    await expect(
      service.reversePaymentEntry('pay-id', 'CASH', 'BANK', 100, 'system'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should throw if original payment method account not mapped', async () => {
    fiscalPeriodService.getCurrentPeriod = jest.fn().mockResolvedValue(mockOpenPeriod);
    accountMappingService.getMappings = jest.fn().mockResolvedValue({
      payment_bank: 'bank-account-id',
    });

    await expect(
      service.reversePaymentEntry('pay-id', 'CASH', 'BANK', 100, 'system'),
    ).rejects.toThrow(BadRequestException);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd /home/blur/erp2/backend && npm run test -- --testPathPattern="accounting.service.spec" --no-coverage 2>&1 | tail -20
```

Expected: FAIL — `reversePaymentEntry is not a function`

**Step 3: Add `reversePaymentEntry()` to AccountingService**

```typescript
async reversePaymentEntry(
  originalPaymentId: string,
  originalMethodCode: string,
  refundMethodCode: string,
  amount: number,
  userId: string,
): Promise<void> {
  this.logger.log(
    `Reversing payment entry (diff method): ${originalMethodCode} -> ${refundMethodCode}, amount: ${amount}`,
  );

  const currentPeriod = await this.fiscalPeriodService.getCurrentPeriod();
  if (!currentPeriod) {
    throw new BadRequestException(
      'No open fiscal period found. Please open a fiscal period before processing refunds.',
    );
  }

  const mappings = await this.accountMappingService.getMappings();

  const originalKey = `payment_${originalMethodCode.toLowerCase()}`;
  const refundKey = `payment_${refundMethodCode.toLowerCase()}`;

  if (!mappings[originalKey]) {
    throw new BadRequestException(
      `No account mapped for payment method "${originalMethodCode}". Please configure account mappings.`,
    );
  }
  if (!mappings[refundKey]) {
    throw new BadRequestException(
      `No account mapped for refund payment method "${refundMethodCode}". Please configure account mappings.`,
    );
  }

  const lines: CreateJournalEntryLineDto[] = [
    {
      accountId: mappings[originalKey],
      debitAmount: amount,
      creditAmount: 0,
      memo: `Refund: clear original ${originalMethodCode} receipt`,
    },
    {
      accountId: mappings[refundKey],
      debitAmount: 0,
      creditAmount: amount,
      memo: `Refund: paid out via ${refundMethodCode}`,
    },
  ];

  const entryDto: CreateJournalEntryDto = {
    entryDate: new Date(),
    description: `Refund via ${refundMethodCode} for payment ${originalPaymentId}`,
    fiscalPeriodId: currentPeriod.id,
    sourceType: 'payment_refund',
    sourceId: originalPaymentId,
    lines,
  };

  const entry = await this.journalEntryService.create(entryDto, userId);
  await this.journalEntryService.postEntry(entry.id, userId);

  this.logger.log(`Refund transfer JE posted for payment ${originalPaymentId}`);
}
```

**Step 4: Run tests to verify they pass**

```bash
cd /home/blur/erp2/backend && npm run test -- --testPathPattern="accounting.service.spec" --no-coverage 2>&1 | tail -20
```

Expected: All `reversePaymentEntry` tests PASS.

**Step 5: Commit**

```bash
cd /home/blur/erp2 && git add backend/src/modules/accounting/services/accounting.service.ts backend/src/modules/accounting/services/accounting.service.spec.ts && git commit -m "feat(accounting): add reversePaymentEntry for different-method refunds"
```

---

## Task 3: Wire `unpayOrder()` to accounting reversal

**Files:**
- Modify: `backend/src/modules/sales/services/sales-order.service.ts` (lines 2216-2294)

**Context:** `unpayOrder()` soft-deletes payments but never reverses their JEs. We need to call `reverseSourceEntries('payment', paymentId, userId)` for each payment before soft-deleting it. The `accountingService` is already injected as `this.accountingService`. Wrap in try-catch so unpay still succeeds if accounting fails.

**Step 1: Write the failing test**

Find `sales-order.service.spec.ts` or create it. Add a test for `unpayOrder` accounting reversal:

```typescript
describe('unpayOrder', () => {
  it('should call reverseSourceEntries for each payment when unpaying', async () => {
    const mockOrder = { id: 'so-123', orderNumber: 'SO-000026', isFulfilled: false, paidAmount: 500 };
    const mockInvoice = { id: 'inv-123', salesOrderId: 'so-123', paidAmount: 500, calculateTotals: jest.fn(), updateStatus: jest.fn() };
    const mockPayments = [
      { id: 'pay-1', paymentNumber: 'PAY-001', amount: 300, status: 'COMPLETED' },
      { id: 'pay-2', paymentNumber: 'PAY-002', amount: 200, status: 'COMPLETED' },
    ];

    salesOrderRepository.findOne.mockResolvedValue(mockOrder);
    invoiceRepository.findOne.mockResolvedValue(mockInvoice);
    paymentRepository.find.mockResolvedValue(mockPayments);
    paymentRepository.softDelete.mockResolvedValue({});
    accountingService.reverseSourceEntries = jest.fn().mockResolvedValue(undefined);

    await service.unpayOrder('so-123');

    expect(accountingService.reverseSourceEntries).toHaveBeenCalledTimes(2);
    expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith('payment', 'pay-1', 'system');
    expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith('payment', 'pay-2', 'system');
  });

  it('should still succeed if accounting reversal fails', async () => {
    // ... setup as above but accountingService.reverseSourceEntries rejects
    accountingService.reverseSourceEntries = jest.fn().mockRejectedValue(new Error('No open period'));

    // Should not throw
    await expect(service.unpayOrder('so-123')).resolves.toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /home/blur/erp2/backend && npm run test -- --testPathPattern="sales-order.service.spec" --no-coverage 2>&1 | tail -20
```

Expected: FAIL

**Step 3: Modify `unpayOrder()` in sales-order.service.ts**

Inside the `for (const payment of associatedPayments)` loop, before the `auditLogService.log()` call, add the reversal:

```typescript
// Reverse accounting journal entry for this payment
try {
  await this.accountingService.reverseSourceEntries('payment', payment.id, 'system');
  this.logger.log(`Reversed accounting entries for payment ${payment.paymentNumber}`);
} catch (err) {
  this.logger.error(`Failed to reverse JE for payment ${payment.id}: ${err.message}`);
  // Continue — unpay proceeds even if accounting reversal fails
}
```

Place this BEFORE the `softDelete` call so the JE is reversed while the payment record still exists.

**Step 4: Run test to verify it passes**

```bash
cd /home/blur/erp2/backend && npm run test -- --testPathPattern="sales-order.service.spec" --no-coverage 2>&1 | tail -20
```

Expected: PASS

**Step 5: Commit**

```bash
cd /home/blur/erp2 && git add backend/src/modules/sales/services/sales-order.service.ts && git commit -m "feat(sales): reverse accounting JEs when unpaying order"
```

---

## Task 4: Wire `unfulfillOrder()` to accounting reversal

**Files:**
- Modify: `backend/src/modules/sales/services/sales-order.service.ts` (lines 2368-2427)

**Context:** `unfulfillOrder()` restores inventory but never reverses the sales order JE (COGS + Revenue + A/R). We call `reverseSourceEntries('sales_order', orderId, userId)` after inventory is restored, before saving the order.

**Step 1: Write the failing test**

```typescript
describe('unfulfillOrder', () => {
  it('should call reverseSourceEntries with sales_order sourceType when unfulfilling', async () => {
    const mockOrder = {
      id: 'so-123',
      orderNumber: 'SO-000026',
      isFulfilled: true,
      items: [{ productId: 'prod-1', quantity: 5, product: { id: 'prod-1' } }],
    };

    salesOrderRepository.findOne.mockResolvedValue(mockOrder);
    baseCostCalculator.restoreStock = jest.fn().mockResolvedValue(undefined);
    stockMovementService.deleteByReference = jest.fn().mockResolvedValue({ deletedCount: 1 });
    salesOrderRepository.save.mockResolvedValue({ ...mockOrder, isFulfilled: false });
    accountingService.reverseSourceEntries = jest.fn().mockResolvedValue(undefined);

    await service.unfulfillOrder('so-123');

    expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith(
      'sales_order',
      'so-123',
      'system',
    );
  });

  it('should still succeed if accounting reversal fails', async () => {
    accountingService.reverseSourceEntries = jest.fn().mockRejectedValue(new Error('No open period'));

    await expect(service.unfulfillOrder('so-123')).resolves.toBeDefined();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
cd /home/blur/erp2/backend && npm run test -- --testPathPattern="sales-order.service.spec" --no-coverage 2>&1 | tail -20
```

Expected: FAIL

**Step 3: Modify `unfulfillOrder()` in sales-order.service.ts**

After the `stockMovementService.deleteByReference()` call and before `order.isFulfilled = false`, add:

```typescript
// Reverse accounting journal entry for this fulfillment
try {
  await this.accountingService.reverseSourceEntries('sales_order', id, 'system');
  this.logger.log(`Reversed accounting entries for sales order ${order.orderNumber}`);
} catch (err) {
  this.logger.error(`Failed to reverse JE for order ${id}: ${err.message}`);
  // Continue — unfulfill proceeds even if accounting reversal fails
}
```

**Step 4: Run test to verify it passes**

```bash
cd /home/blur/erp2/backend && npm run test -- --testPathPattern="sales-order.service.spec" --no-coverage 2>&1 | tail -20
```

Expected: PASS

**Step 5: Commit**

```bash
cd /home/blur/erp2 && git add backend/src/modules/sales/services/sales-order.service.ts && git commit -m "feat(sales): reverse accounting JEs when unfulfilling order"
```

---

## Task 5: Extend RefundPaymentDto and wire payment.refund() to accounting

**Files:**
- Modify: `backend/src/modules/sales/dto/payment.dto.ts` (lines 370-394)
- Modify: `backend/src/modules/sales/services/payment.service.ts` (lines 403-455)

**Context:** The `refund()` method creates a negative payment but doesn't call accounting. We need to:
1. Add `refundPaymentMethodId?: string` to `RefundPaymentDto`
2. After creating the refund record, if same method → `reverseSourceEntries`, if different → `reversePaymentEntry`
3. The refund payment record should use `refundPaymentMethodId` if provided

**Step 1: Update `RefundPaymentDto` in payment.dto.ts**

Add after the existing `reason` field:

```typescript
@ApiPropertyOptional({
  description: 'Payment method ID for the refund. Defaults to original payment method if not provided.',
  example: 'uuid-string',
})
@IsOptional()
@IsUUID()
refundPaymentMethodId?: string;
```

**Step 2: Write failing test for payment.service refund**

In `payment.service.spec.ts`, add:

```typescript
describe('refund', () => {
  const mockOriginalPayment = {
    id: 'pay-123',
    paymentNumber: 'PAY-001',
    amount: 500,
    status: PaymentStatus.COMPLETED,
    customerId: 'cust-123',
    invoiceId: 'inv-123',
    paymentMethodId: 'pm-cash',
    paymentMethodEntity: { id: 'pm-cash', code: 'CASH' },
    invoice: { id: 'inv-123', addPayment: jest.fn(), paidAmount: 500 },
    customer: { id: 'cust-123', name: 'Test Customer' },
    settlementStatus: 'NOT_APPLICABLE',
  };

  it('should call reverseSourceEntries when refund method is same as original', async () => {
    paymentRepository.findOne.mockResolvedValue(mockOriginalPayment);
    paymentRepository.save.mockResolvedValue({ id: 'refund-pay-123', amount: -200 });
    accountingService.reverseSourceEntries = jest.fn().mockResolvedValue(undefined);
    accountingService.reversePaymentEntry = jest.fn();

    await service.refund({ paymentId: 'pay-123', amount: 200 });

    expect(accountingService.reverseSourceEntries).toHaveBeenCalledWith('payment', 'pay-123', 'system');
    expect(accountingService.reversePaymentEntry).not.toHaveBeenCalled();
  });

  it('should call reversePaymentEntry when refund method differs from original', async () => {
    paymentRepository.findOne.mockResolvedValue(mockOriginalPayment);
    paymentMethodRepository.findOne = jest.fn().mockResolvedValue({ id: 'pm-bank', code: 'BANK' });
    paymentRepository.save.mockResolvedValue({ id: 'refund-pay-123', amount: -200 });
    accountingService.reverseSourceEntries = jest.fn();
    accountingService.reversePaymentEntry = jest.fn().mockResolvedValue(undefined);

    await service.refund({ paymentId: 'pay-123', amount: 200, refundPaymentMethodId: 'pm-bank' });

    expect(accountingService.reversePaymentEntry).toHaveBeenCalledWith(
      'pay-123',
      'CASH',
      'BANK',
      200,
      'system',
    );
    expect(accountingService.reverseSourceEntries).not.toHaveBeenCalled();
  });

  it('should use refundPaymentMethodId for the new payment record when different method', async () => {
    paymentRepository.findOne.mockResolvedValue(mockOriginalPayment);
    paymentMethodRepository.findOne = jest.fn().mockResolvedValue({ id: 'pm-bank', code: 'BANK' });
    const saveSpy = paymentRepository.save.mockResolvedValue({ id: 'refund-pay-123' });
    accountingService.reversePaymentEntry = jest.fn().mockResolvedValue(undefined);

    await service.refund({ paymentId: 'pay-123', amount: 200, refundPaymentMethodId: 'pm-bank' });

    expect(saveSpy).toHaveBeenCalledWith(
      expect.objectContaining({ paymentMethodId: 'pm-bank' }),
    );
  });
});
```

**Step 3: Run test to verify it fails**

```bash
cd /home/blur/erp2/backend && npm run test -- --testPathPattern="payment.service.spec" --no-coverage 2>&1 | tail -20
```

Expected: FAIL

**Step 4: Update `refund()` in payment.service.ts**

Replace the existing `refund()` method (lines 403-455) with:

```typescript
async refund(refundDto: {
  paymentId: string;
  amount: number;
  reason?: string;
  refundPaymentMethodId?: string;
}): Promise<PaymentResponseDto> {
  const originalPayment = await this.findPaymentWithRelations(refundDto.paymentId);

  if (originalPayment.status !== PaymentStatus.COMPLETED) {
    throw new BadRequestException('Can only refund completed payments');
  }

  if (refundDto.amount > Number(originalPayment.amount)) {
    throw new BadRequestException('Refund amount cannot exceed original payment amount');
  }

  // Resolve refund payment method (default to original)
  let refundPaymentMethodId = originalPayment.paymentMethodId;
  let refundMethodCode = originalPayment.paymentMethodEntity?.code || 'CASH';

  if (refundDto.refundPaymentMethodId && refundDto.refundPaymentMethodId !== originalPayment.paymentMethodId) {
    const refundMethod = await this.paymentMethodRepository.findOne({
      where: { id: refundDto.refundPaymentMethodId },
    });
    if (!refundMethod) {
      throw new BadRequestException('Refund payment method not found');
    }
    refundPaymentMethodId = refundMethod.id;
    refundMethodCode = refundMethod.code;
  }

  // Create a refund payment record (negative amount)
  const refundPayment = this.paymentRepository.create({
    customerId: originalPayment.customerId,
    invoiceId: originalPayment.invoiceId,
    paymentDate: new Date(),
    amount: -refundDto.amount,
    status: PaymentStatus.REFUNDED,
    paymentMethodId: refundPaymentMethodId,
    settlementStatus: originalPayment.settlementStatus,
    notes: refundDto.reason ? `Refund: ${refundDto.reason}` : `Refund of ${originalPayment.paymentNumber}`,
  });

  const savedRefund = await this.paymentRepository.save(refundPayment);

  // Update original payment status
  originalPayment.status = PaymentStatus.REFUNDED;
  await this.paymentRepository.save(originalPayment);

  // Update invoice paid amount
  if (originalPayment.invoice) {
    originalPayment.invoice.addPayment(-refundDto.amount);
    await this.invoiceRepository.save(originalPayment.invoice);
  }

  // Post accounting reversal
  const isSameMethod = refundPaymentMethodId === originalPayment.paymentMethodId;
  try {
    if (isSameMethod) {
      await this.accountingService.reverseSourceEntries('payment', originalPayment.id, 'system');
    } else {
      await this.accountingService.reversePaymentEntry(
        originalPayment.id,
        originalPayment.paymentMethodEntity?.code || 'CASH',
        refundMethodCode,
        refundDto.amount,
        'system',
      );
    }
  } catch (err) {
    this.logger.error(`Failed to post refund accounting entry for payment ${originalPayment.id}: ${err.message}`);
    // Refund still succeeds — accounting inconsistency logged
  }

  await this.auditLogService.log(
    'CREATE',
    'Payment',
    `Created refund for payment ${originalPayment.paymentNumber}`,
    {
      entityId: savedRefund.id,
      userId: 'system',
      newValues: {
        amount: savedRefund.amount,
        status: savedRefund.status,
        originalPaymentId: originalPayment.id,
        refundMethodCode,
      },
    },
  );

  return this.mapToResponseDto(await this.findPaymentWithRelations(savedRefund.id));
}
```

**Step 5: Run test to verify it passes**

```bash
cd /home/blur/erp2/backend && npm run test -- --testPathPattern="payment.service.spec" --no-coverage 2>&1 | tail -20
```

Expected: PASS

**Step 6: Commit**

```bash
cd /home/blur/erp2 && git add backend/src/modules/sales/dto/payment.dto.ts backend/src/modules/sales/services/payment.service.ts && git commit -m "feat(payments): wire refund to accounting, support different refund methods"
```

---

## Task 6: Run all backend tests

**Step 1: Run full backend test suite**

```bash
cd /home/blur/erp2/backend && npm run test --no-coverage 2>&1 | tail -30
```

Expected: All tests pass. Fix any regressions before continuing.

**Step 2: Commit if any minor fixes were needed**

```bash
cd /home/blur/erp2 && git add -p && git commit -m "fix(accounting): resolve test regressions after reversal changes"
```

---

## Task 7: Add Refund dialog to Order Detail page (Frontend)

**Files:**
- Modify: `frontend/src/pages/sales/OrdersPage.tsx`
- Modify: `frontend/src/services/salesApi.ts`

**Context:** The orders page shows order details including a payments section. Each payment with `status === 'COMPLETED'` needs a Refund button. Clicking it opens a dialog with: amount (editable), refund payment method (dropdown, defaults to original), and reason. On submit, calls `POST /payments/refund`.

Payment methods are fetched via `paymentMethodsApi.getActive()` (already used in `PaymentDialog.tsx`).

**Step 1: Add refund API call to salesApi.ts**

Find the existing `salesApi.ts` and add:

```typescript
refundPayment: (data: {
  paymentId: string;
  amount: number;
  reason?: string;
  refundPaymentMethodId?: string;
}) => apiService.post('/payments/refund', data),
```

**Step 2: Create RefundDialog component**

Create `frontend/src/components/sales/RefundDialog.tsx`:

```tsx
import React, { useEffect, useState } from 'react'
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, TextField, MenuItem, Typography, Box, CircularProgress,
} from '@mui/material'
import paymentMethodsApi from '../../services/paymentMethodsApi'

interface Payment {
  id: string
  paymentNumber: string
  amount: number
  paymentMethodId: string
  paymentMethodEntity?: { id: string; code: string; name: string }
}

interface RefundDialogProps {
  open: boolean
  payment: Payment | null
  onClose: () => void
  onSuccess: () => void
}

export default function RefundDialog({ open, payment, onClose, onSuccess }: RefundDialogProps) {
  const [amount, setAmount] = useState('')
  const [refundMethodId, setRefundMethodId] = useState('')
  const [reason, setReason] = useState('')
  const [paymentMethods, setPaymentMethods] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !payment) return
    setAmount(String(Math.abs(payment.amount)))
    setRefundMethodId(payment.paymentMethodId)
    setReason('')
    setError(null)
    paymentMethodsApi.getActive().then((methods: any) => {
      const list = Array.isArray(methods) ? methods : (methods as any)?.data || []
      setPaymentMethods(list)
    }).catch(() => setPaymentMethods([]))
  }, [open, payment])

  const handleSubmit = async () => {
    if (!payment) return
    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount')
      return
    }
    if (numAmount > Math.abs(payment.amount)) {
      setError(`Amount cannot exceed original payment of ${Math.abs(payment.amount)}`)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { salesApi } = await import('../../services/salesApi')
      await salesApi.refundPayment({
        paymentId: payment.id,
        amount: numAmount,
        reason: reason || undefined,
        refundPaymentMethodId: refundMethodId !== payment.paymentMethodId ? refundMethodId : undefined,
      })
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Refund failed. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  if (!payment) return null

  const originalMethodName = payment.paymentMethodEntity?.name || 'Original method'

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Refund Payment {payment.paymentNumber}</DialogTitle>
      <DialogContent>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Original payment: {originalMethodName} — ${Math.abs(payment.amount).toFixed(2)}
          </Typography>
          <TextField
            label="Refund Amount"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputProps={{ min: 0.01, max: Math.abs(payment.amount), step: 0.01 }}
            fullWidth
          />
          <TextField
            select
            label="Refund Method"
            value={refundMethodId}
            onChange={(e) => setRefundMethodId(e.target.value)}
            fullWidth
          >
            {paymentMethods.map((m) => (
              <MenuItem key={m.id} value={m.id}>
                {m.name}{m.id === payment.paymentMethodId ? ' (same as original)' : ''}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            label="Reason (optional)"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            multiline
            rows={2}
            fullWidth
          />
          {error && (
            <Typography color="error" variant="body2">{error}</Typography>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>Cancel</Button>
        <Button
          onClick={handleSubmit}
          variant="contained"
          color="warning"
          disabled={submitting}
          startIcon={submitting ? <CircularProgress size={16} /> : null}
        >
          Process Refund
        </Button>
      </DialogActions>
    </Dialog>
  )
}
```

**Step 3: Add Refund button and dialog to OrdersPage.tsx**

In `OrdersPage.tsx`, find where payments are rendered for a selected order (search for `paymentNumber` or the payments table). Add:

1. Import `RefundDialog`:
```tsx
import RefundDialog from '../../components/sales/RefundDialog'
```

2. Add state:
```tsx
const [refundDialogOpen, setRefundDialogOpen] = useState(false)
const [refundTarget, setRefundTarget] = useState<any>(null)
```

3. Add Refund button to each payment row (only for `COMPLETED` payments):
```tsx
{payment.status === 'COMPLETED' && (
  <Button
    size="small"
    variant="outlined"
    color="warning"
    onClick={() => { setRefundTarget(payment); setRefundDialogOpen(true) }}
  >
    Refund
  </Button>
)}
```

4. Add `RefundDialog` near the end of the JSX:
```tsx
<RefundDialog
  open={refundDialogOpen}
  payment={refundTarget}
  onClose={() => { setRefundDialogOpen(false); setRefundTarget(null) }}
  onSuccess={() => {
    dispatch(fetchOrders({ page: 1, limit: 20 }))
    dispatch(fetchPayments({ page: 1, limit: 20 }))
  }}
/>
```

**Step 4: Rebuild frontend and verify in browser**

```bash
cd /home/blur/erp2 && docker compose build frontend && docker compose up -d frontend
```

Open http://localhost:3000/sales, find SO-000026, open it, verify:
- COMPLETED payment rows show a "Refund" button
- Clicking opens the dialog with correct default amount and method
- Changing refund method to a different one works
- Submitting creates a refund record (check the payments list refreshes)

**Step 5: Commit**

```bash
cd /home/blur/erp2 && git add frontend/src/components/sales/RefundDialog.tsx frontend/src/pages/sales/OrdersPage.tsx frontend/src/services/salesApi.ts && git commit -m "feat(frontend): add refund dialog to order detail payments table"
```

---

## Task 8: Manual end-to-end verification

**Step 1: Verify unpay reversal**

1. Open http://localhost:3000/sales, find a PAID order
2. Note the order's journal entries at http://localhost:3000/accounting/journal-entries (filter by reference or date)
3. Unpay the order
4. Check journal entries — a new REV- entry should appear for the payment's JE
5. Confirm: original JE status = REVERSED, new JE has swapped debits/credits

**Step 2: Verify unfulfill reversal**

1. Find a FULFILLED order
2. Note its sales_order JE (COGS + Revenue entries)
3. Unfulfill the order
4. Check journal entries — a new REV- entry should appear reversing COGS/Revenue
5. Confirm inventory was restored AND accounting was reversed

**Step 3: Verify refund (same method)**

1. Find a PAID order with `status: COMPLETED` payment
2. Click Refund, enter partial amount, keep same method
3. Confirm: new negative payment record appears, invoice paidAmount reduced, new REV- JE in accounting

**Step 4: Verify refund (different method)**

1. Find a PAID order with a Cash payment
2. Click Refund, change method to Bank Transfer
3. Confirm: new negative payment record with Bank Transfer method, JE shows DR Cash / CR Bank Transfer

**Step 5: Verify error case**

1. Close the current fiscal period via http://localhost:3000/accounting/fiscal-periods
2. Try to unfulfill an order
3. Confirm: order unfulfills successfully, error logged in backend (`docker compose logs backend --tail=20`), no crash

---

## Task 9: Final check — run all tests

```bash
cd /home/blur/erp2/backend && npm run test --no-coverage 2>&1 | tail -30
cd /home/blur/erp2/frontend && npm run type-check 2>&1 | tail -20
```

All backend tests pass. No TypeScript errors in frontend.

If anything fails, fix before proceeding.

**Final commit if needed:**

```bash
cd /home/blur/erp2 && git add -p && git commit -m "fix: resolve final issues after refund/reversal implementation"
```
