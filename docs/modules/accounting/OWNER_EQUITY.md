# Owner Equity

Current mechanics of Owner equity documents (#1435): when each action is allowed, how document and Payment status change, and which records and ledger effects are kept. Domain terms are defined in the [glossary](../../../GLOSSARY.md#documents).

## Recorded intent

- [Owner Equity feature issue #1022](https://github.com/blur88/erp2/issues/1022) records the intent to keep owner money and inventory movements in a dedicated workflow instead of recording them as Expenses or hidden Chart of Accounts opening-balance Journal entries. It defines Capital injection, Cash drawing and Stock drawing as separate types, their ledger accounts, cost-based stock treatment, and no Delete action.
- [Issue #1094](https://github.com/blur88/erp2/issues/1094) records the monetary completion change: exact full payment reaches Completed, and a full Refund returns the document to Draft and Unpaid. Its acceptance criteria also included Stock drawing in the auto-completion request. The merged [PR #1095, “Scope correction”](https://github.com/blur88/erp2/pull/1095) narrows that request: Stock drawings have no Payment lifecycle, so their Complete/Uncomplete workflow remains unchanged. PR #1095 records that this correction was raised and confirmed before implementation.
- [Issue #1096](https://github.com/blur88/erp2/issues/1096) allows Refunds through any active payment method and caps the total against net paid, regardless of the methods used for the original Payments.
- [Issue #1237](https://github.com/blur88/erp2/issues/1237) makes a Payment method's mapped Chart of Accounts account the posting account, with its Cash or Bank channel's configured account as fallback when no mapping exists. This applies to Owner Equity Payments and Refunds.
- [Issues #1132](https://github.com/blur88/erp2/issues/1132) and [#1134](https://github.com/blur88/erp2/issues/1134) specify that Stock drawing Journal entries and their reversals use the Complete or Uncomplete action date, resolved in the configured application timezone.

The rules below describe current code. Where a tracked decision does not explain a behavior, that limit is stated instead of supplying a rationale.

## Owner equity types and ledger effects

| Type | What it records | Journal entry |
|---|---|---|
| **Capital injection** | Money the owner puts into the business. It has a positive amount and may have Payments. | Each Payment debits the account mapped to its payment method, or the channel's configured Cash or Bank account if it has no mapping, and credits the configured Owner Capital account. A Refund debits Owner Capital and credits the account selected by the Refund's method. |
| **Cash drawing** | Money the owner takes from the business for personal use. It has a positive amount and may have Payments. | Each Payment debits the configured Owner Drawings account and credits the account mapped to its payment method, or the channel's configured Cash or Bank account if it has no mapping. A Refund credits Owner Drawings and debits the account selected by the Refund's method. |
| **Stock drawing** | Inventory the owner takes for personal use. It has a stocked Product and a positive quantity, but no amount or Payments. | Complete removes inventory at the Product's `baseCost` and, when total cost is positive, debits Owner Drawings and credits Inventory. Uncomplete writes a compensating Stock movement and, if Complete posted a Journal entry, writes an entry with the opposite lines. |

The configured Owner Capital and Owner Drawings accounts are read through accounting settings. A payment method's `CASH` or `BANK` channel determines the fallback account only. An explicit mapping can select any active, postable Chart of Accounts account, regardless of channel. An existing invalid mapping causes posting to fail; it does not fall back. [Issue #1237](https://github.com/blur88/erp2/issues/1237) records mapped-account use and fallback when unmapped. The [lookup comment](../../../backend/src/modules/accounting/services/accounting-lookup.service.ts#L43-L50) records the fail-on-invalid behavior and its reason: falling back could silently send a payment to a different default account.

## When each action is allowed

| Action | Allowed when | Result |
|---|---|---|
| Create | The amount is greater than zero for a Capital injection or Cash drawing. For a Stock drawing, quantity must be greater than zero and the Product must exist and be a stocked Product. | Creates a Draft with a generated Owner Equity reference. Monetary documents start Unpaid with their full amount remaining. |
| Edit | The document is Draft. Its type cannot be changed. Monetary total must be positive and cannot be less than net paid. Stock quantity must be positive; a changed Product must exist and be stocked. | Updates the Draft. Reducing a monetary total to exactly net paid derives Completed. |
| Record a Payment (`POST .../settle`) | The document is a monetary Draft, not Completed or Cancelled. Every line is positive and the batch total does not exceed the remaining balance. A Capital injection accepts any active payment method; a Cash drawing requires an active method enabled for purchases. | Adds one Payment row and corresponding Journal entry per line. Exact full payment derives Completed; partial payment leaves the document Draft. |
| Refund | The document is monetary and not Cancelled; it may be Draft or Completed. Each line is positive, and the batch total does not exceed current net paid. Each selected payment method must be active. It need not match the method used for an earlier Payment. | Stores each Refund as a negative Payment row and posts the opposite lines through the selected method. If net paid falls below the document total, status returns to Draft; a full Refund makes it Unpaid. |
| Complete | The document is a Stock drawing in Draft. The Product still exists and is stocked, and current available stock is at least the requested quantity. The Product row is locked while stock is checked and changed. | Writes an outbound Stock movement, stores unit and total cost, and sets the document to Completed. A positive total cost also creates its Journal entry. |
| Uncomplete | The document is a Completed Stock drawing and its Product still exists. | Writes a compensating inbound Stock movement and, if Complete posted a Journal entry, posts an entry with the opposite lines. It clears cost and completion metadata and returns the document to Draft. |
| Cancel | The document is Draft and its current net paid amount is zero. | Sets the document to Cancelled and keeps it on record. |
| Uncancel | The document is Cancelled. | Returns it to Draft. |

The original #1022 feature issue says Cancel is for an “unsettled Draft.” Current code checks that net paid is zero, not that the document has no Payment history. A fully refunded Draft therefore meets the current Cancel guard. No later tracked decision explains that broader condition.

There is no Delete endpoint or Delete action; Cancel is the available way to set a document aside, consistent with #1022.

## Document status and Payment status

Monetary documents have two independent statuses. The Payment status is derived from the signed sum of their Payment rows:

| Payment status | Current net paid |
|---|---:|
| Unpaid (`UNSETTLED`) | Zero or less |
| Partially paid (`PARTIAL`) | Greater than zero and less than the document total |
| Paid (`SETTLED`) | Exactly the document total |
| Overpaid (`OVERSETTLED`) | More than the document total |

The normal Payment action prevents overpayment by checking the batch against the remaining balance. The code retains an Overpaid value for imported or repair data; if one is present, it remains Draft. This exception is described in the [OwnerEquityService comment](../../../backend/src/modules/owner-equity/services/owner-equity.service.ts#L307-L326); no separate tracked design decision records that rationale.

The transitions are:

```text
Monetary:
Draft + Unpaid ──partial Payment──> Draft + Partially paid
Draft + Unpaid or Partially paid ──Payment to exact total──> Completed + Paid
Draft + Partially paid ──Edit total to net paid──> Completed + Paid
Completed + Paid ──Refund──> Draft + Unpaid or Partially paid
Draft + Partially paid ──Refund──> Draft + Unpaid or Partially paid

Draft + Unpaid ──Cancel──> Cancelled + Unpaid ──Uncancel──> Draft + Unpaid

Stock:
Draft ──Complete──> Completed ──Uncomplete──> Draft
  └────Cancel────> Cancelled ──Uncancel──────> Draft
```

A monetary document can also become Completed when Edit reduces its total to the amount already paid. Refund remains allowed on Completed monetary documents; any Refund that lowers net paid below the total returns them to Draft. Cancelled is preserved by automatic status derivation and can leave that state only through Uncancel.

## Stored invariants and posting details

- The document type fixes its data shape. Capital injections and Cash drawings have amount, net paid, balance and Payment status fields, with no Product, quantity or stock cost. Stock drawings have a Product and quantity, with no monetary or Payment status fields. The database checks enforce those shapes, positive amount/quantity, nonnegative costs, and require Stock drawing costs when it is Completed.
- A Completed document must have both `completedAt` and `completedBy`; every non-Completed document must have neither. The transition and these fields are written together. Entering Completed stamps them; leaving Completed clears them; staying Completed preserves the original stamp.
- Payment and Refund rows are the source for monetary totals. Refund rows have negative amounts; totals, balance, Payment status, document status and completion metadata are recomputed in the same transaction while the document row is locked.
- New Refund rows have no source-Payment link. The signed amount identifies a Refund; the older `sourceSettlementId` is retained for historical rows from before #1096.
- Each monetary Payment and Refund Journal entry uses that row's date. Stock drawing completion and reversal use their respective action instants in the configured application timezone (#1132, #1134), not the document's `equityDate`.
- Stock availability is rechecked under a Product lock at Complete time. Uncomplete uses a compensating Stock movement instead of resetting stock to an earlier balance, so intervening Stock movements are preserved. The [stock service comment](../../../backend/src/modules/owner-equity/services/owner-equity-stock.service.ts#L154-L157) explains this behavior; no separate tracked decision records the rationale.

When a Stock drawing's total cost is zero, current code still removes the stock and completes the document but writes no Journal entry. The [stock service comment](../../../backend/src/modules/owner-equity/services/owner-equity-stock.service.ts#L105-L108) calls a zero-value Journal entry meaningless; no tracked design decision records that choice. Stored monetary values and quantity use four decimal places, while Journal entry amounts are quantized to cents. No tracked decision explains that precision difference.

## Storage

| Table | Holds |
|---|---|
| `owner_equity_documents` | One header per Owner equity document, including type-specific fields, document status and derived Payment status. |
| `owner_equity_settlements` | Monetary Payment and Refund rows, each with date, signed amount and payment method. |

Stock movements and Journal entries keep the inventory and ledger effects. The owner-equity module writes those records through the inventory movement service and accounting posting port.
