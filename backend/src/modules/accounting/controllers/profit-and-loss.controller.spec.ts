import { jest } from '@jest/globals';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { ProfitAndLossQueryDto } from '../dto/profit-and-loss-query.dto';
import { ProfitAndLossController } from './profit-and-loss.controller';

describe('ProfitAndLossQueryDto', () => {
  const check = async (year: unknown) =>
    validate(plainToInstance(ProfitAndLossQueryDto, { year }));

  it('accepts a four-digit year as a query string', async () => {
    expect(await check('2026')).toHaveLength(0);
  });

  it('rejects a non-numeric year', async () => {
    expect((await check('abc')).length).toBeGreaterThan(0);
  });

  it('rejects a three-digit year', async () => {
    expect((await check('999')).length).toBeGreaterThan(0);
  });

  it('rejects a five-digit year', async () => {
    expect((await check('12026')).length).toBeGreaterThan(0);
  });

  it('requires the year', async () => {
    expect((await validate(plainToInstance(ProfitAndLossQueryDto, {}))).length)
      .toBeGreaterThan(0);
  });

  // Range is NOT validated: a well-formed year outside the data returns zeros.
  it('accepts a well-formed year with no data', async () => {
    expect(await check('1990')).toHaveLength(0);
  });
});

describe('ProfitAndLossController', () => {
  it('delegates to the service with the parsed year', async () => {
    const service = { getProfitAndLoss: (jest.fn as unknown as any)().mockResolvedValue({ year: 2026 }) };
    const controller = new ProfitAndLossController(service as any);
    const res = await controller.get({ year: 2026 } as any);
    expect(service.getProfitAndLoss).toHaveBeenCalledWith({ year: 2026 });
    expect(res).toEqual({ year: 2026 });
  });
});
