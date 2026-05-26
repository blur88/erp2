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
});
