// balance-sheet.service.spec.ts
import { jest } from '@jest/globals';

// ESM adaptation: jest.mock() is a silent no-op under this repo's
// useESM ts-jest config, so the module mock uses unstable_mockModule with a
// deferred dynamic import (same pattern as test/unit/auth.service.spec.ts).
// Mocked behaviour is identical to the brief: getAppToday() === '2026-09-08'.
jest.unstable_mockModule('@/common/utils/app-calendar', () => ({
  getAppToday: jest.fn(async () => '2026-09-08'),
}));

let BalanceSheetService: any;
beforeAll(async () => {
  const mod = await import('./balance-sheet.service');
  BalanceSheetService = mod.BalanceSheetService;
});

const makeService = (over: any = {}) => {
  const coaRepo = { find: jest.fn(async () => over.accounts ?? []) };
  const balance = { getLeafBalances: jest.fn(async () => new Map()) };
  const settings = { get: jest.fn(async () => over.settings ?? {}) };
  const pl = {
    getProfitAndLoss: jest.fn(async () => over.pl ?? {
      netProfit: '0.0000', availableYears: [2026],
      integrity: { anomalies: [], structuralFaults: [], tieOutOk: true },
    }),
  };
  const settingsService = {} as any;
  const service = new BalanceSheetService(
    coaRepo as any, balance as any, settings as any, pl as any, settingsService,
  );
  return { service, coaRepo, balance, settings, pl };
};

describe('BalanceSheetService', () => {
  it('clamps asOfDate to today for the current year', async () => {
    const { service, balance, pl } = makeService();
    const res = await service.getBalanceSheet({ year: 2026 });
    expect(res.asOfDate).toBe('2026-09-08');
    expect(balance.getLeafBalances).toHaveBeenCalledWith('2026-09-08');
    // The SAME cutoff must bound N48.
    expect(pl.getProfitAndLoss).toHaveBeenCalledWith({ year: 2026, to: '2026-09-08' });
  });

  it('uses 31 December for a past year', async () => {
    const { service, balance, pl } = makeService();
    const res = await service.getBalanceSheet({ year: 2025 });
    expect(res.asOfDate).toBe('2025-12-31');
    expect(balance.getLeafBalances).toHaveBeenCalledWith('2025-12-31');
    expect(pl.getProfitAndLoss).toHaveBeenCalledWith({ year: 2025, to: '2025-12-31' });
  });

  it('fetches pre-year balances at 31 December of the prior year', async () => {
    const { service, balance } = makeService();
    await service.getBalanceSheet({ year: 2026 });
    expect(balance.getLeafBalances).toHaveBeenCalledWith('2025-12-31');
    expect(balance.getLeafBalances).toHaveBeenCalledTimes(2);
  });

  it('rejects a future year with 400', async () => {
    const { service } = makeService();
    await expect(service.getBalanceSheet({ year: 2027 })).rejects.toThrow(/future/i);
  });

  it('nulls N48 on structural faults and on a failed tie-out', async () => {
    for (const integrity of [
      { anomalies: [], structuralFaults: [{ accountId: 'x' }], tieOutOk: true },
      { anomalies: [], structuralFaults: [], tieOutOk: false },
    ]) {
      const { service } = makeService({
        pl: { netProfit: '5.0000', availableYears: [2026], integrity },
      });
      const res = await service.getBalanceSheet({ year: 2026 });
      expect(res.rows.find((r) => r.line === 'N48')!.amount).toBeNull();
    }
  });

  it('nulls N47 on structural faults but NOT on a tie-out failure', async () => {
    const faults = await makeService({
      pl: { netProfit: '5.0000', availableYears: [2026],
            integrity: { anomalies: [], structuralFaults: [{ accountId: 'x' }], tieOutOk: true } },
    }).service.getBalanceSheet({ year: 2026 });
    expect(faults.rows.find((r) => r.line === 'N47')!.amount).toBeNull();

    const tieOut = await makeService({
      pl: { netProfit: '5.0000', availableYears: [2026],
            integrity: { anomalies: [], structuralFaults: [], tieOutOk: false } },
    }).service.getBalanceSheet({ year: 2026 });
    expect(tieOut.rows.find((r) => r.line === 'N47')!.amount).not.toBeNull();
  });
});
