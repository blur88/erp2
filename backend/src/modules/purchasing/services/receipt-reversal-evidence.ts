import { EntityManager } from 'typeorm';
import type { PurchaseOrder } from '../../../database/entities/purchase-order.entity';
import { toMinorUnits, quantizeToCents, formatScale4 } from '../../../common/utils/money';
import {
  RECEIPT_BATCH_TOUCHED,
  RECEIPT_CHANGED_OUTSIDE_MOVEMENTS,
  RECEIPT_INSUFFICIENT_STOCK,
  RECEIPT_LATER_DECREASE,
  RECEIPT_PRE_RECORDING,
} from '../../inventory/stock-undo-unavailable';

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
  movementId: string;
  batchId: string;
  quantityMinor: bigint;
  valueScale8: bigint;
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

interface MovementRow {
  id: string;
  productId: string;
  movementType: string;
  quantity: string;
  previousBalance: string;
  newBalance: string;
  totalValue: string | null;
  createdAt: Date;
  movementDate: Date;
  productSequence: string | null;
  referenceType: string | null;
  occurrenceId: string | null;
}

interface BatchRow {
  id: string;
  productId: string;
  receivedQuantity: string;
  remainingQuantity: string;
  landedCost: string;
  reversedAt: Date | null;
  occurrenceId: string | null;
}

const MOVEMENT_SELECT = `id, "productId", "movementType", quantity::text AS quantity,
  "previousBalance"::text AS "previousBalance", "newBalance"::text AS "newBalance",
  "totalValue"::text AS "totalValue", "createdAt", "movementDate",
  "productSequence"::text AS "productSequence", "referenceType", "occurrenceId"`;

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

const MISMATCH = () =>
  ({ ok: false, message: RECEIPT_PRE_RECORDING('its stock records do not match its receipt entry') }) as const;

export async function assessReceiptReversal(
  manager: EntityManager,
  po: PurchaseOrder,
  horizon: Date | null,
): Promise<ReceiptReversalAssessment> {
  const items = po.items ?? [];
  if (items.length === 0) return MISMATCH();

  const live: { id: string; occurredAt: Date; postedAmount: string | null }[] = await manager.query(
    `SELECT id, "occurredAt", "postedAmount"::text AS "postedAmount"
       FROM stock_occurrences
      WHERE "documentType" = 'purchase_order' AND "documentId" = $1 AND kind = 'receipt'
        AND NOT EXISTS (
          SELECT 1 FROM stock_occurrences r WHERE r."reversesOccurrenceId" = stock_occurrences.id
        )`,
    [po.id],
  );

  if (live.length > 1) return MISMATCH();
  return live.length === 1
    ? assessNewReceipt(manager, po, items, live[0])
    : assessLegacyReceipt(manager, po, items, horizon);
}

