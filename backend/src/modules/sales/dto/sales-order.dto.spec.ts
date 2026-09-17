import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SalesOrderItemDto, CreateSalesOrderDto, RecordPaymentDto } from './sales-order.dto';

describe('SalesOrderItemDto unitPrice transform', () => {
  const build = (unitPrice: unknown) =>
    plainToInstance(SalesOrderItemDto, { productId: 'p', quantity: 1, unitPrice });

  it('keeps an explicit zero', () => {
    expect(build(0).unitPrice).toBe(0);
    expect(build('0').unitPrice).toBe(0);
  });

  it('parses a positive value', () => {
    expect(build('25.5').unitPrice).toBe(25.5);
  });

  it('maps empty / null / undefined to undefined', () => {
    expect(build('').unitPrice).toBeUndefined();
    expect(build(null).unitPrice).toBeUndefined();
    expect(build(undefined).unitPrice).toBeUndefined();
  });
});

describe('sales order precision validation (#1241)', () => {
  const uuid = '123e4567-e89b-12d3-a456-426614174000';

  const validItem = (overrides: Record<string, unknown> = {}) =>
    plainToInstance(SalesOrderItemDto, {
      productId: uuid,
      quantity: 1,
      unitPrice: 1,
      ...overrides,
    });

  it('rejects more than two decimals on an ordinary money field', async () => {
    const dto = plainToInstance(CreateSalesOrderDto, {
      customerId: uuid,
      items: [],
      shippingAmount: 1.005,
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('shippingAmount');
  });

  it('accepts two decimals on an ordinary money field', async () => {
    const dto = plainToInstance(CreateSalesOrderDto, {
      customerId: uuid,
      items: [],
      shippingAmount: 1.01,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects more than two decimals on a whole-line discount', async () => {
    const dto = plainToInstance(CreateSalesOrderDto, {
      customerId: uuid,
      items: [
        {
          productId: uuid,
          quantity: 1,
          unitPrice: 10,
          discountType: 'amount',
          discountAmount: 1.005,
        },
      ],
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('still permits four decimals on a unit price', async () => {
    const errors = await validate(validItem({ unitPrice: 11.8056 }));
    expect(errors).toHaveLength(0);
  });

  it('rejects more than four decimals on a unit price', async () => {
    const errors = await validate(validItem({ unitPrice: 11.80561 }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects a fractional quantity rather than rounding it', async () => {
    const errors = await validate(validItem({ quantity: 1.5 }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects more than two decimals on a payment amount', async () => {
    const dto = plainToInstance(RecordPaymentDto, {
      paymentMethodId: uuid,
      amount: '1.005',
      paymentDate: '2026-09-17',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
