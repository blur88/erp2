import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreatePurchaseOrderDto,
  CreatePurchaseOrderItemDto,
  RecordOrderPaymentLineDto,
  RefundLineDto,
} from './purchase-order.dto';

/**
 * `reference` is persisted to vendor_payments.referenceNumber, which is
 * varchar(100). Postgres errors on overflow rather than truncating, so without
 * a @MaxLength the driver raises a 500 instead of returning a 400.
 */
describe('payment reference length validation', () => {
  const atLimit = 'a'.repeat(100);
  const overLimit = 'b'.repeat(101);

  describe('RecordOrderPaymentLineDto', () => {
    function make(reference?: string): RecordOrderPaymentLineDto {
      return plainToInstance(RecordOrderPaymentLineDto, {
        paymentMethodId: 'pm-1',
        amount: 10,
        reference,
      });
    }

    it('accepts a reference at the 100-character column limit', async () => {
      const errors = await validate(make(atLimit));
      expect(errors.filter((e) => e.property === 'reference')).toHaveLength(0);
    });

    it('rejects a reference longer than 100 characters', async () => {
      const errors = await validate(make(overLimit));
      const referenceErrors = errors.filter((e) => e.property === 'reference');
      expect(referenceErrors).toHaveLength(1);
      expect(referenceErrors[0].constraints).toHaveProperty('maxLength');
    });

    it('accepts an omitted reference', async () => {
      const errors = await validate(make(undefined));
      expect(errors.filter((e) => e.property === 'reference')).toHaveLength(0);
    });
  });

  describe('RefundLineDto', () => {
    function make(reference?: string): RefundLineDto {
      return plainToInstance(RefundLineDto, {
        paymentMethodId: '11111111-1111-1111-1111-111111111111',
        amount: 10,
        reference,
      });
    }

    it('accepts a reference at the 100-character column limit', async () => {
      const errors = await validate(make(atLimit));
      expect(errors.filter((e) => e.property === 'reference')).toHaveLength(0);
    });

    it('rejects a reference longer than 100 characters', async () => {
      const errors = await validate(make(overLimit));
      const referenceErrors = errors.filter((e) => e.property === 'reference');
      expect(referenceErrors).toHaveLength(1);
      expect(referenceErrors[0].constraints).toHaveProperty('maxLength');
    });

    it('accepts an omitted reference', async () => {
      const errors = await validate(make(undefined));
      expect(errors.filter((e) => e.property === 'reference')).toHaveLength(0);
    });
  });
});

describe('purchase order precision validation (#1241)', () => {
  const uuid = '123e4567-e89b-12d3-a456-426614174000';

  const buildItem = (overrides: Record<string, unknown> = {}) =>
    plainToInstance(CreatePurchaseOrderItemDto, {
      productId: uuid,
      quantity: 1,
      unitPrice: 10,
      ...overrides,
    });

  it('rejects a fractional quantity rather than rounding it', async () => {
    const errors = await validate(buildItem({ quantity: 1.5 }));
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects more than two decimals on an ordinary money field', async () => {
    const dto = plainToInstance(CreatePurchaseOrderDto, {
      supplierId: uuid,
      orderDate: '2026-09-17',
      items: [{ productId: uuid, quantity: 1, unitPrice: 10 }],
      shippingAmount: 1.005,
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('shippingAmount');
  });

  it('accepts two decimals on an ordinary money field', async () => {
    const dto = plainToInstance(CreatePurchaseOrderDto, {
      supplierId: uuid,
      orderDate: '2026-09-17',
      items: [{ productId: uuid, quantity: 1, unitPrice: 10 }],
      shippingAmount: 1.01,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('still permits four decimals on a unit price', async () => {
    const errors = await validate(buildItem({ unitPrice: 11.8056 }));
    expect(errors).toHaveLength(0);
  });

  it('still permits four decimals on a per-unit fixed discount', async () => {
    const errors = await validate(
      buildItem({ discountType: 'fixed_amount', discountAmount: 1.0005 }),
    );
    expect(errors).toHaveLength(0);
  });

  it('rejects more than two decimals on a vendor payment amount', async () => {
    const dto = plainToInstance(RecordOrderPaymentLineDto, {
      paymentMethodId: uuid,
      paymentDate: '2026-09-17',
      amount: '1.005',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
