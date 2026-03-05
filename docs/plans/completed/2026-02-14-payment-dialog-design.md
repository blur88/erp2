# Payment Popup Dialog with Split Payments

**Date**: 2026-02-14
**Scope**: Sales orders only (purchasing to follow later)

## Problem

Current sales order payment recording uses an inline dropdown + amount input in the orders table. This is limiting - no support for split payments, no reference field, and clutters the table UI.

## Solution

Replace inline payment controls with a "Pay" button that opens a Material-UI dialog. The dialog supports split payments across multiple methods, with a reference field per line. A new batch API endpoint processes all payment lines atomically in a single database transaction.

## UI Design

Dialog contains:
- Order summary header (total, previously paid, outstanding balance)
- Payment lines list, each with: method dropdown, amount input, reference text field, delete button
- "Add Payment Line" button to split across methods
- Running total and remaining balance at the bottom
- Cancel and Record Payment action buttons

Behaviors:
- First line auto-fills with full outstanding balance
- New lines get the remaining unallocated amount
- Minimum 1 line required
- Overpayment allowed with warning
- Record Payment disabled if total is 0 or negative

## Backend

### New Endpoint

`POST /api/sales-orders/:id/record-payments`

Request body:
```json
{
  "payments": [
    { "paymentMethodId": "uuid", "amount": 500.00, "reference": "CHK-1234" },
    { "paymentMethodId": "uuid", "amount": 500.00, "reference": "TXN-5678" }
  ]
}
```

### Processing (single transaction)

1. Validate order exists and has outstanding balance
2. Validate all payment methods are active
3. For each payment line:
   - Create Payment record (status: COMPLETED)
   - Set settlementStatus based on method's requiresSettlement flag
   - Store reference in Payment.notes field
4. Update order.paidAmount = previous + sum of all lines
5. Post journal entries per line (DR payment method account, CR Accounts Receivable)
6. Full rollback if any step fails

### Account Mapping

Uses existing dynamic pattern: `payment_{methodCode.toLowerCase()}` resolves the debit GL account per payment line.

## Frontend Changes

### New Component
- `frontend/src/components/sales/PaymentDialog.tsx` - Dialog with payment lines

### Modified Files
- `frontend/src/pages/sales/OrdersPage.tsx` - Remove inline controls, add Pay button
- `frontend/src/services/salesApi.ts` - Add recordOrderPayments() batch call

### Backend Modified Files
- `backend/src/modules/sales/services/sales-order.service.ts` - Add recordPayments()
- `backend/src/modules/sales/controllers/sales-order.controller.ts` - Add batch endpoint
- `backend/src/modules/sales/dto/` - Add RecordPaymentsDto

## Data Flow

```
Pay button click → PaymentDialog opens → load active payment methods
→ User adds payment lines (method + amount + reference)
→ Record Payment click → POST /api/sales-orders/:id/record-payments
→ Backend transaction: create N payments, update order, post N journal entries
→ Dialog closes → order row refreshes
```

## Decisions

- **Separate Payment records per line** (not grouped under parent) - simpler accounting
- **Batch API endpoint** for atomicity - all lines succeed or fail together
- **Reference stored in existing Payment.notes field** - no schema changes needed
- **Sales orders only** for initial scope - purchasing follows later
