import { SalesOrderPaymentStatus, SalesOrderStatus } from '../../../database/entities/sales-order.entity';
import { mapSalesOrderToResponseDto } from './sales-order.mapper';

describe('mapSalesOrderToResponseDto', () => {
  it('maps status, paymentStatus, subtotal, and direct sales order payments', () => {
    const order = {
      id: 'order-1',
      orderNumber: 'SO-001',
      orderDate: new Date('2026-03-31T00:00:00.000Z'),
      status: SalesOrderStatus.DRAFT,
      paymentStatus: SalesOrderPaymentStatus.PARTIAL,
      subtotal: 100,
      shippingAmount: 10,
      totalAmount: 110,
      notes: null,
      customerId: 'customer-1',
      customer: null,
      items: [],
      createdAt: new Date('2026-03-31T00:00:00.000Z'),
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    };

    const payments = [
      {
        id: 'payment-1',
        amount: '100.00',
        paymentDate: '2026-04-01',
        paymentMethodId: 'method-1',
        referenceNumber: 'REF-1',
      },
    ];

    expect(mapSalesOrderToResponseDto(order as any, payments as any)).toMatchObject({
      id: 'order-1',
      status: SalesOrderStatus.DRAFT,
      paymentStatus: SalesOrderPaymentStatus.PARTIAL,
      subtotal: 100,
      payments: [
        {
          id: 'payment-1',
          amount: 100,
          paymentDate: '2026-04-01',
          paymentMethodId: 'method-1',
          referenceNumber: 'REF-1',
        },
      ],
    });
  });

  it('preserves product stockQuantity on item products', () => {
    const order = {
      id: 'order-1',
      orderNumber: 'SO-001',
      orderDate: new Date('2026-03-31T00:00:00.000Z'),
      status: SalesOrderStatus.DRAFT,
      paymentStatus: SalesOrderPaymentStatus.PARTIAL,
      subtotal: 100,
      shippingAmount: 10,
      totalAmount: 110,
      customerId: 'customer-1',
      customer: null,
      items: [
        {
          id: 'item-1',
          productId: 'product-1',
          quantity: 2,
          unitPrice: 50,
          totalAmount: 100,
          product: {
            id: 'product-1',
            name: 'Widget',
            description: 'Demo widget',
            barcode: 'W-001',
            stockQuantity: 7,
          },
        },
      ],
      createdAt: new Date('2026-03-31T00:00:00.000Z'),
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    };

    const dto = mapSalesOrderToResponseDto(order as any);

    expect(dto.items[0].product).toMatchObject({
      id: 'product-1',
      name: 'Widget',
      stockQuantity: 7,
    });
  });

  it('emits paidAmount and balanceDue from the entity', () => {
    const order = {
      id: 'o1',
      orderNumber: 'SO-1',
      orderDate: new Date('2026-01-01'),
      status: SalesOrderStatus.DRAFT,
      paymentStatus: SalesOrderPaymentStatus.PARTIAL,
      subtotal: 1000,
      shippingAmount: 0,
      totalAmount: 1000,
      paidAmount: 400,
      balanceDue: 600,
      customerId: 'c1',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dto = mapSalesOrderToResponseDto(order as any);

    expect(dto.paidAmount).toBe(400);
    expect(dto.balanceDue).toBe(600);
  });

  it('emits negative balanceDue for an overpaid order', () => {
    const order = {
      id: 'o1',
      orderNumber: 'SO-1',
      orderDate: new Date('2026-01-01'),
      status: SalesOrderStatus.DRAFT,
      paymentStatus: SalesOrderPaymentStatus.OVERPAID,
      subtotal: 1000,
      shippingAmount: 0,
      totalAmount: 1000,
      paidAmount: 1200,
      balanceDue: -200,
      customerId: 'c1',
      items: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const dto = mapSalesOrderToResponseDto(order as any);

    expect(dto.paidAmount).toBe(1200);
    expect(dto.balanceDue).toBe(-200);
  });
});
