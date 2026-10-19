import { EntityManager } from 'typeorm';
import type { PurchaseOrder } from '../../../database/entities/purchase-order.entity';
import {
  allocateCents,
  toMinorUnits,
  quantizeToCents,
  formatScale4,
} from '../../../common/utils/money';
import {
  RECEIPT_BATCH_TOUCHED,
  RECEIPT_CHANGED_OUTSIDE_MOVEMENTS,
  RECEIPT_INSUFFICIENT_STOCK,
  RECEIPT_LATER_DECREASE,
  RECEIPT_PRE_RECORDING,
} from '../../inventory/stock-undo-unavailable';
import {
  hasAggregateReceiptStockCoverage,
  matchReceiptLines,
  type ReceiptBatchEvidence,
  type ReceiptLineItem,
  type ReceiptLineMapping,
  type ReceiptMovementEvidence,
} from './receipt-line-matcher';
import { RECEIPT_LINE_EVIDENCE_VERSION } from '../../../database/entities/stock-occurrence.entity';

/**
 * Read-only, fail-closed assessment of whether a received purchase order can be
 * returned to Ready without erasing evidence (#1406).
 *
 * The caller has already locked the purchase order row and the products it
 * touches; this function only reads (the lock is what makes the reads stable)
 * and returns either a plan describing exactly what to reverse, or the first
 * refusal reason. Anything it cannot evaluate refuses.
 */
export interface ReceiptReversalLine {
  productId: string;
  productName: string;
  purchaseOrderItemId: string;
  movementId: string;
  batchId: string;
  quantityMinor: bigint;
  movementValueMinor: bigint;
}

export type ReceiptReversalAssessment =
  | {
      ok: true;
      receipt: {
        occurrenceId: string | null;
        legacyEntryId: string | null;
        occurredAt: Date;
        lines: ReceiptReversalLine[];
      };
    }
  | { ok: false; message: string };

interface MovementRow extends ReceiptMovementEvidence {
  id: string;
  productId: string;
  movementType: string;
  quantity: string;
  unitValue: string | null;
  previousBalance: string;
  newBalance: string;
  totalValue: string | null;
  createdAt: Date;
  movementDate: Date;
  productSequence: string | null;
  referenceType: string | null;
  referenceId: string | null;
  occurrenceId: string | null;
}

interface BatchRow extends ReceiptBatchEvidence {
  id: string;
  purchaseOrderId: string | null;
  productId: string;
  receivedQuantity: string;
  remainingQuantity: string;
  unitCost: string;
  shippingPerUnit: string;
  landedCost: string;
  purchaseOrderItemId: string | null;
  reversedAt: Date | null;
  occurrenceId: string | null;
}

const MOVEMENT_SELECT = `id, "productId", "purchaseOrderItemId", "movementType", quantity::text AS quantity,
  "unitValue"::text AS "unitValue",
  "previousBalance"::text AS "previousBalance", "newBalance"::text AS "newBalance",
  "totalValue"::text AS "totalValue", "createdAt", "movementDate",
  "productSequence"::text AS "productSequence", "referenceType", "referenceId", "occurrenceId"`;

const MOVEMENT_LABELS: Record<string, string> = {
  purchase_receipt: 'Purchase Receipt',
  sales_return: 'Sales Return',
  sale_reversal: 'Sales Order Unfulfill',
  production_receipt: 'Production Receipt',
  transfer_in: 'Transfer In',
  adjustment_increase: 'Stock Increase',
  initial_stock: 'Initial Stock',
  sale: 'Sale',
  purchase_return: 'Purchase Return',
  production_consumption: 'Production Use',
  transfer_out: 'Transfer Out',
  adjustment_decrease: 'Stock Decrease',
  damage: 'Damage',
  expiry: 'Expiry',
  theft: 'Theft',
  loss: 'Loss',
  owner_drawing: 'Owner Drawing',
  owner_drawing_reversal: 'Owner Drawing Reversal',
  purchase_receipt_reversal: 'Purchase Receipt Reversal',
};

function movementLabel(type: string): string {
  return MOVEMENT_LABELS[type] ?? 'Unknown Movement';
}

function dateOnly(value: Date): string {
  return new Date(value).toISOString().slice(0, 10);
}

function groupReceiptLinesByProduct<T extends ReceiptLineMapping>(lines: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const line of lines) {
    const productLines = groups.get(line.item.productId) ?? [];
    productLines.push(line);
    groups.set(line.item.productId, productLines);
  }
  return groups;
}

function receiptMovementValuesMatchLines<
  Item extends ReceiptLineItem,
  Movement extends ReceiptMovementEvidence,
  Batch extends ReceiptBatchEvidence,
