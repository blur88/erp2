# ERP

A single-company ERP covering inventory, sales, purchasing and double-entry accounting. This glossary defines the domain vocabulary only; behavioural rules live in `AGENTS.md`, and the conditions under which each action is allowed live in the linked domain docs.

Code identifiers, UI text and error messages may still use the avoided words. The glossary governs how we talk and write about the domain, not what the code is named.

## Language

### Ledger

**Journal entry**:
One balanced posting to the ledger, made up of two or more journal lines.
_Avoid_: transaction, posting (as a noun for the record)

**Journal line**:
One debit or credit leg of a journal entry. Bank reconciliation works on individual journal lines, never on whole journal entries.
_Avoid_: entry, journal entry line, transaction

**Post**:
To write the journal entry that records a business document's accounting effect.
_Avoid_: book, record (for this act)

**Reversal**:
A compensating journal entry that negates the accounting effect of an earlier journal entry while preserving the original.
_Avoid_: void, delete, refund

**Clearing account**:
The ledger account holding money a payment provider has collected from customers but not yet paid out to the business.
_Avoid_: provider wallet, suspense account

### Documents

**Sales order**:
A customer's order for products. It carries its own fulfilment lifecycle and its own Payments.
_Avoid_: invoice, sale

**Expense**:
A business cost recorded as a document and paid through Payments.
_Avoid_: bill, cost entry

**Owner equity document**:
A document recording money or inventory moving between the owner and the business: a Capital injection, a Cash drawing or a Stock drawing.

**Capital injection**:
An owner equity document recording the owner putting personal money into the business.
_Avoid_: owner deposit, opening balance

**Cash drawing**:
An owner equity document recording the owner taking money out of the business for personal use.
_Avoid_: owner withdrawal, expense

**Stock drawing**:
An owner equity document recording the owner taking inventory for personal use, valued at cost.
_Avoid_: stock adjustment, write-off

### Document lifecycle

These states and actions apply only to the document types named in each entry; not every document supports every one.

**Draft**:
The document is open for further processing, subject to its document-specific rules.

**Completed**:
The document has met its completion conditions. It is reached in one of two ways:
- Derived from Payment status, with no user action: an Expense is Completed when Paid or Overpaid; a Capital injection or Cash drawing is Completed only when Paid, and an Overpaid one stays Draft pending correction. A Refund that lowers the amount paid returns the document to Draft.
- By the Complete action, for a Stock drawing or a Reconciliation, which leaves Completed only through Uncomplete or Reopen.

**Complete**:
The explicit action that makes a document Completed. For a Stock drawing, it posts the drawing and takes the stock out of inventory. For a Reconciliation, it appends a new Version.
_Avoid_: finalize, close, seal

**Uncomplete**:
The action that returns a Completed Stock drawing to Draft, writing a Reversal of its journal entry and returning the stock. The drawing does not become Reversed.
_Avoid_: undo, reopen

**Cancel**:
The action that sets an Expense or Owner equity document aside so it takes no further processing, keeping it on record. See the module docs for when it is allowed.
_Avoid_: void, delete, discard

**Cancelled**:
The state of an Expense or Owner equity document after Cancel.

**Uncancel**:
The action that returns a Cancelled Expense or Owner equity document to Draft.
_Avoid_: restore, reopen

**Discard**:
The action that permanently removes a Reconciliation or Provider settlement that is still a Draft and has never been Completed or Posted. Nothing of it is kept, unlike Cancel.
_Avoid_: delete, cancel
See: [Bank Reconciliation](docs/modules/accounting/BANK_RECONCILIATION.md), [Provider Settlements](docs/modules/accounting/PROVIDER_SETTLEMENTS.md)

### Payments

**Payment**:
One recorded payment against a Sales order, Expense or Owner equity document.
_Avoid_: settlement

**Payment status**:
How much of a document's amount has been paid: Unpaid, Partially paid, Paid or Overpaid. It is separate from the document's lifecycle state.
_Avoid_: settlement status, settled (use Paid or Partially paid), oversettled (use Overpaid)

