# Payment Upsert Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add upsert logic to `recordPayments()` so that paying a previously-unpaid sales order restores and updates soft-deleted payment records instead of always creating new ones.

**Architecture:** Single method change in `SalesOrderService.recordPayments()`. Before creating each payment line, fetch soft-deleted payments for the invoice ordered by `paymentDate DESC` and pair them positionally with incoming lines. Restore + update matched records; create fresh records only for unmatched lines.

**Tech Stack:** NestJS 11, TypeORM, PostgreSQL, Jest (backend unit tests)

---

### Task 1: Write the failing test

**Files:**
- Test: `backend/src/modules/sales/services/sales-order.service.spec.ts` (find existing spec or create if absent)

First, locate the existing test file:

```bash
find /home/blur/erp2/backend/src/modules/sales -name "*.spec.ts" | head -20
```

Find the `recordPayments` test block (search for `recordPayments` in spec files). If no spec file exists for `sales-order.service.ts`, create one at `backend/src/modules/sales/services/sales-order.service.spec.ts`.

**Step 1: Write the failing test**

Add this test to the `recordPayments` describe block (or create a new describe block):

```typescript
describe('recordPayments - upsert on re-pay', () => {
  it('should restore soft-deleted payment instead of creating a new one', async () => {
    // Arrange: order with invoice, one soft-deleted payment
    const invoiceId = 'invoice-uuid-1';
    const softDeletedPaymentId = 'payment-uuid-1';
    const existingPaymentNumber = 'PAY-000001';

    const mockOrder = {
      id: 'order-uuid-1',
      orderNumber: 'SO-000001',
      customerId: 'customer-uuid-1',
      paidAmount: 0,
      isFulfilled: false,
    };
    const mockInvoice = { id: invoiceId, salesOrderId: mockOrder.id, paidAmount: 0, calculateTotals: jest.fn(), updateStatus: jest.fn() };
    const mockPaymentMethod = { id: 'pm-uuid-1', requiresSettlement: false, isActive: true };
    const softDeletedPayment = {
      id: softDeletedPaymentId,
      paymentNumber: existingPaymentNumber,
      deletedAt: new Date('2026-01-01'),
      amount: 100,
      paymentMethodId: 'pm-uuid-old',
      settlementStatus: 'NOT_APPLICABLE',
    };

    // Mock repositories
    salesOrderRepo.findOne.mockResolvedValue(mockOrder);
    invoiceRepo.findOne.mockResolvedValue(mockInvoice);
    paymentMethodRepo.findOne.mockResolvedValue(mockPaymentMethod);
    // Return soft-deleted payment when queried with withDeleted: true
    paymentRepo.find.mockResolvedValue([softDeletedPayment]);
    paymentRepo.restore.mockResolvedValue(undefined);
    paymentRepo.findOne.mockResolvedValue({ ...softDeletedPayment, deletedAt: null, isActive: true });
    paymentRepo.save.mockResolvedValue({ ...softDeletedPayment, amount: 150 });
    orderRepo.update.mockResolvedValue(undefined);

    // Act
    await service.recordPayments('order-uuid-1', [{ paymentMethodId: 'pm-uuid-1', amount: 150 }]);

    // Assert: restore was called, NOT create
    expect(paymentRepo.restore).toHaveBeenCalledWith(softDeletedPaymentId);
    expect(paymentRepo.create).not.toHaveBeenCalled();
  });

  it('should create a new payment when no soft-deleted payments exist', async () => {
    // Arrange: no soft-deleted payments
    paymentRepo.find.mockResolvedValue([]); // no soft-deleted
    // ... (same order/invoice/method mocks as above)
    paymentRepo.create.mockReturnValue({ id: 'new-payment', paymentNumber: 'PAY-000002' });
    paymentRepo.save.mockResolvedValue({ id: 'new-payment', paymentNumber: 'PAY-000002' });

    await service.recordPayments('order-uuid-1', [{ paymentMethodId: 'pm-uuid-1', amount: 150 }]);

    expect(paymentRepo.create).toHaveBeenCalled();
    expect(paymentRepo.restore).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run test to confirm it fails**

```bash
cd /home/blur/erp2/backend
npm run test -- --testPathPattern="sales-order.service" --verbose 2>&1 | tail -30
```

Expected: Tests fail — `restore` is never called in the current implementation.

**Step 3: Commit the failing test**

```bash
cd /home/blur/erp2/backend
git add src/modules/sales/services/sales-order.service.spec.ts
git commit -m "test: add failing tests for recordPayments upsert behavior"
```

---

### Task 2: Implement upsert logic in `recordPayments`

**Files:**
- Modify: `backend/src/modules/sales/services/sales-order.service.ts` — `recordPayments()` method (~lines 2097–2214)

**Step 1: Read the current method**

Read lines 2097–2214 of `sales-order.service.ts` to confirm current structure before editing.

**Step 2: Add soft-deleted payment fetch before the payment loop**

Inside the transaction, after `const invoice = await invoiceRepo.findOne(...)` and before the `for (const line of payments)` loop, add:

```typescript
// Fetch soft-deleted payments for this invoice to enable upsert
const softDeletedPayments = invoice
  ? await paymentRepo.find({
      where: { invoiceId: invoice.id },
      withDeleted: true,
      order: { paymentDate: 'DESC' },
    }).then(records => records.filter(r => r.deletedAt !== null))
  : [];