>(
  lines: ReceiptLineMapping<Item, Movement, Batch>[],
  postedMinor: bigint,
): boolean {
  try {
    const lineAllocations = allocateCents(
      postedMinor,
      lines.map(
        ({ batch }) => toMinorUnits(batch.receivedQuantity) * toMinorUnits(batch.landedCost),
      ),
    );
    return lines.every(
      (line, index) =>
        line.movement.totalValue != null &&
        toMinorUnits(line.movement.totalValue) === lineAllocations[index],
    );
  } catch {
    return false;
  }
}

function latestReceiptMovement(lines: MovementRow[]): MovementRow | null {
  if (lines.length === 0 || lines.some((line) => line.productSequence == null)) return null;
  return [...lines].sort((a, b) => {
    const difference = BigInt(a.productSequence!) - BigInt(b.productSequence!);
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  }).at(-1) as MovementRow;
}

const MISMATCH = () =>
  ({ ok: false, message: RECEIPT_PRE_RECORDING('its stock records do not match its receipt entry') }) as const;

export async function assessReceiptReversal(
  manager: EntityManager,
  po: PurchaseOrder,
  horizon: Date | null,
): Promise<ReceiptReversalAssessment> {
  const items = [...((po.items ?? []) as ReceiptLineItem[])].sort(
    (left, right) => (left.lineNumber ?? 0) - (right.lineNumber ?? 0),
  );
  if (items.length === 0) return MISMATCH();

  const live: {
    id: string;
    occurredAt: Date;
    postedAmount: string | null;
    receiptEvidenceVersion: number | null;
  }[] = await manager.query(
    `SELECT id, "occurredAt", "postedAmount"::text AS "postedAmount", "receiptEvidenceVersion"
       FROM stock_occurrences
      WHERE "documentType" = 'purchase_order' AND "documentId" = $1 AND kind = 'receipt'
        AND NOT EXISTS (
          SELECT 1 FROM stock_occurrences r WHERE r."reversesOccurrenceId" = stock_occurrences.id
        )`,
    [po.id],
  );

  if (live.length > 1) return MISMATCH();
  return live.length === 1
    ? assessOccurrenceReceipt(manager, po, items, live[0])
    : assessLegacyReceipt(manager, po, items, horizon);
}

async function assessOccurrenceReceipt(
  manager: EntityManager,
  po: PurchaseOrder,
  items: ReceiptLineItem[],
  occurrence: {
    id: string;
    occurredAt: Date;
    postedAmount: string | null;
    receiptEvidenceVersion: number | null;
  },
): Promise<ReceiptReversalAssessment> {
  const movements: MovementRow[] = await manager.query(
    `SELECT ${MOVEMENT_SELECT} FROM stock_movements WHERE "occurrenceId" = $1`,
    [occurrence.id],
  );
  const batches: BatchRow[] = await manager.query(
    `SELECT id, "purchaseOrderId", "productId", "purchaseOrderItemId",
            "receivedQuantity"::text AS "receivedQuantity", "remainingQuantity"::text AS "remainingQuantity",
            "unitCost"::text AS "unitCost", "shippingPerUnit"::text AS "shippingPerUnit",
            "landedCost"::text AS "landedCost", "reversedAt", "occurrenceId"
       FROM purchase_cost_history WHERE "occurrenceId" = $1`,
    [occurrence.id],
  );

  const lineMatch = matchReceiptLines(
    occurrence.receiptEvidenceVersion,
    po.id,
    items,
    movements,
    batches,
  );
  if (lineMatch.status !== 'matched') return MISMATCH();

  const [entry] = await manager.query(
    `SELECT id FROM journal_entry
      WHERE "sourceEventId" = $1 AND "postingType" = 'PURCHASE_RECEIVE' AND "reversalOfEntryId" IS NULL`,
    [occurrence.id],
  );
  if (!entry) return MISMATCH();
  const entryDebitMinor = await readEntryDebitMinor(manager, entry.id);

  const lines: ReceiptReversalLine[] = [];
  let movementsTotalMinor = 0n;
  let batchValueScale8 = 0n;
  for (const { item, movement, batch } of lineMatch.lines) {
    if (!item.product) return MISMATCH();
    const valueMinor = movement.totalValue == null ? 0n : toMinorUnits(movement.totalValue);
    movementsTotalMinor += valueMinor;
    const quantityMinor = toMinorUnits(batch.receivedQuantity);
    const landedCostMinor = toMinorUnits(batch.landedCost);
    batchValueScale8 += quantityMinor * landedCostMinor;
    lines.push({
      productId: item.productId,
      productName: item.product.name,
      purchaseOrderItemId: item.id,
      movementId: movement.id,
      batchId: batch.id,
      quantityMinor,
      movementValueMinor: toMinorUnits(movement.totalValue!),
    });
  }

  const postedMinor = occurrence.postedAmount == null ? 0n : toMinorUnits(occurrence.postedAmount);
  if (
    movementsTotalMinor !== postedMinor ||
    postedMinor !== entryDebitMinor ||
    !receiptMovementValuesMatchLines(lineMatch.lines, postedMinor) ||
    quantizeToCents((batchValueScale8 + 5000n) / 10000n) !== entryDebitMinor
  ) {
    return MISMATCH();
  }

  const productLines = groupReceiptLinesByProduct(lineMatch.lines);
  for (const [productId, productReceiptLines] of productLines) {
    const productName = productReceiptLines[0].item.product?.name;
    if (!productName) return MISMATCH();
    const productMovementIds = new Set(productReceiptLines.map((line) => line.movement.id));
    const receiptMovement = latestReceiptMovement(
      movements.filter((movement) => productMovementIds.has(movement.id)),
    );
    if (!receiptMovement) return MISMATCH();
    const refusal = await assessProductAfterReceipt(manager, {
      productId,
      productName,
      receiptMovement,
      batches: productReceiptLines.map((line) => line.batch),
      mode: 'new',
    });
    if (refusal) return { ok: false, message: refusal };
  }

  return {
    ok: true,
    receipt: {
      occurrenceId: occurrence.id,
      legacyEntryId: null,
      occurredAt: occurrence.occurredAt,
      lines,
    },
  };
}

