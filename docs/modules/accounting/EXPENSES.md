# Expenses

Current mechanics of Expenses: when actions are allowed, how states are reached,
and how Payments affect the ledger. Domain terms follow the
[glossary](../../../GLOSSARY.md#documents). This document owns the Expense-specific
rules; code-verification citations are recorded in the PR for
[issue #1436](https://github.com/blur88/erp2/issues/1436).

## When each action is allowed

These are backend business conditions for an existing Expense unless stated
otherwise. Requests also pass the API's field validation; successful Payments
and Refunds require their ledger postings to succeed.

| Action | Allowed when |
|---|---|
| Create | Total amount is greater than zero. The expense account exists, is active and postable, is Expense-type, and is not the configured Cost of Goods Sold account. |
| Edit | The Expense is not Cancelled and its Payment status is neither Paid nor Overpaid. A supplied total must be greater than zero and at least the current net amount paid. Changing the expense account additionally requires no Payment rows at all and the same account validation as Create. |
| Pay | The Expense is neither Cancelled nor Completed. At least one row is supplied, every amount is greater than zero, and every selected Payment method exists, is active and is enabled for purchases. The request may exceed the remaining balance. |
| Refund | The Expense is not Cancelled. At least one row is supplied, every amount is greater than zero, and the request's total does not exceed net paid across all existing Payment rows. Each selected Payment method must exist and be active; it need not be enabled for purchases or match an earlier Payment method. |
| Cancel | The Expense is Draft and its net amount paid is exactly zero. Payment history may remain after a full Refund. |
| Uncancel | The Expense is Cancelled; it returns explicitly to Draft. |

Create and Edit accept an expense date, description, expense account and total,
with optional payee and notes (Edit accepts partial updates). API amounts are
unsigned decimal strings with up to four decimal places; service checks reject
zero. Payment and Refund rows also carry their own calendar date, Payment method
and optional reference. There is no explicit Complete action or delete endpoint
on the Expense controller.

## Document status and Payment status

Create starts at Draft / Unpaid, with zero paid and balance equal to total.
Payment status is calculated from the signed sum of Payment amounts (net paid):

| Payment status | Net paid compared with total | Derived document status, unless Cancelled |
|---|---|---|
| Unpaid | Zero or less | Draft |
| Partially paid (`PARTIAL`) | Greater than zero, less than total | Draft |
| Paid | Equal to total | Completed |
| Overpaid | Greater than total | Completed |

Pay, Refund and an Edit that supplies a total recalculate both statuses. Thus an
Edit lowering the total to net paid can reach Completed without another Payment.
A Refund leaving net paid at or above total leaves the Expense Completed; a
Refund taking it below total returns it to Draft. A full Refund returns it to
Draft / Unpaid. Overpaid Expenses have a negative balance.

Cancel changes only document status. The status derivation preserves Cancelled;
Edit, Pay and Refund reject that state. Uncancel explicitly returns to Draft.

## Stored invariants and ledger effects

- `paidAmount` is the signed sum of Payment rows; `balance` is total minus that
  sum. Money is stored at four decimal places and aggregated in integer units
  of 0.0001, rather than floating-point arithmetic.
- A Payment is positive; a Refund is stored as a new negative Payment row.
  Earlier rows remain. Refund capacity is aggregate net paid, including legacy
  Refund rows. New rows have no source-payment link; the legacy link is retained
  for historical display/audit, not used to identify Refunds.
- Any Payment history locks the expense account, even when net paid returns to
  zero. Other permitted edits still follow the action conditions above.
- Edit, Cancel, Uncancel, Pay and Refund lock the Expense row in a database
  transaction. Pay and Refund save rows, post their journal entries and persist
  aggregates and derived document status in that same transaction.
- Create does not post a journal entry. Each Payment posts a debit to the expense
  account and a credit to the account resolved from its selected Payment method;
  each Refund posts the opposite legs using its own selected method. The journal
  date is the Payment or Refund date, not the expense date. Cancel and Uncancel
  do not post journal entries.
- Each row's posting amount is rounded to cents before posting, while the Payment
  row and Expense aggregates retain four decimal places. Posting lookup reuses
  an existing non-Reversal journal entry for the same Expense source, row event
  and posting type; this does not make a repeated Pay request idempotent, since
  that request creates new rows.

## Recorded decisions and limits of intent

[Issue #1096](https://github.com/blur88/erp2/issues/1096) records the cross-method
Refund rule: allocations are independent of the original Payment method, the
monetary cap is aggregate net paid, and the selected Refund method determines
the journal channel. This is the recorded intent for aggregate rather than
per-source Refund limits.

The tracked comments in `ExpenseService.cancel` and `ExpenseService.uncancel`
record why Cancel requires zero net paid: Uncancel relies on that condition to
return explicitly to Draft. The tracked `ExpensePayment.sourcePaymentId` comment
records why the legacy link remains: historical display/audit.

[Issue #1094](https://github.com/blur88/erp2/issues/1094) names automatic Expense
completion as the consistency reference for Owner equity; it does not establish
the original reason for the Expense lifecycle. The configured Cost of Goods Sold
exclusion's error message records that this account is reserved for automatic
Sales order postings.

For the remaining mechanics above—including allowing Overpaid Expenses,
locking the expense account after fully refunded history, edit restrictions,
precision differences and transaction boundaries—this document describes current
code only. No recorded intent is established here; local uncommitted specs are
not decision sources. This doc was requested by
[issue #1436](https://github.com/blur88/erp2/issues/1436), following the committed
module-documentation work in
[issue #1425](https://github.com/blur88/erp2/issues/1425).
