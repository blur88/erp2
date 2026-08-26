import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { GeneralLedgerQueryDto } from './general-ledger-query.dto';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

function validate(payload: Record<string, unknown>) {
  const dto = plainToInstance(GeneralLedgerQueryDto, payload);
  return validateSync(dto as object);
}

describe('GeneralLedgerQueryDto', () => {
  it('accepts accountId alone (unpaginated full-set request)', () => {
    expect(validate({ accountId: ACCOUNT_ID })).toHaveLength(0);
  });

  it('coerces page and limit from query strings to numbers', () => {
    const dto = plainToInstance(GeneralLedgerQueryDto, {
      accountId: ACCOUNT_ID,
      page: '2',
      limit: '25',
    });
    expect(validateSync(dto as object)).toHaveLength(0);
    expect(dto.page).toBe(2);
    expect(dto.limit).toBe(25);
  });

  it('rejects page without limit', () => {
    const errors = validate({ accountId: ACCOUNT_ID, page: 2 });
    expect(errors.map((e) => e.property)).toContain('limit');
  });

  it('rejects limit without page', () => {
    const errors = validate({ accountId: ACCOUNT_ID, limit: 25 });
    expect(errors.map((e) => e.property)).toContain('page');
  });

  it('rejects a malformed accountId', () => {
    const errors = validate({ accountId: 'not-a-uuid' });
    expect(errors.map((e) => e.property)).toContain('accountId');
  });

  it('rejects limit above the 200 maximum', () => {
    const errors = validate({ accountId: ACCOUNT_ID, page: 1, limit: 201 });
    expect(errors.map((e) => e.property)).toContain('limit');
  });

  it('rejects page below 1', () => {
    const errors = validate({ accountId: ACCOUNT_ID, page: 0, limit: 25 });
    expect(errors.map((e) => e.property)).toContain('page');
  });

  it('rejects an unknown sourceType', () => {
    const errors = validate({ accountId: ACCOUNT_ID, sourceType: 'NOT_A_SOURCE' });
    expect(errors.map((e) => e.property)).toContain('sourceType');
  });

  it('rejects a non-calendar fromDate', () => {
    const errors = validate({ accountId: ACCOUNT_ID, fromDate: '07/01/2026' });
    expect(errors.map((e) => e.property)).toContain('fromDate');
  });
});