async function assessLegacyReceipt(
  manager: EntityManager,
  po: PurchaseOrder,
  items: ReceiptLineItem[],
  horizon: Date | null,
): Promise<ReceiptReversalAssessment> {
  if (!horizon) {
    return { ok: false, message: RECEIPT_PRE_RECORDING('no evidence horizon has been approved') };
  }
  if (!po.receivedDate || new Date(po.receivedDate).getTime() < horizon.getTime()) {
    return { ok: false, message: RECEIPT_PRE_RECORDING('it was received before the evidence horizon') };
  }

  const originals: { id: string }[] = await manager.query(
    `SELECT id FROM journal_entry
      WHERE "sourceDocumentId" = $1 AND "postingType" = 'PURCHASE_RECEIVE' AND "reversalOfEntryId" IS NULL`,
    [po.id],
  );
  if (originals.length !== 1) return MISMATCH();
  const entryId = originals[0].id;
  const entryDebitMinor = await readEntryDebitMinor(manager, entryId);

  const batches: BatchRow[] = await manager.query(
    `SELECT id, "purchaseOrderId", "productId", "purchaseOrderItemId",
            "receivedQuantity"::text AS "receivedQuantity", "remainingQuantity"::text AS "remainingQuantity",
            "unitCost"::text AS "unitCost", "shippingPerUnit"::text AS "shippingPerUnit",
            "landedCost"::text AS "landedCost", "reversedAt", "occurrenceId"
       FROM purchase_cost_history WHERE "purchaseOrderId" = $1 AND "occurrenceId" IS NULL`,
    [po.id],
  );
  const movements: MovementRow[] = await manager.query(
    `SELECT ${MOVEMENT_SELECT} FROM stock_movements
      WHERE "referenceType" = 'purchase_order' AND "referenceId" = $1 AND "movementType" = 'purchase_receipt'`,
    [po.id],
  );

  const lineMatch = matchReceiptLines(null, po.id, items, movements, batches);
  if (lineMatch.status !== 'matched') return MISMATCH();

  const lines: ReceiptReversalLine[] = [];
  let expectedScale8 = 0n;
  let movementTotalMinor = 0n;
  for (const { item, movement, batch } of lineMatch.lines) {
    if (!item.product) return MISMATCH();
    const qtyMinor = toMinorUnits(batch.receivedQuantity);
    const landedMinor = toMinorUnits(batch.landedCost);
    expectedScale8 += qtyMinor * landedMinor;
    movementTotalMinor += toMinorUnits(movement.totalValue ?? '0');
    lines.push({
      productId: item.productId,
      productName: item.product.name,
      purchaseOrderItemId: item.id,
      movementId: movement.id,
      batchId: batch.id,
      quantityMinor: qtyMinor,
      movementValueMinor: toMinorUnits(movement.totalValue ?? '0'),
    });
  }

  if (
    quantizeToCents((expectedScale8 + 5000n) / 10000n) !== entryDebitMinor ||
    movementTotalMinor !== entryDebitMinor ||
    !receiptMovementValuesMatchLines(lineMatch.lines, entryDebitMinor)
  ) {
    return MISMATCH();
  }

  const productLines = groupReceiptLinesByProduct(lineMatch.lines);
  for (const [productId, productReceiptLines] of productLines) {
    const productName = productReceiptLines[0].item.product?.name;
    if (!productName) return MISMATCH();

    // A rewrite anywhere in the product's history makes the chain untrustworthy.
    if (await hasRewriteIndicator(manager, productId)) {
      return {
        ok: false,
        message: RECEIPT_PRE_RECORDING(`stock history for ${productName} may have been rewritten`),
      };
    }

    const chain = await assessLegacyChain(
      manager,
      productId,
      productName,
      productReceiptLines.map((line) => line.movement.id),
    );
    if ('refusal' in chain) return { ok: false, message: chain.refusal };
    const receiptMovement = movements.find((movement) => movement.id === chain.lastReceiptMovementId);
    if (!receiptMovement) return MISMATCH();

    const refusal = await assessProductAfterReceipt(manager, {
      productId,
      productName,
      receiptMovement,
      batches: productReceiptLines.map((line) => line.batch),
      mode: 'legacy',
    });
    if (refusal) return { ok: false, message: refusal };
  }

  return {
    ok: true,
    receipt: {
      occurrenceId: null,
      legacyEntryId: entryId,
      occurredAt: new Date(movements[0].createdAt),
      lines,
    },
  };
}

