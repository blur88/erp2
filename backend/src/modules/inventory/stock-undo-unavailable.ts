export const UNFULFILL_PRE_RECORDING =
  'This order was fulfilled before stock costs were recorded batch by batch, so its stock cost cannot be restored exactly. It cannot be unfulfilled.';

export const UNFULFILL_EVIDENCE_INCOMPLETE =
  "This order's recorded stock consumption is incomplete, so it cannot be unfulfilled exactly.";

export const RETURN_TO_READY_UNAVAILABLE =
  'Returning a received purchase order to Ready is unavailable: it would erase its stock and cost history. It will return once stock reversals keep that history.';