```

**Step 3: Replace the loop body with upsert logic**

Change the `for (const line of payments)` loop body. Currently it always calls `paymentRepo.create()`. Replace with:

```typescript
for (let i = 0; i < payments.length; i++) {
  const line = payments[i];
  const method = await paymentMethodRepo.findOne({ where: { id: line.paymentMethodId, isActive: true } });
  if (!method) {
    throw new BadRequestException(`Payment method ${line.paymentMethodId} not found or inactive`);
  }

  const settlementStatus = method.requiresSettlement
    ? SettlementStatusEnum.PENDING
    : SettlementStatusEnum.NOT_APPLICABLE;

  const notes = line.reference
    ? `${line.reference} - Payment for ${order.orderNumber}${invoice ? ` (${invoice.invoiceNumber})` : ''}`
    : `Payment for ${order.orderNumber}${invoice ? ` (${invoice.invoiceNumber})` : ''}`;

  const existingDeleted = softDeletedPayments[i]; // positional match

  let savedPayment: any;

  if (existingDeleted) {
    // Restore soft-deleted payment and update fields
    await paymentRepo.restore(existingDeleted.id);
    const restored = await paymentRepo.findOne({ where: { id: existingDeleted.id } });
    restored.isActive = true;
    restored.amount = Number(line.amount);
    restored.paymentMethodId = method.id;
    restored.settlementStatus = settlementStatus;
    restored.paymentDate = new Date();
    restored.notes = notes;
    savedPayment = await paymentRepo.save(restored);

    await auditLogService.log('UPDATE', 'Payment', `Restored and updated payment: ${savedPayment.paymentNumber} for ${order.orderNumber}`, {
      entityId: savedPayment.id,
      userId: 'system',
      newValues: { paymentNumber: savedPayment.paymentNumber, amount: savedPayment.amount, paymentMethodId: method.id },
    });
  } else {
    // No soft-deleted payment to reuse — generate number and create fresh
    let paymentNumber: string;
    try {
      paymentNumber = await this.settingsService.generateDocumentNumber('Payments');
    } catch {
      const allPayments = await paymentRepo.find({ select: ['paymentNumber'], withDeleted: true });
      let maxNum = 0;
      for (const p of allPayments) {
        const match = p.paymentNumber.match(/^PAY-(\d+)$/);
        if (match) maxNum = Math.max(maxNum, parseInt(match[1]));
      }
      paymentNumber = `PAY-${(maxNum + 1).toString().padStart(6, '0')}`;
    }

    const payment = paymentRepo.create({
      paymentNumber,
      status: PaymentStatus.COMPLETED,
      paymentMethodId: method.id,
      settlementStatus,
      paymentDate: new Date(),
      amount: Number(line.amount),
      customerId: order.customerId,
      invoiceId: invoice ? invoice.id : null,
      notes,
    });
    savedPayment = await paymentRepo.save(payment);

    await auditLogService.log('CREATE', 'Payment', `Created payment: ${paymentNumber} for ${order.orderNumber}`, {
      entityId: savedPayment.id,
      userId: 'system',
      newValues: { paymentNumber, amount: line.amount, paymentMethodId: method.id },
    });
  }

  // Post to accounting (don't fail transaction on accounting errors)
  try {
    const fullPayment = await paymentRepo.findOne({
      where: { id: savedPayment.id },
      relations: ['customer', 'paymentMethodEntity'],
    });
    if (fullPayment) {
      await this.accountingService.postCustomerPaymentEntry(fullPayment, 'system');
    }
  } catch (error) {
    this.logger.error(`Failed to post accounting entry for payment ${savedPayment.paymentNumber}: ${error.message}`);
  }
}
```

Note: `auditLogService` inside the transaction uses `this.auditLogService` — verify the variable name matches the service injection name in scope.

**Step 4: Run the tests**

```bash
cd /home/blur/erp2/backend
npm run test -- --testPathPattern="sales-order.service" --verbose 2>&1 | tail -30
```

Expected: Both new tests pass.

**Step 5: Run all backend tests to check for regressions**

```bash
cd /home/blur/erp2/backend
npm run test 2>&1 | tail -20
```

Expected: All tests pass (or same count as before).

**Step 6: Commit**

```bash
cd /home/blur/erp2/backend
git add src/modules/sales/services/sales-order.service.ts
git commit -m "fix: upsert soft-deleted payments in recordPayments to avoid duplicate records on re-pay"
```

---

### Task 3: Manual verification

**Step 1: Start the backend**

```bash
cd /home/blur/erp2
docker compose up -d
# Or if running locally:
cd backend && npm run start:dev
```

**Step 2: Check logs during test scenario**

```bash
docker compose logs backend -f 2>&1 | grep -E "recordPayments|Restored|payment"
```

**Step 3: Test scenario in the UI**

1. Open http://localhost:3000/sales
2. Find or create a sales order
3. Click **Pay** — submit a payment → note the payment number (e.g. `PAY-000010`)
4. Click **Unpay** — confirm payment is cleared
5. Click **Pay** again with **a different payment method** → submit
6. Verify in the success message / payment list that the same `PAY-000010` is reused (not a new `PAY-000011`)

**Step 4: Verify in database (optional)**

```bash
docker compose exec postgres psql -U erp_user -d erp_db -c \
  "SELECT payment_number, deleted_at, payment_method_id, amount FROM payments ORDER BY created_at DESC LIMIT 10;"
```

Expected: No accumulation of soft-deleted duplicate records for the same invoice.

**Step 5: Commit if any follow-up fixes were made**

```bash
git add -p
git commit -m "fix: <description of any follow-up fix>"
```