async function assessLegacyChain(
  manager: EntityManager,
  productId: string,
  productName: string,
  receiptMovementIds: string[],
): Promise<{ lastReceiptMovementId: string } | { refusal: string }> {
  const breakMsg = RECEIPT_PRE_RECORDING(
    `the order of ${productName}'s earlier stock movements cannot be established`,
  );
  const rows: MovementRow[] = await manager.query(
    `SELECT ${MOVEMENT_SELECT} FROM stock_movements WHERE "productId" = $1
      ORDER BY "createdAt" ASC, id ASC`,
    [productId],
  );
  const legacy = rows.filter((r) => r.productSequence == null);
  if (legacy.length === 0) return { refusal: breakMsg };
  for (let i = 1; i < legacy.length; i += 1) {
    if (new Date(legacy[i].createdAt).getTime() === new Date(legacy[i - 1].createdAt).getTime()) {
      return { refusal: breakMsg };
    }
  }
  if (toMinorUnits(legacy[0].previousBalance) !== 0n) return { refusal: breakMsg };
  for (let i = 1; i < legacy.length; i += 1) {
    if (toMinorUnits(legacy[i].previousBalance) !== toMinorUnits(legacy[i - 1].newBalance)) {
      return { refusal: breakMsg };
    }
  }
  const receiptTail = legacy.slice(-receiptMovementIds.length);
  if (
    receiptTail.length !== receiptMovementIds.length ||
    receiptTail.some((movement) => !receiptMovementIds.includes(movement.id))
  ) {
    return { refusal: breakMsg };
  }
  return { lastReceiptMovementId: receiptTail[receiptTail.length - 1].id };
}

