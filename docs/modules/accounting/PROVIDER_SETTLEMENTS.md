# Provider Settlements

Current mechanics of Provider settlements: which payments can be selected, when each action is allowed, how payment claims are kept, and how the transfer reaches the ledger. Terms use the [accounting glossary](../../../GLOSSARY.md#provider-settlement).

The [Payment Method and channel account guide](PAYMENT_METHOD_CHANNEL_ACCOUNTS.md#provider-clearing-flag-1285) explains how a Chart of Accounts account is marked as a provider clearing account.

## Purpose and recorded decisions

A Provider settlement records funds a payment provider sends to the business for selected Sales Order Payments and Refunds. Posting moves their positive net from one provider clearing account to one bank account. Provider fees have no separate field or journal line: the recorded design treats them as already represented by Sales Order discounts.

The relevant design records are:

- [#1257 — Provider Settlements](https://github.com/blur88/erp2/issues/1257) established the settlement workflow, journal-derived clearing account, Payment claims, and the no-fee rule.
- [#1284 — net reconciliation](https://github.com/blur88/erp2/issues/1284) changed selection to one net row per Sales Order and Payment Method, allowed signed Refund rows, required one Payment Method per settlement, and required the entered amount to equal the selected total.
- [#1285 — provider clearing eligibility](https://github.com/blur88/erp2/issues/1285) introduced the provider clearing account rule. [#1288](https://github.com/blur88/erp2/issues/1288) removed the current-mapping gate: eligibility follows the account in the original journal entry.
- [#1298 — bank destinations](https://github.com/blur88/erp2/issues/1298) requires a valid bank destination. [#1134 — business timezone for posting dates](https://github.com/blur88/erp2/issues/1134) is the date convention used for Reversals.

## States and transitions

| State or action | Effect |
|---|---|
| **Draft** | The saved selection is editable. Its lines hold Payment claims. A Draft has no posting or Reversal metadata. |
| **Post** | A valid Draft becomes **Posted** with a journal entry and posting metadata. Posted settlements cannot be edited or discarded. |
| **Reverse** | A Posted settlement becomes **Reversed** with a new Reversal journal entry and reversal metadata. The original entry and settlement lines remain; line claims are released. |
| **Discard** | Permanently removes a Draft and its lines. This is not a fourth state. |

The database requires a positive settlement amount. Its lifecycle checks require a Draft to have no posting or reversal metadata, a Posted settlement to have posting metadata only, and a Reversed settlement to retain posting metadata and also have reversal metadata.

## When actions are allowed

| Action | Allowed when |
|---|---|
| **Create** | At least one current eligible Sales Order + Payment Method group is selected; all selected groups use one Payment Method; the refreshed net for each group still matches what was selected; and the positive combined total exactly equals the entered amount. The destination must be an active, postable bank account that is not a provider clearing account and is not the derived clearing account. |
| **Edit** | The settlement is a Draft and the request supplies a non-empty complete selection. The same eligibility, one-method, account, and amount checks as Create apply. Rows omitted from the new selection are removed from the Draft. |
| **Post** | The settlement is a Draft with at least one line. Each saved group must still contain exactly the same eligible Payment IDs and amounts; its current journal-derived clearing account must still match the Draft's saved clearing account; and the account and total checks must still pass. |
| **Reverse** | A new Reversal requires a Posted settlement. The current payment-method mapping and provider-clearing flag are not rechecked. Repeating a Reverse request for an already Reversed settlement returns the existing result without creating another Reversal. |
| **Discard** | The settlement is a Draft. Posted and Reversed settlements cannot be discarded. |

An edit replaces the selection as a whole, not as an add/remove delta. It may change the inferred Payment Method by selecting groups for a different method. An empty selection is not a saved Draft; discard the Draft instead.

## Eligible payments and groups

An underlying payment row is eligible for a settlement date when all of these hold:

- Its payment date is on or before the settlement date.
- It has one non-deleted, unreversed Sales Payment journal entry when its amount is positive, or Sales Refund entry when its amount is negative. The entry must identify that exact payment and Sales Order.
- It has no live Payment claim, except that an edit or post may read claims already held by that same Draft.
- Its original journal entry derives to one non-deleted account marked as a provider clearing account.

The picker groups eligible payment rows by **Sales Order + Payment Method** and sums their signed amounts. A zero-net group is omitted. A negative group can appear as a deduction, for example when a Refund is recorded after the original Payment was already settled. The combined selection still has to be positive.

Every payment in a group must derive to the same provider clearing account. Every payment selected for one settlement must also derive to one clearing account, because the settlement stores one clearing-account destination. A group with mixed accounts is not offered; selecting groups that span accounts cannot be saved as one settlement.

Eligibility follows the original journal, not the Payment Method's current account mapping or enabled/disabled state. Remapping a method therefore does not redirect old Payments or strand their clearing-account balance. A new Payment follows its own journal entry. The Sales Order's current lifecycle state is not a settlement gate: cancelling an order does not undo the payment's accounting entry or remove the balance from the clearing account.

## Accounts and journal entries

The provider clearing account is derived from the original journal entry for every selected Payment. For a positive Payment, the entry must debit the clearing account and credit the configured Customer Deposit account. For a negative Refund, it must debit Customer Deposit and credit the clearing account. The entry must have exactly those two lines, with the full absolute payment amount on the appropriate side. If the journal is missing, reversed, duplicated, or has another shape, the row cannot be used.

The account flag and its setup constraints are described in the [provider clearing account guide](PAYMENT_METHOD_CHANNEL_ACCOUNTS.md#provider-clearing-flag-1285). The settlement destination is checked separately: it must be an active, postable account marked as a bank account, and it cannot be marked as a provider clearing account. It must differ from the derived clearing account; otherwise the posting would debit and credit the same account and record no transfer.

Posting creates exactly two journal lines:

| Account | Posting |
|---|---|
| Bank account | Debit the settlement amount |
| Provider clearing account | Credit the settlement amount |

The entry date is the settlement date. A Reversal uses the action date in the configured application timezone, rather than backdating the correction to the settlement date. The original journal entry and its financial lines are not changed; the Reversal is a separate entry.

## Payment claims and saved amounts

A Draft claims each selected Sales Order Payment when its lines are saved. The claim remains through posting. A database uniqueness rule allows each Payment to have only one unreleased claim at a time, including across concurrent users. Draft claims do not expire. The design chooses explicit release because silent expiry could release a claim while someone is still editing the Draft. Claims are released by removing a Payment from the Draft, discarding the Draft, or reversing the Posted settlement.

Each line stores the signed amount as a snapshot. When creating or editing a Draft, the server refreshes every requested group's current eligible payments and rejects a missing group, a zero net, or a net that differs from the submitted expected amount. It saves the complete eligible payment set for each group at that time; it does not compare that set with what the user last saw if the membership changed without changing the net. At post time, it checks both the exact saved Payment ID set and each saved amount against the current rows. Equal totals alone are insufficient: a new Payment and Refund could leave the same net while changing which accounting events the settlement clears.

Removing a line from a Draft hard-deletes that line so its unreleased claim is actually freed. Reversal keeps posted lines and their amounts for history, and stamps their release time so those Payments can be selected again. A soft delete does not release a claim.

## Concurrency behavior

For an existing settlement, Edit, Discard, Post, and Reverse lock the settlement before checking its state, so an action cannot proceed on a status that changed concurrently. Create, Edit, and Post also lock the involved Sales Orders in a stable order before recomputing eligibility. Payment and Refund writers lock those same orders before adding rows, so a concurrent write is either visible to the settlement check or waits until it commits. The database claim rule decides races between two settlements for the same Payment.

Claim rows are inserted in stable Payment ID order so concurrent settlements contend for claims in the same order. A PostgreSQL deadlock during Create, Edit, or Post is currently returned as a retryable conflict. No issue or ADR records why this response is retryable or establishes it as a broader API policy; this is current behavior only.

## Related behavior

- [#1335 — Payment Method picker filter](https://github.com/blur88/erp2/issues/1335) adds a display filter without changing how a settlement's method is inferred.
- [#1289 — historical methods in the settlement list filter](https://github.com/blur88/erp2/issues/1289) keeps methods attached to existing settlements available even if later deactivated.
- [#1340 — General Ledger source links](https://github.com/blur88/erp2/issues/1340) records navigation from a settlement journal source to its Provider settlement.
