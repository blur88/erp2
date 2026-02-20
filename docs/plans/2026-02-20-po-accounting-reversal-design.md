# Design: Purchase Order Accounting Reversals & Vendor Payment Soft-Delete

**Date:** 2026-02-20
**Status:** Approved

---

## Problem

Purchase orders are missing journal entry reversals in two operations that sales orders handle correctly:

| Operation | Sales Order | Purchase Order |
|-----------|------------|----------------|
| Return goods / unfulfill | ✅ `reverseSourceEntries('sales_order', ...)` | ❌ Missing GRN reversal |
| Unpay | ✅ Soft-delete + `reverseSourceEntries('payment', ...)` | ❌ Hard-delete, no reversal |
| Pay again after unpay | ✅ Creates fresh payment via dialog | ❌ Also creates fresh (previous VP lost) |

---

## Design

### Change 1: `returnGoods()` — Reverse GRN Journal Entry

**File:** `backend/src/modules/purchasing/services/purchase-order.service.ts`

After the stock movement deletion block in `returnGoods()`, add a non-fatal accounting reversal:

```typescript
try {
  await this.accountingService.reverseSourceEntries('goods_received_note', grn.id, 'system');
  this.logger.log(`Reversed GRN accounting entry for PO ${purchaseOrder.orderNumber}`);
} catch (error) {
  this.logger.error(`Failed to reverse GRN accounting entry: ${error.message}`);
  // Non-fatal - return still succeeds (same pattern as stock movement deletion)
}
```

The GRN accounting entry (DR Inventory Asset / CR Accounts Payable) was posted with `sourceType = 'goods_received_note'` and `sourceId = grn.id`, so `reverseSourceEntries` will find and reverse it correctly.

---

### Change 2: `markAsUnpaid()` — Soft-Delete + Reverse JE

**File:** `backend/src/modules/purchasing/services/purchase-order.service.ts`
**File:** `backend/src/modules/purchasing/services/vendor-payment.service.ts`

Replace the hard-delete loop in `markAsUnpaid()` with:

1. For each existing vendor payment:
   - Call `reverseSourceEntries('vendor_payment', payment.id, 'system')` (non-fatal try/catch)
   - Soft-delete: `set isActive = false` + `softDelete(id)` via new `softDeleteForUnpay()` method
2. Reset `purchaseOrder.paidAmount = 0`

**New method on VendorPaymentService:**

```typescript
async softDeleteForUnpay(id: string): Promise<void> {
  const payment = await this.vendorPaymentRepository.findOne({ where: { id } });
  payment.isActive = false;
  await this.vendorPaymentRepository.save(payment);
  await this.vendorPaymentRepository.softDelete(id);
}
```

**Updated `markAsUnpaid()` loop:**

```typescript
for (const payment of existingPayments) {
  try {
    await this.accountingService.reverseSourceEntries('vendor_payment', payment.id, 'system');
  } catch (error) {
    this.logger.error(`Failed to reverse accounting for vendor payment ${payment.id}: ${error.message}`);
  }
  await this.vendorPaymentService.softDeleteForUnpay(payment.id);
}
```

---

### Change 3: `recordOrderPayments()` — Restore Previous VP on Re-Pay

**File:** `backend/src/modules/purchasing/services/purchase-order.service.ts`

When a user clicks Pay after having previously unpaid a PO, the soft-deleted vendor payment record is restored (same payment number preserved) and its payment method updated to the newly selected one.

**Logic at the start of `recordOrderPayments()`:**

```typescript
// Check for a previously soft-deleted payment for this PO
const previousPayment = await this.vendorPaymentRepository.findOne({
  where: { purchaseOrderId: id },
  withDeleted: true,
  order: { deletedAt: 'DESC' },
});

if (previousPayment?.deletedAt) {
  // Restore the first payment line from the previous payment
  const firstLine = payments[0];
  await this.vendorPaymentRepository.restore(previousPayment.id);
  previousPayment.isActive = true;
  previousPayment.paymentMethodId = firstLine.paymentMethodId;
  previousPayment.amount = firstLine.amount;
  previousPayment.notes = firstLine.reference || previousPayment.notes;
  previousPayment.paymentDate = new Date();
  await this.vendorPaymentRepository.save(previousPayment);

  // Re-post accounting entry
  const fullPayment = await this.vendorPaymentService.findOne(previousPayment.id);
  await this.accountingService.postVendorPaymentEntry(fullPayment, 'system');

  // Handle any additional payment lines (create new VPs for them)
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

  // Update paidAmount
  purchaseOrder.paidAmount = totalNewPayment;
  await this.purchaseOrderRepository.save(purchaseOrder);
  return this.findOne(id);
}
// else: fall through to existing create flow
```

---

## Data Flow

### Return Goods
```
returnGoods(poId)
  → reverseBaseCostsForGrn(grn)          [existing]
  → reset GRN items quantities to 0      [existing]
  → set GRN status = DRAFT               [existing]
  → deleteByReference('purchase_order')  [existing]
  → reset PO item receivedQuantity       [existing]
  → reverseSourceEntries('goods_received_note', grn.id)  ← NEW
```

### Mark as Unpaid
```
markAsUnpaid(poId)
  → for each vendorPayment:
      → reverseSourceEntries('vendor_payment', payment.id)  ← NEW
      → softDeleteForUnpay(payment.id)                      ← NEW (was permanentDelete)
  → purchaseOrder.paidAmount = 0         [existing]
```

### Record Payments (Pay / Re-Pay)
```
recordOrderPayments(poId, payments)
  → find soft-deleted previous VP?       ← NEW check
    → YES: restore VP, update paymentMethod, re-post JE
           create new VPs for extra lines
    → NO:  existing create flow (unchanged)
  → update paidAmount
```

---

## No Frontend Changes Required

The purchase orders page already uses `VendorPaymentDialog` → `recordOrderPayments`. The restore logic is transparent to the UI. Users will see the same payment number preserved after re-paying.

---

## Affected Files

| File | Change |
|------|--------|
| `backend/src/modules/purchasing/services/purchase-order.service.ts` | `returnGoods()`, `markAsUnpaid()`, `recordOrderPayments()` |
| `backend/src/modules/purchasing/services/vendor-payment.service.ts` | Add `softDeleteForUnpay()` method |

---

## Testing

- Return goods on a received PO → GRN journal entry should be reversed (status = REVERSED in journal entries)
- Mark PO as unpaid → vendor payment JE reversed, VP record soft-deleted (not hard-deleted)
- Re-pay a previously unpaid PO → same payment number restored, payment method updated, new JE posted
- Multi-line re-pay: first line restores old VP, additional lines create new VPs