async function assessProductAfterReceipt(
  manager: EntityManager,
  args: {
    productId: string;
    productName: string;
    receiptMovement: MovementRow;
    batches: BatchRow[];
    mode: 'new' | 'legacy';
  },
): Promise<string | null> {
  const { productId, productName, receiptMovement, batches, mode } = args;

  const movements: MovementRow[] = await manager.query(
    `SELECT ${MOVEMENT_SELECT} FROM stock_movements WHERE "productId" = $1
      ORDER BY "productSequence" ASC NULLS FIRST, "createdAt" ASC, id ASC`,
    [productId],
  );

  // Order check (before any capacity rule so ambiguity refuses first).
  if (mode === 'new') {
    const ambiguous = movements.some(
      (m) =>
        m.productSequence == null &&
        m.id !== receiptMovement.id &&
        new Date(m.createdAt).getTime() >= new Date(receiptMovement.createdAt).getTime(),
    );
    if (ambiguous) {
      return RECEIPT_PRE_RECORDING(
        `the order of ${productName}'s earlier stock movements cannot be established`,
      );
    }
  }

  const receiptSeq =
    receiptMovement.productSequence == null ? null : BigInt(receiptMovement.productSequence);
  const after =
    mode === 'new'
      ? movements.filter(
          (m) => m.productSequence != null && receiptSeq != null && BigInt(m.productSequence) > receiptSeq,
        )
      : movements.filter((m) => m.productSequence != null);

  // R2 no later decrease.
  const firstDecrease = after.find((m) => toMinorUnits(m.quantity) < 0n);
  if (firstDecrease) {
    return RECEIPT_LATER_DECREASE(
      productName,
      movementLabel(firstDecrease.movementType),
      dateOnly(new Date(firstDecrease.movementDate)),
    );
  }

  // R3 no change outside movements.
  const [product] = await manager.query(
    `SELECT "stockQuantity"::text AS "stockQuantity" FROM products WHERE id = $1`,
    [productId],
  );
  const stockMinor = product ? toMinorUnits(product.stockQuantity) : 0n;
  let afterSumMinor = 0n;
  for (const m of after) afterSumMinor += toMinorUnits(m.quantity);
  if (toMinorUnits(receiptMovement.newBalance) + afterSumMinor !== stockMinor) {
    return RECEIPT_CHANGED_OUTSIDE_MOVEMENTS(productName);
  }
  const auditRows: unknown[] = await manager.query(
    `SELECT 1 FROM audit_logs
      WHERE "entityType" = 'Product' AND "entityId" = $1 AND "createdAt" >= $2
        AND "newValues" IS NOT NULL AND "newValues" ? 'stockQuantity'
      LIMIT 1`,
    [productId, new Date(receiptMovement.createdAt)],
  );
  if (auditRows.length) return RECEIPT_CHANGED_OUTSIDE_MOVEMENTS(productName);

  // R4 batch untouched.
  for (const batch of batches) {
    if (
      batch.reversedAt != null ||
      toMinorUnits(batch.remainingQuantity) !== toMinorUnits(batch.receivedQuantity)
    ) {
      return RECEIPT_BATCH_TOUCHED(productName);
    }
  }

  // R5 is a defensive guard. Valid stock cannot reach this refusal: the receipt
  // movement's newBalance is at least receivedQuantity, R2 excludes later
  // decreases, and R3 reconciles the locked stock to that balance plus later
  // movements. Therefore no dedicated e2e manufactures an invalid balance;
  // keep this check fail-closed for inconsistent/corrupt records.
  const requiredReceiptQuantityMinor = batches.reduce(
    (sum, batch) => sum + toMinorUnits(batch.receivedQuantity),
    0n,
  );
  if (
    !hasAggregateReceiptStockCoverage(
      batches.map((batch) => ({ productId, batch })),
      new Map([[productId, formatScale4(stockMinor)]]),
    )
  ) {
    return RECEIPT_INSUFFICIENT_STOCK(
      productName,
      formatScale4(stockMinor),
      formatScale4(requiredReceiptQuantityMinor),
    );
  }

  return null;
}

async function hasRewriteIndicator(
  manager: EntityManager,
  productId: string,
): Promise<boolean> {
  const reversal = await manager.query(
    `SELECT 1 FROM journal_entry e
      WHERE e."reversalOfEntryId" IS NOT NULL
        AND e."postingType" IN ('SALES_FULFILLMENT_REVENUE','SALES_FULFILLMENT_COGS','PURCHASE_RECEIVE')
        AND (
          e."sourceDocumentId" IN (SELECT "salesOrderId" FROM sales_order_items WHERE "productId" = $1)
          OR e."sourceDocumentId" IN (SELECT "purchaseOrderId" FROM purchase_order_items WHERE "productId" = $1)
        )
      LIMIT 1`,
    [productId],
  );
  if (reversal.length) return true;

  const audit = await manager.query(
    `SELECT 1 FROM audit_logs a
      WHERE (a."description" LIKE 'Unfulfilled sales order:%' OR a."description" LIKE 'Returned purchase order:%')
        AND (
          a."entityId" IN (SELECT "salesOrderId" FROM sales_order_items WHERE "productId" = $1)
          OR a."entityId" IN (SELECT "purchaseOrderId" FROM purchase_order_items WHERE "productId" = $1)
        )
      LIMIT 1`,
    [productId],
  );
  if (audit.length) return true;

  const movement = await manager.query(
    `SELECT 1 FROM stock_movements WHERE "productId" = $1 AND "referenceType" = 'stock_movement_reversal' LIMIT 1`,
    [productId],
  );
  return movement.length > 0;
}

async function readEntryDebitMinor(manager: EntityManager, entryId: string): Promise<bigint> {
  const lines: { debit: string }[] = await manager.query(
    `SELECT debit::text AS debit FROM journal_entry_line WHERE "entryId" = $1`,
    [entryId],
  );
  return lines.reduce((sum, l) => sum + toMinorUnits(l.debit), 0n);
}
