// balance-sheet.controller.spec.ts
import { jest } from '@jest/globals';
import { BalanceSheetController } from './balance-sheet.controller';
import { BalanceSheetQueryDto } from '../dto/balance-sheet-query.dto';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

describe('BalanceSheetController', () => {
  it('delegates the parsed year to the service', async () => {
    const service = { getBalanceSheet: jest.fn(async () => ({ year: 2026 })) };
    const controller = new BalanceSheetController(service as any);
    await controller.get({ year: 2026 } as BalanceSheetQueryDto);
    expect(service.getBalanceSheet).toHaveBeenCalledWith({ year: 2026 });
  });
});

describe('BalanceSheetQueryDto', () => {
  const check = async (year: unknown) =>
    validate(plainToInstance(BalanceSheetQueryDto, { year }));

  it('accepts a well-formed year', async () => {
    expect(await check('2026')).toHaveLength(0);
  });

  it('rejects a year below the syntactic floor', async () => {
    expect((await check('999')).length).toBeGreaterThan(0);
  });

  it('rejects a non-numeric year', async () => {
    expect((await check('abc')).length).toBeGreaterThan(0);
  });
});