**Refund**:
A Payment with a negative amount, recording money returned against a document's earlier payments. It reduces the amount paid and leaves the earlier payments in place.
_Avoid_: reversal, void

### Provider settlement

**Provider settlement**:
A document recording a payment provider's payout of selected customer payments, net of refunds, moving that amount from the provider's Clearing account to a bank account.
_Avoid_: settlement (unqualified), payout, remittance
See: [Provider Settlements](docs/modules/accounting/PROVIDER_SETTLEMENTS.md)

**Posted**:
The state of a Provider settlement whose journal entry has been written. It can only be undone by a Reversal, which makes it Reversed.
See: [Provider Settlements](docs/modules/accounting/PROVIDER_SETTLEMENTS.md)

**Reversed**:
The state of a Provider settlement whose journal entry has been negated by a Reversal. Its Payment claims are released.
See: [Provider Settlements](docs/modules/accounting/PROVIDER_SETTLEMENTS.md)

**Payment claim**:
The exclusive hold a Provider settlement places on a customer Payment: a Payment can be included in at most one unreleased settlement. A claim is taken when a Draft is saved and is kept through posting. It is released only when the Payment is removed from the Draft, the Draft is Discarded, or the settlement is Reversed.
_Avoid_: reservation, lock
See: [Provider Settlements](docs/modules/accounting/PROVIDER_SETTLEMENTS.md)

### Bank reconciliation

See [Bank Reconciliation](docs/modules/accounting/BANK_RECONCILIATION.md) for when each action is allowed.

**Reconciliation**:
The matching of one bank account's journal lines against one bank statement period, so that the ledger agrees with the statement's closing balance. Each bank account has a numbered sequence of reconciliations, and at most one of them is a Draft at a time.
_Avoid_: bank rec, statement match

**Working set**:
The journal lines a Reconciliation currently holds, each either Matched or Already cleared. It can change only while the Reconciliation is a Draft, and it is the only thing that holds a Journal line reservation.
_Avoid_: working lines, ticked lines

**Journal line reservation**:
The exclusive hold a working set places on a journal line: a journal line can be in the working set of at most one Reconciliation. Completing does not release it, so a reserved line never reappears in a later period. It is released only when the line leaves the working set: unticked in a Draft, Discard, or Cancel reopen.
_Avoid_: claim, lock

**Matched**:
A journal line in the working set because it appears on this Reconciliation's bank statement.
_Avoid_: ticked, cleared

**First-time setup**:
The classification step on a bank account's first Reconciliation only. Every journal line dated before the period is classified as Already cleared, Outstanding or Unclassified.
_Avoid_: opening setup, initial import

**Already cleared**:
A journal line classified at first-time setup as having cleared the bank before the first reconciled period. It joins the working set, so it is reserved and never offered again.
_Avoid_: opening cleared

**Outstanding**:
A journal line of the bank account that has not yet appeared on a bank statement. At first-time setup it is one of the three classifications; in a Version it is the role of every journal line of the account, dated on or before the period end, that no Reconciliation has reserved. Either way it holds no reservation and can be Matched in a later period.
_Avoid_: uncleared, pending, setup mark

**Unclassified**:
A journal line at first-time setup that is neither Already cleared nor Outstanding. A Draft may contain Unclassified lines; a Reconciliation with any cannot be Completed.

**Version**:
The immutable snapshot written at each Complete of a Reconciliation, recording every journal line as Matched, Outstanding or Already cleared, together with the balances. A Version holds no reservations, so the same journal line can be Outstanding in one Reconciliation's Version and Matched in a later one. Versions are never changed or removed.
_Avoid_: snapshot, history row

**Reopen**:
The action that returns the latest Completed Reconciliation of a bank account to Draft so its working set can change. The working set, its reservations and all existing Versions are kept.
_Avoid_: unlock, uncomplete

**Cancel reopen**:
The action that abandons a Reopen and restores the Reconciliation exactly as its current Version recorded it: its working set, classifications, period, balances and Completed state. If any of those journal lines has since been reserved by another Reconciliation, nothing changes.
_Avoid_: undo, revert
