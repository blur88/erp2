import {
  matchReceiptLines,
  hasAggregateReceiptStockCoverage,
  type ReceiptLineItem,
  type ReceiptMovementEvidence,
  type ReceiptBatchEvidence,
} from '../receipt-line-matcher';

const poId = '10000000-0000-4000-8000-000000000001';
const productId = '20000000-0000-4000-8000-000000000001';

const item = (id: string, quantity: string, totalAmount: string): ReceiptLineItem => ({
  id,
  purchaseOrderId: poId,
  productId,
  quantity,
  totalAmount,
});

const movement = (
  id: string,
  itemId: string | null,
  quantity: string,
  unitValue: string,
  totalValue: string,
): ReceiptMovementEvidence => ({
  id,
  productId,
  movementType: 'purchase_receipt',
  purchaseOrderItemId: itemId,
  referenceType: 'purchase_order',
  referenceId: poId,
  quantity,
  unitValue,
  totalValue,
});

const batch = (
  id: string,
  itemId: string | null,
  quantity: string,
  unitCost: string,
  shippingPerUnit = '0.0000',
): ReceiptBatchEvidence => ({
  id,
  purchaseOrderId: poId,
  productId,
  purchaseOrderItemId: itemId,
  receivedQuantity: quantity,
  unitCost,
  shippingPerUnit,
  landedCost: String(Number(unitCost) + Number(shippingPerUnit)),
});

describe('matchReceiptLines', () => {
  it('matches new-version equal repeated lines by their explicit PO item IDs', () => {
    const items = [item('item-a', '2.0000', '20.0000'), item('item-b', '2.0000', '20.0000')];
    const result = matchReceiptLines(1, poId, items, [
      movement('move-b', 'item-b', '2.0000', '10.0000', '20.0000'),
      movement('move-a', 'item-a', '2.0000', '10.0000', '20.0000'),
    ], [
      batch('batch-a', 'item-a', '2.0000', '10.0000'),
      batch('batch-b', 'item-b', '2.0000', '10.0000'),
    ]);

    expect(result.status).toBe('matched');
    if (result.status !== 'matched') return;
    expect(result.lines.map((line) => [line.item.id, line.movement.id, line.batch.id])).toEqual([
      ['item-a', 'move-a', 'batch-a'],
      ['item-b', 'move-b', 'batch-b'],
    ]);
  });

  it('does not legacy-match a new-version receipt when stable IDs are missing', () => {
    const result = matchReceiptLines(1, poId,
      [item('item-a', '2.0000', '20.0000')],
      [movement('move-a', null, '2.0000', '10.0000', '20.0000')],
      [batch('batch-a', null, '2.0000', '10.0000')],
    );

    expect(result.status).toBe('mismatch');
  });

  it('refuses a non-receipt movement even when its other receipt evidence matches', () => {
    const wrongMovement = {
      ...movement('move-a', 'item-a', '2.0000', '10.0000', '20.0000'),
      movementType: 'damage',
    };
    const result = matchReceiptLines(
      1,
      poId,
      [item('item-a', '2.0000', '20.0000')],
      [wrongMovement],
      [batch('batch-a', 'item-a', '2.0000', '10.0000')],
    );

    expect(result.status).toBe('mismatch');
  });

  it('matches historical repeated-product lines only when quantity and cost yield one whole-receipt mapping', () => {
    const items = [item('item-small', '2.0000', '20.0000'), item('item-large', '5.0000', '75.0000')];
    const result = matchReceiptLines(null, poId, items, [
      movement('move-large', null, '5.0000', '15.0000', '75.0000'),
      movement('move-small', null, '2.0000', '10.0000', '20.0000'),
    ], [
      batch('batch-large', null, '5.0000', '15.0000'),
      batch('batch-small', null, '2.0000', '10.0000'),
    ]);

    expect(result.status).toBe('matched');
    if (result.status !== 'matched') return;
    expect(result.lines.map((line) => [line.item.id, line.movement.id, line.batch.id])).toEqual([
      ['item-small', 'move-small', 'batch-small'],
      ['item-large', 'move-large', 'batch-large'],
    ]);
  });

  it('refuses a historical receipt when equal lines have multiple complete mappings', () => {
    const items = [item('item-a', '2.0000', '20.0000'), item('item-b', '2.0000', '20.0000')];
    const result = matchReceiptLines(null, poId, items, [
      movement('move-a', null, '2.0000', '10.0000', '20.0000'),
      movement('move-b', null, '2.0000', '10.0000', '20.0000'),
    ], [
      batch('batch-a', null, '2.0000', '10.0000'),
      batch('batch-b', null, '2.0000', '10.0000'),
    ]);

    expect(result.status).toBe('ambiguous');
  });

  it('refuses line IDs that belong to a different PO or disagree with the recorded movement and batch', () => {
    const foreignItem = { ...item('item-a', '2.0000', '20.0000'), purchaseOrderId: 'foreign-po' };
    const wrongValuation = matchReceiptLines(1, poId,
      [item('item-a', '2.0000', '20.0000')],
      [movement('move-a', 'item-a', '2.0000', '10.0000', '20.0000')],
      [batch('batch-a', 'item-a', '2.0000', '11.0000')],
    );
    const wrongOwner = matchReceiptLines(1, poId,
      [foreignItem],
      [movement('move-a', 'item-a', '2.0000', '10.0000', '20.0000')],
      [batch('batch-a', 'item-a', '2.0000', '10.0000')],
    );

    expect(wrongValuation.status).toBe('mismatch');
    expect(wrongOwner.status).toBe('mismatch');
  });
});

describe('hasAggregateReceiptStockCoverage', () => {
  it('compares stock with the total quantity across repeated-product batches', () => {
    const lines = [
      { productId, batch: batch('batch-a', 'item-a', '3.0000', '10.0000') },
      { productId, batch: batch('batch-b', 'item-b', '3.0000', '20.0000') },
    ];

    expect(hasAggregateReceiptStockCoverage(lines, new Map([[productId, '4.0000']]))).toBe(false);
    expect(hasAggregateReceiptStockCoverage(lines, new Map([[productId, '6.0000']]))).toBe(true);
  });
});
