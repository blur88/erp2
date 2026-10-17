# Stock undo support procedure (DRAFT — release gate for #1398 P4 stage 0)

Status: **draft, not accepted.** Researched from `main` at 3d3d3e423 on
2026-10-17. Conclusion first: **no case below has a complete correction
through supported actions.** Stage 0 removes the only path that corrected
stock, accounting and document status together (the destructive undo). Before
deployment the user decides: accelerate a safe correction path, or accept the
restriction explicitly.

**Decided 2026-10-17:** the restriction is **not** accepted as the sole remedy.
A safe, non-destructive correction path is tracked in **#1406** (scope
approved; not implemented) and is to be released together with stage 0. This
document is rewritten for that combined release before it can be accepted as
the release gate.

## What the application offers today (supported actions only)

| Action | Effect on stock | Ledger effect | Limits |
|---|---|---|---|
| Stock adjustment, increase / decrease | changes `stockQuantity`, writes a movement | Dr Inventory / Cr **default expense** account, or the reverse, at the line's entered unit cost | does **not** touch cost batches (§3.2 of the design), so the batches drift; does not change any order |
| Sales order refund (`POST /sales-orders/:id/refunds`) | none | `postSalesRefund` (cash/bank out, against the order) | **backend accepts it on a FULFILLED order**; the UI disables the button, with the tooltip "Cannot refund a fulfilled order." (#1405). Order stays FULFILLED; `paymentStatus` drops to PARTIAL/UNPAID |
| PO refund / unpay | — | — | **refused** on RECEIVED by the backend (`purchase-order.service.ts:835`, `:1048`) |
| Expenses, owner equity | — | their own postings | not designed for these cases; using them would misstate the accounts |
| Manual journal entry | — | — | **does not exist** in the rebuilt accounting |

No sales-return, credit-note or supplier-return flow exists.

## Cases

### 1. Mistaken fulfilment (order marked fulfilled, goods not delivered)

- **Who:** inventory staff raise it; a manager or admin decides; admin handles
  the accounting side.
- **Supported actions:** stock adjustment increase for the quantity, at the
  order's cost. That puts stock back, but the value is the entered unit cost,
  not the COGS posted, and it goes to the default expense account, not back
  through COGS.
- **Still wrong afterwards:**
  - order status stays FULFILLED; revenue and COGS stay recognised;
  - customer metrics count the order (#1355);
  - the cost batches are not restored (the batch remaining quantity stays low);
  - the adjustment's expense credit only approximately offsets the COGS.
- **Not acceptable as a fix:** stock adjustment alone (user, 2026-10-17).
- **Verdict:** no complete procedure.

### 2. Mistaken receipt (PO marked received, goods not received)

- **Who:** procurement staff raise it; manager or admin decides; admin on the
  accounting side.
- **Supported actions:** stock adjustment decrease for the quantity.
- **Still wrong afterwards:**
  - PO stays RECEIVED, with its inventory receipt posting;
  - the PO's cost batch keeps its remaining quantity, so the batches overstate
    stock (the adjustment does not consume batches);
  - the decrease posts to the default expense account, not against the
    supplier;
  - the supplier payment cannot be refunded or unpaid (case 4).
- **Verdict:** no complete procedure.

### 3. Refund of a fulfilled sales order

- **Who:** sales staff raise it; admin approves.
- **Supported actions:** none in the UI. The API endpoint accepts it, but
  using the API outside the UI is not a supported procedure, and the order
  would stay FULFILLED with revenue recognised and a refund posted against it.
- **Refunding the payment alone does not correct the fulfilment, the stock or the COGS** (user, 2026-10-17).
- **Verdict:** no complete procedure. *Possible narrow path to discuss:* allow
  the refund button on FULFILLED orders. That is a product change outside stage
  0's scope, and it still leaves revenue and stock uncorrected for returned
  goods.

### 4. Refund or unpay of a received purchase order

- **Who:** procurement staff raise it; admin approves.
- **Supported actions:** none. Both are refused by the backend on RECEIVED.
- **Verdict:** no procedure.

## Tracking what stays unresolved

Until a safe correction path exists, each occurrence is recorded and left
uncorrected in the application:

- a GitHub issue per occurrence, labelled `stock-correction-pending`, with the
  document number, date, quantities, amounts posted, who reported it and the
  business decision taken outside the system (e.g. goods kept, refund paid
  by bank transfer);
- linked from a tracking issue under #1398 so stage 4's correction workflow
  can work through the backlog;
- no direct database edits, no revived undo.

## Decision needed before deployment

**Owner decision (2026-10-17):** option 1 alone is **not** accepted. A smaller safe correction path is to be brought forward (option 2); its minimum scope and feasibility are proposed first, not implemented. Stage 0 stays blocked from merge and deployment until then.


1. **Accept the restriction** (with the tracking above) for the period until
   stages 1–3 ship; or
2. **Accelerate a safe correction path** — the smallest candidates:
   - a non-destructive "unfulfil" / "unreceive" that posts compensating
     movements and journal reversals and restores batches *only where the
     evidence is exact* (essentially pulling part of stage 3 forward under
     the old valuation rules); or
   - enabling sales refunds on fulfilled orders (case 3 only).
