# Expenses Module Manual Test Plan

## Lifecycle Matrix

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create expense with valid data | Expense created with DRAFT/UNPAID status, EXP- prefix number, balance = totalAmount |
| 2 | Pay partial (300 of 1000) | Status → PARTIAL, paidAmount=300, balance=700, JE created (Dr Expense / Cr Cash) |
| 3 | Pay remaining (700) | Status → PAID, paidAmount=1000, balance=0, second JE created |
| 4 | Refund partial (200 from first payment) | Status → PARTIAL, paidAmount=800, balance=200, refund JE created (Dr Cash / Cr Expense) |
| 5 | Refund remaining (800 total) | Status → UNPAID, paidAmount=0, balance=1000 |
| 6 | Cancel (only when UNPAID) | Status → CANCELLED, record stays readable, no new JE |

## Action-Matrix Rejections

| Scenario | Expected |
|----------|----------|
| Edit fully paid expense | Error: "Fully paid expenses cannot be edited" |
| Edit cancelled expense | Error: "Cancelled expenses cannot be edited" |
| Cancel partial expense | Error: "Refund all payments before cancelling this expense" |
| Pay cancelled expense | Error: "Cancelled expenses cannot receive payments" |
| Change account after payment | Error: "Expense account is locked after the first payment" |
| Amount below net paid on edit | Error: "Amount cannot be less than the amount already paid (RM X)" |
| Overpay (sum > balance) | Error: "Payment total exceeds the outstanding balance of X" |
| Refund > source remaining | Error: "Refund total exceeds the refundable amount" |

## Journal Entry Spot-Checks

- Each pay/refund creates exactly 1 balanced, immutable JE
- JE sourceType=EXPENSE, postingType=EXPENSE_PAYMENT or EXPENSE_REFUND
- correct Dr/Cr accounts (Expense account vs payment channel)
- No JE on create/edit/cancel of the expense record itself
- JE entryDate matches the payment/refund date

## List Filters/Sort/Pagination Round-Trip

- Search by expenseNumber, description, payee works (ILIKE)
- Date range filters correctly (expenseDate BETWEEN)
- Filter by paymentStatus (UNPAID/PARTIAL/PAID) and documentStatus (DRAFT/CANCELLED)
- Default sort: expenseDate DESC; custom sortBy works
- Pagination: page/limit params persist in URL
- No page/limit → returns full set

## Form Locks

- Account selector disabled when payments exist (tooltip: "Locked after first payment")
- Amount min = paidAmount when partially paid
- PAID expense form: read-only redirect or disabled state
- CANCELLED expense form: read-only redirect or disabled state
- Discard confirm on dirty cancel: "Discard this expense?"

## Cancelled Inertness

- Cancelled expense: chips visible, zero action buttons, fully viewable in detail
- Cannot pay, refund, edit, or uncancel a cancelled expense
