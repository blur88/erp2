import { validate } from 'class-validator';
import { BatchSendInvoicesDto } from './invoice.dto';

describe('BatchSendInvoicesDto', () => {
  const validInvoiceId = '550e8400-e29b-41d4-a716-446655440000';

  it('rejects invoiceIds when it is a single string', async () => {
    const dto = Object.assign(new BatchSendInvoicesDto(), {
      invoiceIds: validInvoiceId,
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'invoiceIds')).toBe(true);
  });

  it('rejects invoiceIds entries that are not UUID v4 strings', async () => {
    const dto = Object.assign(new BatchSendInvoicesDto(), {
      invoiceIds: ['not-a-uuid'],
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'invoiceIds')).toBe(true);
  });

  it('rejects an empty invoiceIds array', async () => {
    const dto = Object.assign(new BatchSendInvoicesDto(), {
      invoiceIds: [],
    });

    const errors = await validate(dto);

    expect(errors.some((error) => error.property === 'invoiceIds')).toBe(true);
  });

  it('accepts a non-empty UUID v4 invoiceIds array', async () => {
    const dto = Object.assign(new BatchSendInvoicesDto(), {
      invoiceIds: [validInvoiceId],
    });

    const errors = await validate(dto);

    expect(errors).toHaveLength(0);
  });
});
