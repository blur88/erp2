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
  const pl = {
    getProfitAndLoss: jest.fn(async () => over.pl ?? {
      netProfit: '0.0000', availableYears: [2026],
      integrity: { anomalies: [], structuralFaults: [], tieOutOk: true },
    }),
  };
  const settingsService = {} as any;
  /*
   * ONE call returns BOTH halves of the configuration (#1239 read-consistency
   * fix). The report no longer reads settings and groups independently — the
   * resolution rule spans them, so a mixed pair can place one account on two
   * lines and double-count it. Mocking them as a single value here mirrors
   * that: there is no way for this fake to hand back an inconsistent pair.
   *
   * Defaulting to EMPTY groups keeps every pre-existing case in this suite on
   * the settings-key fallback path, so a green run is evidence the report is
   * unchanged when nothing is configured.
   */
  const groups = {
    getConfiguration: jest.fn(async () => ({
      settings: over.settings ?? {},
      groupedAccountIds: over.groups ?? {
        BANK_BALANCE: [], OTHER_CURRENT_ASSETS: [],
      },
    })),
  };
  const service = new BalanceSheetService(
    coaRepo as any, balance as any, pl as any, settingsService, groups as any,
  );
  return { service, coaRepo, balance, pl, groups };
};

/**
 * The REAL PlStructuralFault shape: identities are NESTED under `accounts`,
 * and `kind` distinguishes a graph fault from a settings fault. Earlier
 * fixtures used a top-level `{ accountId }` that the P&L service never emits,
 * so they could not catch either of the bugs the tests below cover.
 */
const graphFault = (...ids: string[]) => ({
  kind: 'danglingParent' as const,
  settingKey: null,
  accounts: ids.map((id) => ({ accountId: id, code: id, name: `Account ${id}` })),
});

const settingsFault = () => ({
  kind: 'missingConfiguredAccount' as const,
  settingKey: 'salesRevenueAccountId',
  accounts: [],
});

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
      { anomalies: [], structuralFaults: [graphFault('acc-1')], tieOutOk: true },
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
            integrity: { anomalies: [], structuralFaults: [graphFault('acc-1')], tieOutOk: true } },
    }).service.getBalanceSheet({ year: 2026 });
    expect(faults.rows.find((r) => r.line === 'N47')!.amount).toBeNull();

    const tieOut = await makeService({
      pl: { netProfit: '5.0000', availableYears: [2026],
            integrity: { anomalies: [], structuralFaults: [], tieOutOk: false } },
    }).service.getBalanceSheet({ year: 2026 });
    expect(tieOut.rows.find((r) => r.line === 'N47')!.amount).not.toBeNull();
  });

  it('carries structural-fault account identities from the NESTED accounts array', async () => {
    // Regression: toRefs() read a top-level `accountId`, which PlStructuralFault
    // does not have — every identity was silently dropped and the finding
    // surfaced with `accounts: []`, naming nothing.
    const { service } = makeService({
      accounts: [
        { id: 'acc-1', code: '1100', name: 'Cash', type: 'Asset', isPostable: true },
        { id: 'acc-2', code: '1200', name: 'Bank', type: 'Asset', isPostable: true },
      ],
      pl: {
        netProfit: '5.0000', availableYears: [2026],
        integrity: { anomalies: [], structuralFaults: [graphFault('acc-1', 'acc-2')], tieOutOk: true },
      },
    });
    const res = await service.getBalanceSheet({ year: 2026 });
    const finding = res.findings.find((f) => f.code === 'PROFIT_STRUCTURAL_FAULTS')!;
    expect(finding.accounts.map((a) => a.accountId)).toEqual(['acc-1', 'acc-2']);
    expect(finding.accounts[0]).toMatchObject({ code: '1100', name: 'Cash' });
  });

  it('preserves N47 when only the sales/COGS CONFIGURATION is faulty', async () => {
    // Regression: 'missingConfiguredAccount' is a settings fault, not a graph
    // fault. N47 is a raw type-sum that never consults those settings, so it
    // must still render; only N48 is invalidated.
    const { service } = makeService({
      pl: {
        netProfit: '5.0000', availableYears: [2026],
        integrity: { anomalies: [], structuralFaults: [settingsFault()], tieOutOk: true },
      },
    });
    const res = await service.getBalanceSheet({ year: 2026 });
    expect(res.rows.find((r) => r.line === 'N47')!.amount).not.toBeNull();
    expect(res.rows.find((r) => r.line === 'N48')!.amount).toBeNull();
    const scopes = res.findings
      .filter((f) => f.code === 'PROFIT_STRUCTURAL_FAULTS')
      .map((f) => f.scope);
    expect(scopes).toEqual(['selectedYear']);
  });

  it('reads the configuration ONCE, as a pair', async () => {
    /*
     * Pins the read-consistency contract at the unit level (#1239).
     *
     * Settings and groups must arrive from one snapshot. A refactor that
     * splits them back into two reads — or calls getConfiguration twice and
     * keeps half of each result — reintroduces the window where a report pairs
     * pre-write groups with post-write settings and double-counts an account
     * into N40/N41. Asserting the call COUNT is what catches that; asserting
     * the rendered output would not, since a single-threaded test never
     * interleaves.
     */
    const { service, groups } = makeService();
    await service.getBalanceSheet({ year: 2026 });
    expect(groups.getConfiguration).toHaveBeenCalledTimes(1);
  });
});
