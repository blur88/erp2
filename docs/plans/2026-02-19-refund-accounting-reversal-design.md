# Refund & Accounting Reversal Design

**Date**: 2026-02-19
**Status**: Approved
**Scope**: Refund processing, unpay reversal, unfulfill reversal — all with proper accounting JE integration

---

## Problem Statement

Three operations in the sales module modify financial state but do **not** create corresponding accounting journal entries:

1. **Unpay order** — soft-deletes payments, resets paid amounts, but leaves original payment JEs posted
2. **Unfulfill order** — restores inventory, clears fulfillment flag, but leaves original COGS/Revenue JEs posted
3. **Refund** — `POST /payments/refund` endpoint exists but is not wired to accounting, and has no frontend UI

This causes accounting records to diverge from actual sales state.

---

## Design Decisions

### Fiscal Period Handling
When creating reversal JEs, post into the **current open fiscal period** regardless of when the original JE was posted. This is standard ERP practice (SAP, Xero, QuickBooks). Closed periods remain untouched and auditable.

**Exception**: If no open fiscal period exists, block the operation with a clear error message.

### Refund Payment Method
Refunds support both same-method and different-method scenarios:

| Scenario | JE Generated |
|---|---|
| Same method | `DR A/R / CR Payment Account` (standard reversal) |
| Different method | `DR Original Method Account / CR Refund Method Account` (transfer) |

In both cases, invoice `paidAmount` is reduced — the customer's balance is restored.

### Split Payment Refunds
Each payment is refunded independently. An order with 2 payments shows 2 "Refund" buttons — one per payment row. There is no bulk order-level refund endpoint.

### Refund Entry Point
Refund UI lives on the **order detail page** only (not the Payments page). User selects which payment to refund from the payments table within the order.

---

## Backend Changes

### 1. `accounting.service.ts` — New Helper: `reverseSourceEntries()`

```typescript
async reverseSourceEntries(
  sourceType: string,
  sourceId: string,
  userId: string
): Promise<void>
```

- Finds all POSTED journal entries matching `sourceType` + `sourceId`
- For each: calls `journalEntryService.reverseEntry(id)` (existing method)
- Reversal JE is dated today and posted into the current open fiscal period
- Skips entries already reversed (idempotent)
- Throws `BadRequestException` if no open fiscal period exists

### 2. `accounting.service.ts` — New Method: `reversePaymentEntry()`

```typescript
async reversePaymentEntry(
  originalPaymentId: string,
  originalPaymentMethodId: string,
  refundPaymentMethodId: string,
  amount: number,
  userId: string
): Promise<void>
```

Used only when refund method differs from original. Creates a 2-line JE:
```
DR [Original Payment Method Account]   amount
CR [Refund Payment Method Account]     amount
```

### 3. `payment.service.ts` — Update `RefundPaymentDto`

```typescript
class RefundPaymentDto {
  paymentId: string
  amount: number
  reason?: string
  refundPaymentMethodId?: string   // NEW — optional, defaults to original
}
```

### 4. `payment.service.ts` — Update `refund()` Method

- If `refundPaymentMethodId` absent or same as original → call `reverseSourceEntries('payment', originalPaymentId, userId)`
- If `refundPaymentMethodId` differs → call `reversePaymentEntry(originalPaymentId, originalMethodId, refundMethodId, amount, userId)`
- Always create negative payment record with the refund payment method
- Always call `invoice.addPayment(-amount)` to reduce `paidAmount`
- Wrap accounting call in try-catch — refund succeeds even if accounting fails, but logs error clearly

### 5. `sales-order.service.ts` — Update `unpayOrder()`

After soft-deleting each payment, add:
```typescript
try {
  await this.accountingService.reverseSourceEntries('payment', payment.id, 'system');
} catch (err) {
  this.logger.error(`Failed to reverse JE for payment ${payment.id}: ${err.message}`);
}
```

### 6. `sales-order.service.ts` — Update `unfulfillOrder()`

After restoring inventory, add:
```typescript
try {
  await this.accountingService.reverseSourceEntries('sales_order', orderId, 'system');
} catch (err) {
  this.logger.error(`Failed to reverse JE for order ${orderId}: ${err.message}`);
}
```

---

## Frontend Changes

### Order Detail Page — Payments Table

Add a **Refund** button to each payment row (only visible for `COMPLETED` payments).

Clicking opens a refund dialog:

```
┌─────────────────────────────────────┐
│  Refund Payment PAY-001             │
│                                     │
│  Original: Cash       $300.00       │
│                                     │
│  Refund Amount:  [ $300.00      ]   │
│                                     │
│  Refund Method:  [ Cash (same) ▼]   │
│                  > Cash             │
│                  > Bank Transfer    │
│                  > Credit Card      │
│                                     │
│  Reason: [                      ]   │
│                                     │
│       [Cancel]    [Process Refund]  │
└─────────────────────────────────────┘
```

**Behaviour:**
- Amount defaults to full payment amount, editable (min: 0.01, max: original amount)
- Refund method defaults to original payment method, overridable from payment methods list
- Reason is optional free text
- On success: original payment row shows `REFUNDED` chip, new negative payment row appears with `REFUND` label
- Calls `POST /payments/refund` with `{ paymentId, amount, reason, refundPaymentMethodId }`

---

## Accounting Journal Entries Summary

| Operation | JE Created |
|---|---|
| Pay order | DR Cash / CR A/R ✅ (already works) |
| Unpay order | DR A/R / CR Cash (reversal per payment) ← **NEW** |
| Fulfill order | DR COGS + DR A/R / CR Inventory + CR Revenue ✅ (already works) |
| Unfulfill order | DR Inventory + DR Revenue / CR COGS + CR A/R (reversal) ← **NEW** |
| Refund (same method) | DR A/R / CR Cash (reversal of payment JE) ← **NEW** |
| Refund (diff method) | DR Original Method / CR Refund Method ← **NEW** |

---

## Files to Modify

| File | Change |
|---|---|
| `backend/src/modules/accounting/services/accounting.service.ts` | Add `reverseSourceEntries()` and `reversePaymentEntry()` |
| `backend/src/modules/sales/services/payment.service.ts` | Update `refund()`, extend `RefundPaymentDto` |
| `backend/src/modules/sales/services/sales-order.service.ts` | Wire `unpayOrder()` and `unfulfillOrder()` to accounting reversals |
| `backend/src/modules/sales/dto/payment.dto.ts` | Add `refundPaymentMethodId` field |
| `frontend/src/pages/sales/OrderDetailPage.tsx` (or equivalent) | Add Refund button + dialog to payments table |
| `frontend/src/services/salesApi.ts` | Update refund API call to include `refundPaymentMethodId` |
| `frontend/src/types/index.ts` | Update payment types if needed |

---

## Error Handling

| Error Condition | Behaviour |
|---|---|
| No open fiscal period | Block operation, return `400 BadRequestException: "No open fiscal period found. Please open a fiscal period before processing refunds."` |
| Original JE already reversed | Skip silently (idempotent) |
| Accounting service fails | Log error, operation (unpay/unfulfill) still succeeds — accounting inconsistency flagged in logs |
| Refund amount > original payment | Block with `400: "Refund amount cannot exceed original payment amount"` |
| Original payment not COMPLETED | Block with `400: "Can only refund completed payments"` |

---

## Out of Scope

- Credit note entity (not needed — negative payments serve this purpose)
- Refund from Payments page (order detail page only)
- Bulk refund across multiple payments at once
- Automated refund scheduling
