import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { BulkUpdateFormBMappingsDto } from './bulk-update-form-b-mappings.dto';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

async function errorsFor(payload: unknown) {
  const dto = plainToInstance(BulkUpdateFormBMappingsDto, payload);
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

describe('BulkUpdateFormBMappingsDto', () => {
  it('accepts a valid multi-item payload including an explicit null clear', async () => {
    const errors = await errorsFor({
      mappings: [
        { accountId: A, category: 'RENT_LEASE' },
        { accountId: B, category: null },
      ],
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects an empty array', async () => {
    const errors = await errorsFor({ mappings: [] });
    expect(errors).not.toHaveLength(0);
  });

  it('rejects duplicate accountIds', async () => {
    const errors = await errorsFor({
      mappings: [
        { accountId: A, category: 'RENT_LEASE' },
        { accountId: A, category: null },
      ],
    });
    expect(JSON.stringify(errors)).toMatch(/duplicate/i);
  });

  it('validates nested items — a bad category is caught', async () => {
    const errors = await errorsFor({
      mappings: [{ accountId: A, category: 'NOT_A_REAL_CATEGORY' }],
    });
    expect(errors).not.toHaveLength(0);
  });

  it('validates nested items — a non-uuid accountId is caught', async () => {
    const errors = await errorsFor({
      mappings: [{ accountId: 'not-a-uuid', category: null }],
    });
    expect(errors).not.toHaveLength(0);
  });
});
