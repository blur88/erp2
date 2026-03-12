# Design: Fix PO Permanent Delete — VendorPayment FK Constraint (Issue #78)

## Problem

Permanently deleting a purchase order fails with a foreign key constraint error when the PO has associated `VendorPayment` records — even soft-deleted ones. The `vendor_payments.purchaseOrderId` column has no `onDelete` strategy, so the DB defaults to `RESTRICT`, blocking the hard delete of the parent PO.

**Reproduction path:**
1. Create PO → mark paid (creates VendorPayment) → mark unpaid (soft-deletes VendorPayment) → soft-delete PO → permanent delete PO → FK error.

**Root cause:** `PurchaseOrderService.permanentDelete` cascades to StockMovements and GRN but not to VendorPayments.

## Approach

Service-level cascade — consistent with how `SalesOrderLifecycleService.permanentDelete` handles invoices and payments.

No DB migration required. No entity changes.

## Changes

### 1. `PurchaseOrderService.permanentDelete` (`purchase-order.service.ts`)

After GRN deletion, before the PO audit log + remove, add:

```
// Find all VendorPayments for this PO (including soft-deleted)
const vendorPayments = await this.vendorPaymentRepository.find({
  where: { purchaseOrderId: id },
  withDeleted: true,
});

// Audit-log and hard-delete each payment
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
}
```

Cascade order after this fix:
1. Stock movements (existing, non-blocking)
2. GRN (existing)
3. VendorPayments **(new)**
4. PO audit log + `purchaseOrderRepository.remove(purchaseOrder)` (existing)

### 2. JSDoc fix in `markAsUnpaid`

The JSDoc currently says "hard deleting" the VendorPayment — change to "soft-deleting" to match what `softDeleteForUnpay` actually does.

### 3. Tests (`purchase-order.service.spec.ts`)

Add `describe('permanentDelete')` block covering:
- VendorPayments are queried with `withDeleted: true`
- Each payment gets a `PERMANENT_DELETE` audit log entry
- `vendorPaymentRepository.remove` is called with the payments array
- No error when there are zero VendorPayments
- PO is still hard-deleted after payments are removed

## Out of Scope

- `onDelete: 'CASCADE'` on the entity — not needed; service-level cascade is preferred for audit trail consistency
- Changes to the soft-delete flow — it is unaffected and working correctly
- Changes to `VendorPaymentService.permanentDelete` — it is not called here; we use the repository directly to avoid a double service indirection
