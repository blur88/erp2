import { toMinorUnits } from '../../../common/utils/money';

export interface ReceiptLineItem {
  id: string;
  purchaseOrderId: string;
  productId: string;
  lineNumber?: number;
  quantity: string | number;
  totalAmount: string | number;
  product?: { name: string };
}

export interface ReceiptMovementEvidence {
  id: string;
  productId: string;
  movementType: string;
  purchaseOrderItemId: string | null;
  referenceType: string | null;
  referenceId: string | null;
  quantity: string;
  unitValue: string | null;
  totalValue: string | null;
}

export interface ReceiptBatchEvidence {
  id: string;
  purchaseOrderId: string | null;
  productId: string;
  purchaseOrderItemId: string | null;
  receivedQuantity: string;
  unitCost: string;
  shippingPerUnit: string;
  landedCost: string;
}

export interface ReceiptLineMapping<
  Item extends ReceiptLineItem = ReceiptLineItem,
  Movement extends ReceiptMovementEvidence = ReceiptMovementEvidence,
  Batch extends ReceiptBatchEvidence = ReceiptBatchEvidence,
> {
  item: Item;
  movement: Movement;
  batch: Batch;
}

export type ReceiptLineMatchResult<
  Item extends ReceiptLineItem = ReceiptLineItem,
  Movement extends ReceiptMovementEvidence = ReceiptMovementEvidence,
  Batch extends ReceiptBatchEvidence = ReceiptBatchEvidence,
> =
  | { status: 'matched'; lines: ReceiptLineMapping<Item, Movement, Batch>[] }
  | { status: 'mismatch' | 'ambiguous' };

export function matchReceiptLines<
  Item extends ReceiptLineItem,
  Movement extends ReceiptMovementEvidence,
  Batch extends ReceiptBatchEvidence,
>(
  evidenceVersion: number | null,
  purchaseOrderId: string,
  items: Item[],
  movements: Movement[],
  batches: Batch[],
): ReceiptLineMatchResult<Item, Movement, Batch> {
  if (items.length === 0 || movements.length !== items.length || batches.length !== items.length) {
    return { status: 'mismatch' };
  }
  if (new Set(items.map((item) => item.id)).size !== items.length) return { status: 'mismatch' };
  if (items.some((item) => item.purchaseOrderId !== purchaseOrderId)) return { status: 'mismatch' };

  if (evidenceVersion !== null && evidenceVersion !== 1) return { status: 'mismatch' };

  const identities = [
    ...movements.map((row) => row.purchaseOrderItemId),
    ...batches.map((row) => row.purchaseOrderItemId),
  ];
  const hasSomeIdentity = identities.some((id) => id != null);
  const hasAllIdentity = identities.every((id) => id != null);

  if (evidenceVersion === 1 && !hasAllIdentity) return { status: 'mismatch' };
  if (hasSomeIdentity && !hasAllIdentity) return { status: 'mismatch' };

  if (evidenceVersion === 1 || hasAllIdentity) {
    const lines: ReceiptLineMapping<Item, Movement, Batch>[] = [];
    for (const item of items) {
      const itemMovements = movements.filter((movement) => movement.purchaseOrderItemId === item.id);
      const itemBatches = batches.filter((costBatch) => costBatch.purchaseOrderItemId === item.id);
      if (itemMovements.length !== 1 || itemBatches.length !== 1) return { status: 'mismatch' };
      const movement = itemMovements[0];
      const costBatch = itemBatches[0];
      if (!matchesLine(purchaseOrderId, item, movement, costBatch)) return { status: 'mismatch' };
      lines.push({ item, movement, batch: costBatch });
    }
    return { status: 'matched', lines };
  }

  return matchHistoricalReceiptLines(purchaseOrderId, items, movements, batches);
}

export function hasAggregateReceiptStockCoverage(
  lines: Array<{ productId: string; batch: ReceiptBatchEvidence }>,
  stockByProduct: ReadonlyMap<string, string>,
): boolean {
  const requiredByProduct = new Map<string, bigint>();
  try {
    for (const line of lines) {
      const quantity = toMinorUnits(line.batch.receivedQuantity);
      requiredByProduct.set(line.productId, (requiredByProduct.get(line.productId) ?? 0n) + quantity);
    }
    for (const [productId, required] of requiredByProduct) {
      const available = stockByProduct.get(productId);
      if (available == null || toMinorUnits(available) < required) return false;
    }
  } catch {
    return false;
  }
  return true;
}

