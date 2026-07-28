import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RecordOrderPaymentLineDto, RefundLineDto } from './purchase-order.dto';

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
