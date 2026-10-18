# Stock correction support procedure (#1405 + #1406)

**Release status:** this procedure applies only after #1405 and #1406 have both
been deployed. The deploy remains gated on review of the preflight and an
explicit decision about whether independent evidence supports an
`STOCK_EVIDENCE_HORIZON` value. The default is unset.

## What can be corrected

| Case | Supported action | When it can succeed |
|---|---|---|
| Sales order was fulfilled in error | **Unfulfill** from the sales order detail or list | The order has a recorded fulfilment occurrence and its stock, batch-consumption provenance, and accounting values prove an exact reversal. Pre-deploy fulfilments have no such occurrence and are refused. |
| Purchase order was received in error | **Return** from the purchase order detail or list | The evidence assessment proves the receipt's products have not decreased since receipt, batches remain untouched, stock still reconciles, and any legacy receipt meets the approved evidence-horizon and strict-shape rules. The server decides eligibility. |

Both actions require a reason of 3–500 trimmed characters. A successful action
adds linked reversal records; it does not delete or rewrite the original
movements, batches, provenance, occurrence, or journal entries. Unfulfil
restores the recorded cost-batch quantities and reverses the original revenue
and COGS entries. Return restores the PO to Ready and reverses its receipt
entry.

## What remains refused

- A sales order fulfilled before batch-by-batch stock costs were recorded, or
  whose occurrence, provenance, valuation, or batch capacity evidence is
  incomplete.
- A received PO whose evidence cannot establish that the receipt is untouched:
  any later stock decrease, outside-movement stock edit, changed receipt batch,
  insufficient stock, ambiguous movement order, or legacy receipt that fails
  the strict journal/movement/batch shape.
- Every pre-deploy receipt while `STOCK_EVIDENCE_HORIZON` is unset. A set
  horizon is only a restriction on which legacy receipts may be considered; it
  is **not proof** that history is complete.
- Any case whose supporting records are missing, inconsistent, or ambiguous.

The refusal is deliberate. The preflight's dates and the absence of detected
gaps cannot establish a complete history. Do not infer eligibility from the
current stock quantity alone.

## Who handles a request

1. Sales, procurement, or inventory staff report the affected order and the
   business correction required.
2. A manager or administrator verifies that the document and requested
   correction are appropriate.
3. An authorized user attempts Unfulfill or Return in the application and
   supplies the reason. The server performs the final evidence checks.
4. If accepted, confirm the order status and stock after the mutation. The
   application writes the linked accounting and audit reversals in the same
   transaction.
5. If refused, preserve the exact server message and follow the tracking
   procedure below. Do not retry by changing stock directly or by bypassing
   the UI/API checks.

## Tracking a refused case

Create or update a GitHub issue labelled `stock-correction-pending`, linked
from the #1398 tracking issue. Record:

- sales or purchase order number and type;
- date reported, affected products and quantities;
- the requested business correction and the decision-maker;
- the exact server refusal text and any relevant preflight finding;
- known payments/refunds or actions already taken outside the application;
- owner and next review date.

Do not make direct database edits, delete stock history, or use a stock
adjustment as a substitute for an order correction. A separately required
physical-count adjustment follows the normal stock-adjustment procedure and
does not change the order's status or reverse its accounting.

## Evidence horizon and release gate

Before release, run `backend/scripts/preflight-stock-correction-path.sql` on the
target database and retain its complete output with the deployment record. The
preflight reports order counts, legacy receipt-shape failures, stock-balance
mismatches, earliest journal/audit timestamps, unmatched correction
audit/reversal records, and products carrying batches or stock history. It is
read-only. Its timestamps and lack of findings are not independent evidence of
completeness.

Keep `STOCK_EVIDENCE_HORIZON` unset unless evidence outside these stock tables
supports complete history from a specific instant. Any proposed value requires
recorded approval by the owner/authorized approver, the date, the exact value,
and the independent evidence relied on. Without that approval, pre-deploy
receipts remain refused.

After deploying #1405 and #1406 together, run
`backend/scripts/postcheck-stock-correction-path.sql`. Any `FAIL` is a
stop-and-investigate result. Use the procedure above for correction requests;
do not interpret a passing postcheck as approval to set the evidence horizon.
