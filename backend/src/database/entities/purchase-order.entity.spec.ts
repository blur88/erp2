import { PurchaseOrder } from './purchase-order.entity';

describe('PurchaseOrder.calculateTotals', () => {
  function makeOrder(overrides: Partial<PurchaseOrder> = {}): PurchaseOrder {
    const order = new PurchaseOrder();
    order.subtotal = 100;
    order.discountPercent = 0;
    order.discountAmount = 0;
    order.shippingAmount = 0;
    Object.assign(order, overrides);
    return order;
  }

  it('computes total as subtotal - discount + shipping', () => {
    const order = makeOrder({ discountPercent: 10, shippingAmount: 5 });
    order.calculateTotals();
    expect(order.discountAmount).toBe(10);
    expect(order.totalAmount).toBe(95);
  });

  it('clears a previously derived discount when discountPercent drops to 0', () => {
    const order = makeOrder({ discountPercent: 0, discountAmount: 10 });
    order.calculateTotals();
    expect(order.discountAmount).toBe(0);
    expect(order.totalAmount).toBe(100);
  });
});
