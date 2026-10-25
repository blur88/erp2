# Provider Settlements

This document describes current Provider settlement mechanics: eligibility, action guards, Payment claims, and ledger effects. Terms use the [ERP glossary](../../../GLOSSARY.md#provider-settlement).

The [Payment Method and channel account guide](PAYMENT_METHOD_CHANNEL_ACCOUNTS.md#provider-clearing-flag-1285) owns the Clearing account flag and its setup constraints. This document owns Provider settlement eligibility and actions.

## Purpose and recorded decisions

A Provider settlement records a payment provider's transfer for selected Sales order Payments and Refunds. Posting moves their positive net from one Clearing account to one bank account.

Recorded decisions:

- [#1257 — Provider Settlements](https://github.com/blur88/erp2/issues/1257) records the initial workflow, preventing duplicate selection of Payments, making Posted Provider settlements immutable, preserving the original journal entry on Reverse, and keeping provider fees out of separate accounting.
- [#1284 — net reconciliation](https://github.com/blur88/erp2/issues/1284) records one net row per Sales order and Payment Method so users reconcile the actual provider transfer rather than select individual historical Payment and Refund rows. It also records one Payment Method per Provider settlement and exact equality between the selected net and amount received.
- [#1285 — Clearing account eligibility](https://github.com/blur88/erp2/issues/1285) introduced the Clearing account eligibility rule. [#1288](https://github.com/blur88/erp2/issues/1288) records that eligibility follows the account in the original journal entry, without a current-mapping gate.
- [#1298 — bank destinations](https://github.com/blur88/erp2/issues/1298) records the bank destination guard. [#1134 — posting dates](https://github.com/blur88/erp2/issues/1134) records the configured application timezone convention for journal posting dates generally.
- [PR #1287 — provider clearing account gates](https://github.com/blur88/erp2/pull/1287) records the Remove-only treatment of an unflagged Draft group and the intent that Reverse not be blocked by provider-clearing eligibility.

## Provider fees and the reconciliation difference

Provider fees have no separate field or journal line. The fee treatment is derived from [#1257](https://github.com/blur88/erp2/issues/1257) and [#1284](https://github.com/blur88/erp2/issues/1284): fees are treated as already represented by Sales order discounts. If a provider withholds a fee, the bank receives less than the Provider settlement journal entry records, so the Bank reconciliation difference cannot reach zero from Provider settlement lines alone; the fee has to reach the ledger another way.

## States and transitions

| State or action | Effect |
|---|---|
| **Draft** | The saved selection is editable. Its lines hold Payment claims. A Draft has no posting or reversal metadata. |
| **Post** | A valid Draft becomes **Posted** with a journal entry and posting metadata. Posted Provider settlements cannot be edited or discarded, as recorded in [#1257](https://github.com/blur88/erp2/issues/1257). |
| **Reverse** | A Posted Provider settlement becomes **Reversed** with a new Reversal journal entry and reversal metadata. The original journal entry remains unchanged, as recorded in [#1257](https://github.com/blur88/erp2/issues/1257); Provider settlement lines remain for history. |
| **Discard** | Permanently removes a Draft Provider settlement and its lines. This is not a fourth state. |

The database requires a positive amount. Its lifecycle checks require a Draft to have no posting or reversal metadata, a Posted Provider settlement to have posting metadata only, and a Reversed Provider settlement to retain posting metadata and also have reversal metadata.

## When actions are allowed

| Action | Allowed when |
|---|---|
| **Create** | At least one current eligible Sales order + Payment Method group is selected; all groups use one Payment Method and derive to one flagged Clearing account; each refreshed group net still equals its submitted expected net; and the positive combined total exactly equals the amount received. The destination must pass the checks in [Accounts and journal entries](#accounts-and-journal-entries). |
| **Edit** | The Provider settlement is a Draft and the request supplies a non-empty complete selection. The same eligibility, amount, and account checks as Create apply. |
| **Post** | The Provider settlement is a Draft with at least one line. Revalidation requires the saved Payment IDs and amounts to match current rows, the re-derived Clearing account to match the one stored on the Draft and remain flagged, the bank destination to still satisfy the rules below, and the current total to match the saved amount. |
| **Reverse** | A new Reversal requires a Posted Provider settlement. Repeating a Reverse request for an already Reversed Provider settlement returns the existing result without creating another Reversal. The shared reversal path, used by all journal reversals, loads its original bank and Clearing accounts again and requires both to exist and be postable, so a soft-deleted or non-postable account makes Reverse fail. The current account-management APIs provide no way to delete accounts or change their postability. Reverse is exempt from provider-clearing eligibility checks: the current Payment Method mapping and provider-clearing flag are not rechecked. |
| **Discard** | The Provider settlement is a Draft. Posted and Reversed Provider settlements cannot be discarded. |

The list and detail screens disable Post when a Draft's Clearing account is no longer flagged. The form disables Save while any Needs attention row remains.

[PR #1287](https://github.com/blur88/erp2/pull/1287) records that Reverse is exempt from provider-clearing eligibility checks. This exemption concerns the current Payment Method mapping and provider-clearing flag; the shared reversal path still enforces account existence and postability, as clarified in [#1460](https://github.com/blur88/erp2/issues/1460#issuecomment-6398386329).

An Edit may infer a different Payment Method when the complete selection changes. An empty selection is not a saved Draft; discard the Draft instead.

## Eligible Payments and groups

The Provider settlement eligibility query uses these checks:

- The Payment date is on or before the Provider settlement date.
- A matching journal entry exists for that Payment, Sales order, and expected posting type, with no reversal pointer and no separate journal entry reversing it. This `EXISTS` check does not filter the journal entry's `deletedAt`.
- No unreleased Payment claim belongs to another Provider settlement. Edit and Post can read claims already held by that same Draft.

A separate derivation step requires exactly one live, unreversed matching journal entry for each Payment and validates its expected two-line shape and amounts. The picker then applies the Clearing account condition per Sales order + Payment Method group: every eligible Payment in the group must derive to the same live account, that account must have the provider-clearing flag, and the group's net must be non-zero. A soft-deleted journal entry can satisfy the initial `EXISTS` check, but it is excluded by the later derivation.

If a Clearing account is unflagged after a Draft is saved, the saved Draft and its lines remain unchanged. When its Edit form loads the claimed rows, a group is classified as `not_provider_clearing` only if it still has eligible Payments and a successful derivation finds the account unflagged; an ineligible group remains ineligible. The form marks those affected rows under **Needs attention** with “not a provider clearing payment — remove”; they can be removed but not accepted, as recorded in [PR #1287](https://github.com/blur88/erp2/pull/1287). Post rejects the Draft while its Clearing account lacks the flag.

The picker groups eligible Payments by **Sales order + Payment Method** and sums their signed amounts. A zero-net group is omitted. A negative group can appear as a deduction, for example when a Refund is recorded after the original Payment was already included in a Provider settlement. The combined selection still has to be positive.

Eligibility follows the original journal, not the Payment Method's current account mapping or enabled state. Remapping a method therefore does not redirect earlier Payments. A new Payment follows its own journal entry. A selection spanning more than one Clearing account cannot be saved as one Provider settlement.

## Accounts and journal entries

The Clearing account is derived from the original journal entry for every selected Payment. For a positive Payment, the entry must have exactly two lines: debit the Clearing account and credit the configured Customer Deposit account. For a negative Refund, it must debit Customer Deposit and credit the Clearing account. Each line carries the full absolute Payment amount on the appropriate side. A missing or reversed matching entry, more than one live matching entry, or a different line shape keeps the entire containing Sales order + Payment Method group off the picker and causes save or Post to fail.

The destination must be a live, active, postable account marked as a bank account, and it must not have the provider-clearing flag. It must differ from the derived Clearing account; otherwise the journal would debit and credit the same account and record no transfer, as described in [#1285](https://github.com/blur88/erp2/issues/1285).

Posting creates exactly two journal lines:

| Account | Posting |
|---|---|
| Bank account | Debit the Provider settlement amount |
| Clearing account | Credit the Provider settlement amount |

The journal entry date is the Provider settlement date. A Reversal uses the action date in the configured application timezone, following [#1134's](https://github.com/blur88/erp2/issues/1134) general posting-date convention. A code comment explains choosing the action date instead of the Provider settlement date; no linked issue or ADR records that date choice. The original journal entry and its financial lines are not changed; the Reversal is a separate entry.

## Payment claims and saved amounts

A Draft holds a Payment claim on every selected Sales order Payment. The database uniqueness rule allows each Payment to have only one unreleased claim at a time, reflecting [#1257's](https://github.com/blur88/erp2/issues/1257) requirement to prevent duplicate selection. Claims remain through Post. Each Edit hard-deletes all line rows within its transaction and inserts the full refreshed selection, including new lines for Payments that remain selected. A code comment explains that soft-deleting would leave the claim active; no linked issue or ADR records the hard-delete rule. Discard removes the Draft lines. A successful Reverse stamps the historical lines as released without deleting their amounts.

Each Provider settlement line stores the signed Payment amount as a snapshot. On Create and Edit, the server refreshes the requested groups and rejects a missing group, a zero net, or a net that differs from the submitted expected amount. It saves the complete current eligible Payment set for each requested group. On Post, it checks the exact saved Payment ID set and each saved amount against the current rows. A code comment explains why unchanged totals with changed Payments still fail and cites an uncommitted local spec; no linked issue or ADR records this rule.

## Concurrency behavior

For an existing Provider settlement, Edit, Discard, Post, and Reverse lock the header before checking its state. Create, Edit, and Post also lock the involved Sales orders FOR SHARE in ascending ID order before recomputing eligibility. A code comment explains why these locks precede recomputation and use FOR SHARE; neither the comment nor a linked issue or ADR explains the ascending ID order. The database claim rule decides races between two Provider settlements for the same Payment.

Provider settlement lines are inserted in ascending Payment ID order. A code comment says the consistent order keeps claim contention deadlock-free; no linked issue or ADR records that choice. A PostgreSQL deadlock during Create, Edit, or Post is returned as a retryable conflict; no linked issue or ADR records that mapping or a broader retry policy.

## Current behavior without a linked issue or ADR

Only behavior attributed above to an issue, PR, or code comment has recorded intent; every other rule in this document describes current code only.

- Payment claims have no automatic expiry.
- The Sales order's current lifecycle state is not checked by the Provider settlement eligibility query. Cancelling a Sales order does not itself remove its Payment from that query.

## Related issues

- [#1335 — Payment Method picker filter](https://github.com/blur88/erp2/issues/1335)
- [#1289 — historical methods in the Provider settlement list filter](https://github.com/blur88/erp2/issues/1289)
- [#1340 — General Ledger source links](https://github.com/blur88/erp2/issues/1340)
