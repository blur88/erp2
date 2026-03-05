# Design: PO Payment Dialog + Auto Journal Posting

**Date:** 2026-02-16
**Status:** Approved

## Problem

1. Purchase orders have no payment dialog — users cannot record vendor payments via UI
2. The existing payment backend APIs (`markAsPaid`, `recordPayment`) only support single payments with no frontend entry point
3. Business workflow: payment is settled **before** goods are received (GRN), so payment UI is critical

## Solution

### Option A (Selected): Keep both journal postings

- **On Payment**: DR Accounts Payable / CR Cash
- **On GRN Receipt**: DR Inventory / CR Accounts Payable

AP acts as a clearing account. Temporary negative AP balance mid-process is acceptable.

---

## Changes Required

### 1. Backend: New `record-payments` Endpoint

**File:** `backend/src/modules/purchasing/controllers/purchase-order.controller.ts`
**File:** `backend/src/modules/purchasing/services/purchase-order.service.ts`

- Add `POST /purchasing/orders/:id/record-payments` endpoint
- Accepts array of `{ amount: number, paymentMethod: string }`
- Each line creates one `VendorPayment` record
- Each `VendorPayment` creation auto-calls `postVendorPaymentEntry` (already implemented in `vendor-payment.service.ts`)
- Mirrors sales `POST /sales-orders/:id/record-payments`

### 2. Frontend: VendorPaymentDialog Component

**File:** `frontend/src/components/purchasing/VendorPaymentDialog.tsx`

Mirrors `frontend/src/components/sales/PaymentDialog.tsx` exactly:
- Props: `open`, `onClose`, `onSubmit`, `order` (PurchaseOrder)
- Shows: Total, Previously Paid, Outstanding Balance
- Multiple payment lines with add/remove
- Payment method dropdown per line
- Overpayment warning in red
- Submits via `purchasingApi.recordOrderPayments(orderId, payments)`

### 3. Frontend: purchasingApi.recordOrderPayments

**File:** `frontend/src/services/purchasingApi.ts`

- Add `recordOrderPayments(id, payments)` method
- `POST /purchasing/orders/:id/record-payments`
- Mirrors `salesApi.recordOrderPayments`

### 4. Frontend: Wire Dialog into PurchaseOrdersPage

**File:** `frontend/src/pages/purchasing/PurchaseOrdersPage.tsx`

- Add `paymentDialogOpen` state
- Add "Pay" button in PO actions (visible when not fully paid)
- Add `handleRecordPayments` handler with optimistic update
- Render `<VendorPaymentDialog>` at bottom of page

### 5. Journal Posting Verification

**File:** `backend/src/modules/purchasing/services/vendor-payment.service.ts`

- Confirm `postVendorPaymentEntry` is called in `create()` method
- No changes expected — already implemented

---

## Data Flow

```
User clicks "Pay" on PO
  → VendorPaymentDialog opens
  → User adds payment lines (amount + method)
  → Submit: POST /purchasing/orders/:id/record-payments
  → Backend creates VendorPayment records
  → Each VendorPayment auto-posts: DR AP / CR Cash
  → PO payment status updated
  → Dialog closes, PO list refreshed
```

---

## Out of Scope

- Prepayment/advance-to-vendor accounting (Option A chosen instead)
- Changes to GRN journal posting (already correct)
- Overpayment refund flow (can be added later)
