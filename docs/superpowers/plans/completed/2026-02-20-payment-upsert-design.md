# Payment Upsert Design — `recordPayments` Fix

**Date**: 2026-02-20
**Status**: Approved

## Problem

When a user unpays a sales order and then pays it again, a brand new payment record is created instead of reusing/restoring the soft-deleted one. Over time this accumulates orphaned soft-deleted payment records.

### Root Cause

There are two record-payment code paths:

| Method | Endpoint | Upsert? |
|--------|----------|---------|
| `recordPayment` | `POST /sales-orders/:id/record-payment` | ✅ Yes — checks for existing payment by `invoiceId`, restores if soft-deleted |
| `recordPayments` | `POST /sales-orders/:id/record-payments` | ❌ No — always creates new records |

`PaymentDialog` always calls `recordOrderPayments` (the multi-line path), which has no upsert logic. So every pay-after-unpay creates fresh records.

## Solution

Add upsert logic to `recordPayments` in `SalesOrderService`, mirroring what `recordPayment` already does.

## Behaviour After Fix

### Matching Strategy

Before creating any payment lines, fetch all soft-deleted payments for the invoice ordered by `paymentDate DESC`. Pair them positionally with the incoming lines:

- `newLines[0]` → `softDeletedPayments[0]` (if exists) → **restore + update**
- `newLines[1]` → `softDeletedPayments[1]` (if exists) → **restore + update**
- `newLines[N]` where no soft-deleted exists → **create new**

### Fields Updated on Restore

| Field | Action |
|-------|--------|
| `deletedAt` | Cleared via `paymentRepo.restore()` |
| `isActive` | Set to `true` |
| `amount` | Overwritten with new amount |
| `paymentMethodId` | Overwritten with new method (different method is fine) |
| `settlementStatus` | Recalculated from new payment method's `requiresSettlement` |
| `paymentDate` | Set to `new Date()` |
| `notes` | Updated with order/invoice reference |

### Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Pay with different payment method | `paymentMethodId` overwritten — correct |
| Fewer lines than soft-deleted records | Extra soft-deleted records stay soft-deleted (no action) |
| More lines than soft-deleted records | Extra lines create new payment records as before |
| No soft-deleted payments exist | All lines create new records (no change from current behaviour) |
| No invoice linked to order | Falls back to create-only (can't match without `invoiceId`) |

### Accounting Re-posting

After restoring a payment, call `postCustomerPaymentEntry()` wrapped in try/catch — same pattern as new payment creation. Failures are logged but do not abort the transaction.

## Scope

**Single file changed**: `backend/src/modules/sales/services/sales-order.service.ts`
**Method**: `recordPayments()`
**No frontend changes required.**

## File Location

`backend/src/modules/sales/services/sales-order.service.ts` — `recordPayments()` method, lines ~2097–2214