async function assessNewReceipt(
  manager: EntityManager,
  po: PurchaseOrder,
  items: any[],
  occurrence: { id: string; occurredAt: Date; postedAmount: string | null },
): Promise<ReceiptReversalAssessment> {
  const movements: MovementRow[] = await manager.query(
    `SELECT ${MOVEMENT_SELECT} FROM stock_movements WHERE "occurrenceId" = $1`,
    [occurrence.id],
  );
  const batches: BatchRow[] = await manager.query(
    `SELECT id, "productId", "receivedQuantity"::text AS "receivedQuantity",
            "remainingQuantity"::text AS "remainingQuantity", "landedCost"::text AS "landedCost",
            "reversedAt", "occurrenceId"
       FROM purchase_cost_history WHERE "occurrenceId" = $1`,
    [occurrence.id],
  );

  const [entry] = await manager.query(
    `SELECT id FROM journal_entry
      WHERE "sourceEventId" = $1 AND "postingType" = 'PURCHASE_RECEIVE' AND "reversalOfEntryId" IS NULL`,
    [occurrence.id],
  );
  if (!entry) return MISMATCH();
  const entryDebitMinor = await readEntryDebitMinor(manager, entry.id);

  const lines: ReceiptReversalLine[] = [];
  let movementsTotalMinor = 0n;
  for (const item of items) {
    const movement = movements.find((m) => m.productId === item.productId);
    const batch = batches.find((b) => b.productId === item.productId);
    if (!movement || !batch || !item.product) return MISMATCH();
    const valueMinor = movement.totalValue == null ? 0n : toMinorUnits(movement.totalValue);
    movementsTotalMinor += valueMinor;
    lines.push({
      productId: item.productId,
      productName: item.product.name,
      movementId: movement.id,
      batchId: batch.id,
      quantityMinor: toMinorUnits(movement.quantity),
      valueScale8: valueMinor * 10000n,
    });
  }

  const postedMinor = occurrence.postedAmount == null ? 0n : toMinorUnits(occurrence.postedAmount);
  if (movementsTotalMinor !== postedMinor || postedMinor !== entryDebitMinor) return MISMATCH();

  for (const item of items) {
    const movement = movements.find((m) => m.productId === item.productId)!;
    const batch = batches.find((b) => b.productId === item.productId)!;
    const refusal = await assessProductAfterReceipt(manager, {
      productId: item.productId,
      productName: item.product.name,
      receiptMovement: movement,
      batches: [batch],
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
  items: any[],
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
    `SELECT id, "productId", "receivedQuantity"::text AS "receivedQuantity",
            "remainingQuantity"::text AS "remainingQuantity", "landedCost"::text AS "landedCost",
            "reversedAt", "occurrenceId"
       FROM purchase_cost_history WHERE "purchaseOrderId" = $1 AND "occurrenceId" IS NULL`,
    [po.id],
  );
  const movements: MovementRow[] = await manager.query(
    `SELECT ${MOVEMENT_SELECT} FROM stock_movements
      WHERE "referenceType" = 'purchase_order' AND "referenceId" = $1 AND "movementType" = 'purchase_receipt'`,
    [po.id],
  );

  const lines: ReceiptReversalLine[] = [];
  let expectedScale8 = 0n;
  for (const item of items) {
    const batch = batches.find((b) => b.productId === item.productId);
    const movement = movements.find((m) => m.productId === item.productId);
    if (!batch || !movement || !item.product) return MISMATCH();
    if (toMinorUnits(batch.receivedQuantity) !== toMinorUnits(String(item.quantity))) return MISMATCH();
    if (toMinorUnits(movement.quantity) !== toMinorUnits(String(item.quantity))) return MISMATCH();
    const qtyMinor = toMinorUnits(batch.receivedQuantity);
    const landedMinor = toMinorUnits(batch.landedCost);
    expectedScale8 += qtyMinor * landedMinor;
    lines.push({
      productId: item.productId,
      productName: item.product.name,
      movementId: movement.id,
      batchId: batch.id,
      quantityMinor: qtyMinor,
      valueScale8: qtyMinor * landedMinor,
    });
  }

  if (quantizeToCents((expectedScale8 + 5000n) / 10000n) !== entryDebitMinor) return MISMATCH();

  for (const item of items) {
    const movement = movements.find((m) => m.productId === item.productId)!;
    const batch = batches.find((b) => b.productId === item.productId)!;
    const productName = item.product.name;

    // A rewrite anywhere in the product's history makes the chain untrustworthy.
    if (await hasRewriteIndicator(manager, item.productId)) {
      return {
        ok: false,
        message: RECEIPT_PRE_RECORDING(`stock history for ${productName} may have been rewritten`),
      };
    }

    const chainRefusal = await assessLegacyChain(manager, item.productId, productName, movement.id);
    if (chainRefusal) return { ok: false, message: chainRefusal };

    const refusal = await assessProductAfterReceipt(manager, {
      productId: item.productId,
      productName,
      receiptMovement: movement,
      batches: [batch],
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
  receiptMovementId: string,
): Promise<string | null> {
  const breakMsg = RECEIPT_PRE_RECORDING(
    `the order of ${productName}'s earlier stock movements cannot be established`,
  );
  const rows: MovementRow[] = await manager.query(
    `SELECT ${MOVEMENT_SELECT} FROM stock_movements WHERE "productId" = $1
      ORDER BY "createdAt" ASC, id ASC`,
    [productId],
  );
  const legacy = rows.filter((r) => r.productSequence == null);
  if (legacy.length === 0) return breakMsg;
  for (let i = 1; i < legacy.length; i += 1) {
    if (new Date(legacy[i].createdAt).getTime() === new Date(legacy[i - 1].createdAt).getTime()) {
      return breakMsg;
    }
  }
  if (toMinorUnits(legacy[0].previousBalance) !== 0n) return breakMsg;
  for (let i = 1; i < legacy.length; i += 1) {
    if (toMinorUnits(legacy[i].previousBalance) !== toMinorUnits(legacy[i - 1].newBalance)) {
      return breakMsg;
    }
  }
  if (legacy[legacy.length - 1].id !== receiptMovementId) return breakMsg;
  return null;
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

  // R5 stock covers it.
  const receivedMinor = toMinorUnits(batches[0]?.receivedQuantity ?? '0');
  if (stockMinor < receivedMinor) {
    return RECEIPT_INSUFFICIENT_STOCK(
      productName,
      formatScale4(stockMinor),
      formatScale4(receivedMinor),
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
