import { mapSalesOrderToResponseDto } from './sales-order.mapper';

describe('mapSalesOrderToResponseDto', () => {
  it('flattens invoice payments onto the sales order response', () => {
    const paymentDate = new Date('2026-04-01T00:00:00.000Z');
    const order = {
      id: 'order-1',
      orderNumber: 'SO-001',
      orderDate: new Date('2026-03-31T00:00:00.000Z'),
      fulfilledDate: null,
      shippingAmount: 0,
      totalAmount: 100,
      paidAmount: 100,
      isFulfilled: true,
      isPaidInFull: true,
      balanceDue: 0,
      canFulfill: false,
      canUnfulfill: true,
      notes: null,
      customerId: 'customer-1',
      customer: null,
      items: [],
      invoices: [
        {
          id: 'invoice-1',
          invoiceNumber: 'INV-001',
          status: 'paid',
          invoiceDate: new Date('2026-04-01T00:00:00.000Z'),
          shippingAmount: 0,
          totalAmount: 100,
          paidAmount: 100,
          balanceDue: 0,
          customer: null,
          customerId: 'customer-1',
          salesOrderId: 'order-1',
          payments: [
            {
              id: 'payment-1',
              paymentNumber: 'PAY-001',
              amount: '100.00',
              paymentDate,
            },
          ],
          items: [],
        },
      ],
      createdAt: new Date('2026-03-31T00:00:00.000Z'),
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
      deletedAt: null,
    };

    expect(mapSalesOrderToResponseDto(order as any).payments).toEqual([
      {
        id: 'payment-1',
        paymentNumber: 'PAY-001',
        amount: 100,
        paymentDate,
      },
    ]);
  });
});