function matchHistoricalReceiptLines<
  Item extends ReceiptLineItem,
  Movement extends ReceiptMovementEvidence,
  Batch extends ReceiptBatchEvidence,
>(
  purchaseOrderId: string,
  items: Item[],
  movements: Movement[],
  batches: Batch[],
): ReceiptLineMatchResult<Item, Movement, Batch> {
  const candidates = items.map((item) =>
    movements.flatMap((movement) =>
      batches
        .filter((costBatch) => matchesLine(purchaseOrderId, item, movement, costBatch, true))
        .map((costBatch) => ({ item, movement, batch: costBatch })),
    ),
  );
  if (candidates.some((forItem) => forItem.length === 0)) return { status: 'mismatch' };

  let solution: ReceiptLineMapping<Item, Movement, Batch>[] | null = null;
  let solutionCount = 0;
  const selected: ReceiptLineMapping<Item, Movement, Batch>[] = [];
  const usedMovements = new Set<string>();
  const usedBatches = new Set<string>();

  const visit = (itemIndex: number): void => {
    if (solutionCount > 1) return;
    if (itemIndex === items.length) {
      solutionCount += 1;
      if (solutionCount === 1) solution = [...selected];
      return;
    }
    for (const candidate of candidates[itemIndex]) {
      if (usedMovements.has(candidate.movement.id) || usedBatches.has(candidate.batch.id)) continue;
      usedMovements.add(candidate.movement.id);
      usedBatches.add(candidate.batch.id);
      selected.push(candidate);
      visit(itemIndex + 1);
      selected.pop();
      usedMovements.delete(candidate.movement.id);
      usedBatches.delete(candidate.batch.id);
      if (solutionCount > 1) return;
    }
  };

  visit(0);
  if (solutionCount === 1 && solution) return { status: 'matched', lines: solution };
  return { status: solutionCount > 1 ? 'ambiguous' : 'mismatch' };
}

function matchesLine(
  purchaseOrderId: string,
  item: ReceiptLineItem,
  movement: ReceiptMovementEvidence,
  batch: ReceiptBatchEvidence,
  historical = false,
): boolean {
  if (
    item.purchaseOrderId !== purchaseOrderId ||
    item.productId !== movement.productId ||
    item.productId !== batch.productId ||
    batch.purchaseOrderId !== purchaseOrderId ||
    movement.movementType !== 'purchase_receipt' ||
    movement.referenceType !== 'purchase_order' ||
    movement.referenceId !== purchaseOrderId ||
    movement.unitValue == null ||
    movement.totalValue == null
  ) {
    return false;
  }

  try {
    const quantity = toMinorUnits(String(item.quantity));
    const movementQuantity = toMinorUnits(movement.quantity);
    const batchQuantity = toMinorUnits(batch.receivedQuantity);
    const movementUnitCost = toMinorUnits(movement.unitValue);
    const batchUnitCost = toMinorUnits(batch.unitCost);
    const batchShipping = toMinorUnits(batch.shippingPerUnit);
    const batchLandedCost = toMinorUnits(batch.landedCost);
    const itemTotal = toMinorUnits(String(item.totalAmount));
    const expectedUnitCost = divideRoundHalfUp(itemTotal * 10000n, quantity);

    return (
      quantity > 0n &&
      quantity === movementQuantity &&
      quantity === batchQuantity &&
      movementUnitCost === batchUnitCost &&
      movementUnitCost === expectedUnitCost &&
      batchLandedCost === batchUnitCost + batchShipping &&
      (!historical ||
        (movement.totalValue != null &&
          toMinorUnits(movement.totalValue) ===
            divideRoundHalfUp(movementQuantity * movementUnitCost, 10000n)))
    );
  } catch {
    return false;
  }
}

function divideRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error('Receipt-line valuation requires positive quantity');
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  return remainder * 2n >= denominator ? quotient + 1n : quotient;
}
