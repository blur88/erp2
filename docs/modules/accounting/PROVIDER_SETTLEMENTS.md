# Provider Settlements

This document describes current Provider settlement mechanics: eligibility, action guards, Payment claims, and ledger effects. Terms use the [accounting glossary](../../../GLOSSARY.md#provider-settlement).

The [Payment Method and channel account guide](PAYMENT_METHOD_CHANNEL_ACCOUNTS.md#provider-clearing-flag-1285) owns the Clearing account flag and its setup constraints. This document owns Provider settlement eligibility and actions.

## Purpose and recorded decisions

A Provider settlement records a payment provider's transfer for selected Sales order Payments and Refunds. Posting moves their positive net from one Clearing account to one bank account.

Other relevant decisions:

- [#1257 — Provider Settlements](https://github.com/blur88/erp2/issues/1257) records the initial workflow and the no-separate-fee rule.
- [#1284 — net reconciliation](https://github.com/blur88/erp2/issues/1284) records one net row per Sales order and Payment Method so users reconcile the actual provider transfer rather than select individual historical Payment and Refund rows. It also records one Payment Method per Provider settlement and exact equality between the selected net and amount received.
- [#1285 — Clearing account eligibility](https://github.com/blur88/erp2/issues/1285) introduced the Clearing account eligibility rule. [#1288](https://github.com/blur88/erp2/issues/1288) records that eligibility follows the account in the original journal entry, without a current-mapping gate.
- [#1298 — bank destinations](https://github.com/blur88/erp2/issues/1298) records the bank destination guard. [#1134 — Reversal dates](https://github.com/blur88/erp2/issues/1134) records the timezone convention for Reversal dates.

## Provider fees and the reconciliation difference

Provider fees have no separate field or journal line. The recorded design treats them as already represented by Sales order discounts. If a provider withholds a fee, the bank receives less than the Provider settlement journal entry records, so the Bank reconciliation difference cannot reach zero from Provider settlement lines alone; the fee has to reach the ledger another way. See [#1257](https://github.com/blur88/erp2/issues/1257) and [#1284](https://github.com/blur88/erp2/issues/1284).

## States and transitions

| State or action | Effect |
|---|---|
| **Draft** | The saved selection is editable. Its lines hold Payment claims. A Draft has no posting or Reversal metadata. |
| **Post** | A valid Draft becomes **Posted** with a journal entry and posting metadata. Posted Provider settlements cannot be edited or discarded. |
| **Reverse** | A Posted Provider settlement becomes **Reversed** with a new Reversal journal entry and reversal metadata. The original entry and Provider settlement lines remain. |
| **Discard** | Permanently removes a Draft Provider settlement and its lines. This is not a fourth state. |

The database requires a positive amount. Its lifecycle checks require a Draft to have no posting or Reversal metadata, a Posted Provider settlement to have posting metadata only, and a Reversed Provider settlement to retain posting metadata and also have reversal metadata.

## When actions are allowed

| Action | Allowed when |
|---|---|
| **Create** | At least one current eligible Sales order + Payment Method group is selected; all groups use one Payment Method and derive to one Clearing account with the provider-clearing flag; each refreshed group net still equals its submitted expected net; and the positive combined total exactly equals the amount received. The destination must be a live, active, postable bank account without the provider-clearing flag, and must differ from the derived Clearing account. |
| **Edit** | The Provider settlement is a Draft and the request supplies a non-empty complete selection. The same eligibility, one-method, one-Clearing-account, destination, and amount checks as Create apply. Each Edit hard-deletes all existing Draft lines and inserts the full refreshed selection again, even when some Payments remain selected. |
| **Post** | The Provider settlement is a Draft with at least one line. Each saved group must still contain the same eligible Payment IDs and amounts; its current journal-derived Clearing account must still match the saved account and retain the provider-clearing flag; and the destination, distinct-account, and amount checks must still pass. |
| **Reverse** | A new Reversal requires a Posted Provider settlement. Repeating a Reverse request for an already Reversed Provider settlement returns the existing result without creating another Reversal. Its original bank and Clearing accounts are loaded again: both must still exist and be postable, so a soft-deleted or non-postable account makes Reverse fail. The current Payment Method mapping and provider-clearing flag are not rechecked. |
| **Discard** | The Provider settlement is a Draft. Posted and Reversed Provider settlements cannot be discarded. |

An Edit replaces the selection as a whole, not as an add/remove delta. It may change the inferred Payment Method by selecting groups for a different method. An empty selection is not a saved Draft; discard the Draft instead.

## Eligible Payments and groups

The eligibility query uses these checks:

- The Payment date is on or before the Provider settlement date.
- A matching journal entry exists for that Payment, Sales order, and expected posting type, with no reversal pointer and no separate journal entry reversing it. This `EXISTS` check does not filter the journal entry's `deletedAt`.
- No unreleased Payment claim belongs to another Provider settlement. Edit and Post can read claims already held by that same Draft.

A separate derivation step requires exactly one live, unreversed matching journal entry for each Payment and validates its expected two-line shape and amounts. The picker then applies the Clearing account condition per Sales order + Payment Method group: every eligible Payment in the group must derive to the same live account, that account must have the provider-clearing flag, and the group's net must be non-zero. A soft-deleted journal entry can satisfy the initial `EXISTS` check, but it is excluded by the later derivation.

The picker groups eligible Payments by **Sales order + Payment Method** and sums their signed amounts. A zero-net group is omitted. A negative group can appear as a deduction, for example when a Refund is recorded after the original Payment was already included in a Provider settlement. The combined selection still has to be positive.

Eligibility follows the original journal, not the Payment Method's current account mapping or enabled state. Remapping a method therefore does not redirect earlier Payments. A new Payment follows its own journal entry. A selection spanning more than one Clearing account cannot be saved as one Provider settlement.

## Accounts and journal entries

The Clearing account is derived from the original journal entry for every selected Payment. For a positive Payment, the entry must have exactly two lines: debit the Clearing account and credit the configured Customer Deposit account. For a negative Refund, it must debit Customer Deposit and credit the Clearing account. Each line carries the full absolute Payment amount on the appropriate side. A missing or reversed matching entry, more than one live matching entry, or a different line shape makes that Payment unavailable.

The Clearing account flag and its setup constraints are described in the [Payment Method and channel account guide](PAYMENT_METHOD_CHANNEL_ACCOUNTS.md#provider-clearing-flag-1285). The destination is checked separately: it must be an active, postable account marked as a bank account, and it must not have the provider-clearing flag. It must differ from the derived Clearing account; otherwise the journal would debit and credit the same account and record no transfer.

Posting creates exactly two journal lines:

| Account | Posting |
|---|---|
| Bank account | Debit the Provider settlement amount |
| Clearing account | Credit the Provider settlement amount |

The journal entry date is the Provider settlement date. A Reversal uses the action date in the configured application timezone. The original journal entry and its financial lines are not changed; the Reversal is a separate entry.

## Payment claims and saved amounts

A Draft holds a Payment claim on every selected Sales order Payment. The database uniqueness rule allows each Payment to have only one unreleased claim at a time. Claims remain through Post. Each Edit replaces all line rows within its transaction; an omitted Payment becomes available when the edit commits, while a still-selected Payment receives a new claim row. Discard removes the Draft lines. A successful Reverse stamps the historical lines as released without deleting their amounts.

Each Provider settlement line stores the signed Payment amount as a snapshot. On Create and Edit, the server refreshes the requested groups and rejects a missing group, a zero net, or a net that differs from the submitted expected amount. It saves the complete current eligible Payment set for each requested group. On Post, it checks the exact saved Payment ID set and each saved amount against the current rows.

## Concurrency behavior

For an existing Provider settlement, Edit, Discard, Post, and Reverse lock the header before checking its state. Create, Edit, and Post also lock the involved Sales orders in ascending ID order before recomputing eligibility. Payment and Refund writers lock those same orders before adding rows. The database claim rule decides races between two Provider settlements for the same Payment.

Provider settlement lines are inserted in ascending Payment ID order. A PostgreSQL deadlock during Create, Edit, or Post is returned as a retryable conflict.

## Current behavior without recorded intent

The following behavior is enforced by current code, but no committed issue or ADR records the intent behind it:

- Payment claims have no automatic expiry.
- Each Edit hard-deletes and recreates every line in the Draft, including lines for Payments that remain selected.
- Create and Edit save the current eligible Payment membership for each group even if membership changed after the picker loaded, as long as the refreshed net still equals the submitted expected net. No committed issue or ADR records why membership itself is not compared on save.
- The Sales order's current lifecycle state is not checked by Provider settlement eligibility. Cancelling a Sales order does not itself remove its Payment from the settlement eligibility query.
- Post requires the exact saved Payment ID set and each saved amount to remain current. An unchanged total does not pass when the underlying Payments change.
- Reverse reloads the original journal accounts and fails if either is missing or non-postable. No committed issue or ADR records how Reverse should behave when an original account is unavailable.
- The ascending Payment ID insertion order and PostgreSQL deadlock-to-conflict mapping described above have no recorded intent. No committed issue or ADR establishes a broader retry policy.

## Related behavior

- [#1335 — Payment Method picker filter](https://github.com/blur88/erp2/issues/1335) adds a display filter without changing how a Provider settlement's method is inferred.
- [#1289 — historical methods in the Provider settlement list filter](https://github.com/blur88/erp2/issues/1289) keeps methods attached to existing Provider settlements available if later deactivated.
- [#1340 — General Ledger source links](https://github.com/blur88/erp2/issues/1340) records navigation from a Provider settlement journal source to its Provider settlement.
