export const UNFULFILL_PRE_RECORDING =
  'This order was fulfilled before stock costs were recorded batch by batch, so its stock cost cannot be restored exactly. It cannot be unfulfilled.';

export const UNFULFILL_EVIDENCE_INCOMPLETE =
  "This order's recorded stock consumption is incomplete, so it cannot be unfulfilled exactly.";

// #1406 receipt-reversal evidence refusals.
export const RECEIPT_LATER_DECREASE = (product: string, type: string, date: string): string =>
  `Cannot return to Ready: stock of ${product} has left since this receipt (${type} on ${date}). This does not mean this receipt's goods were used — the records cannot show that they were not.`;

export const RECEIPT_CHANGED_OUTSIDE_MOVEMENTS = (product: string): string =>
  `Cannot return to Ready: the stock of ${product} was changed outside stock movements since this receipt, so the records cannot show the received goods are still on hand.`;

export const RECEIPT_BATCH_TOUCHED = (product: string): string =>
  `Cannot return to Ready: stock received on this order for ${product} has been used.`;

export const RECEIPT_INSUFFICIENT_STOCK = (
  product: string,
  have: string,
  need: string,
): string =>
  `Cannot return to Ready: ${product} has ${have} in stock, less than the ${need} received.`;

export const RECEIPT_PRE_RECORDING = (reason: string): string =>
  `Cannot return to Ready: this order was received before stock history was complete, and the records cannot show its goods are untouched (${reason}).`;
