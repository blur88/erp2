import { ProfitAndLossService } from './profit-and-loss.service';
import type { PlSection } from './profit-and-loss.types';

const section = (key: string, total: string): PlSection => ({
  rowId: `${key}.section`, key: key as any, label: key,
  totalLabel: `Total ${key}`,
  rows: [], total, totalRowId: `${key}.total`,
});

describe('ProfitAndLossService.computeTotals', () => {
  // Four constructor args: coaRepo, lineRepo, balance, settings.
  const svc = new ProfitAndLossService({} as any, {} as any, {} as any, {} as any);

  it('applies the spec formulas', () => {
    const sections = [
      section('revenue', '120000.0000'),
      section('cogs', '63000.0000'),
      section('otherIncome', '0.0000'),
      section('expenses', '8000.0000'),
    ];
    const { totalCostOfSales, grossProfit, netProfit } =
      svc.computeTotals(sections, 2000000n);
    // The COGS section total is 63000; the DISPLAYED total includes the 200
    // of adjustments. Rendering the section total instead would contradict
    // Gross Profit on screen.
    expect(totalCostOfSales).toBe(632000000n); // 63,200.0000
    expect(grossProfit).toBe(568000000n);      // 120000 - 63200 = 56,800
    expect(netProfit).toBe(488000000n);        // 56800 + 0 - 8000 = 48,800
  });

  it('produces a negative net profit as a loss', () => {
    const sections = [
      section('revenue', '1000.0000'), section('cogs', '900.0000'),
      section('otherIncome', '0.0000'), section('expenses', '500.0000'),
    ];
    const { netProfit } = svc.computeTotals(sections, 0n);
    expect(netProfit).toBe(-4000000n); // -400.0000
  });

  it('lets a negative adjustment (stock found) reduce cost of sales', () => {
    const sections = [
      section('revenue', '1000.0000'), section('cogs', '600.0000'),
      section('otherIncome', '0.0000'), section('expenses', '0.0000'),
    ];
    const { grossProfit } = svc.computeTotals(sections, -1000000n);
    expect(grossProfit).toBe(5000000n); // 1000 - (600 - 100) = 500
  });

  it('returns zeros for an empty year', () => {
    const sections = [
      section('revenue', '0.0000'), section('cogs', '0.0000'),
      section('otherIncome', '0.0000'), section('expenses', '0.0000'),
    ];
    const { totalCostOfSales, grossProfit, netProfit } = svc.computeTotals(sections, 0n);
    expect(totalCostOfSales).toBe(0n);
    expect(grossProfit).toBe(0n);
    expect(netProfit).toBe(0n);
  });
});

/**
 * Orchestration tests against stubbed repositories. `computeTotals` alone
 * cannot catch a wrong QUERY or a wrong natural-sign mapping — the
 * stock-adjustment netting bug lives entirely in this layer.
 */
describe('ProfitAndLossService.getProfitAndLoss', () => {
  const COA = [
    { id: 'sales', code: '4100', name: 'Sales Revenue', type: 'Income', parentId: 'inc', isPostable: true },
    { id: 'inc', code: '4000', name: 'Income', type: 'Income', parentId: null, isPostable: false },
    { id: 'cogs', code: '5100', name: 'COGS', type: 'Expense', parentId: 'cos', isPostable: true },
    { id: 'cos', code: '5000', name: 'Cost of Sales', type: 'Expense', parentId: null, isPostable: false },
    { id: 'oe', code: '6990', name: 'Other Expenses', type: 'Expense', parentId: 'exp', isPostable: true },
    { id: 'exp', code: '6000', name: 'Expenses', type: 'Expense', parentId: null, isPostable: false },
    { id: 'inv', code: '1300', name: 'Inventory', type: 'Asset', parentId: null, isPostable: true },
  ];

  /** Captures the QueryBuilder chain so the WHERE clauses can be asserted. */
  const makeStubs = (movementRows: any[], earliest: string | null) => {
    const whereCalls: string[] = [];
    const qb: any = {
      innerJoin: () => qb, select: () => qb, addSelect: () => qb,
      groupBy: () => qb,
      where: (c: string) => { whereCalls.push(c); return qb; },
      andWhere: (c: string) => { whereCalls.push(c); return qb; },
      getRawMany: async () => movementRows,
      getRawOne: async () => ({ earliest }),
    };
    return {
      whereCalls,
      coaRepo: { find: async () => COA } as any,
      lineRepo: { createQueryBuilder: () => qb } as any,
      balance: {
        naturalBalance: (type: string, raw: bigint) =>
          type === 'Income' || type === 'Liability' || type === 'Equity' ? -raw : raw,
      } as any,
      settings: {
        get: async () => ({ salesRevenueAccountId: 'sales', cogsAccountId: 'cogs' }),
      } as any,
    };
  };

  const build = (rows: any[], earliest: string | null = '2026-03-01') => {
    const s = makeStubs(rows, earliest);
    return { svc: new ProfitAndLossService(s.coaRepo, s.lineRepo, s.balance, s.settings), stubs: s };
  };

  const row = (accountId: string, o: [string, string], a: [string, string] = ['0', '0']) => ({
    accountId, ordDebit: o[0], ordCredit: o[1], adjDebit: a[0], adjCredit: a[1],
  });

  it('maps raw debit/credit to natural signs per account type', async () => {
    const { svc } = build([
      row('sales', ['0', '120000']),   // credit-normal Income -> +120000
      row('cogs', ['63000', '0']),     // debit-normal Expense -> +63000
      row('oe', ['8000', '0']),
    ]);
    const res = await svc.getProfitAndLoss({ year: 2026 });
    expect(res.sections.find((s) => s.key === 'revenue')!.total).toBe('120000.0000');
    expect(res.sections.find((s) => s.key === 'cogs')!.total).toBe('63000.0000');
    expect(res.netProfit).toBe('49000.0000');
  });

  // The regression test for the netting bug: BOTH legs of the balanced
  // stock-adjustment journal are present, as they always are in real data.
  it('counts only the Expense leg of a stock adjustment', async () => {
    const { svc } = build([
      row('sales', ['0', '120000']),
      row('cogs', ['63000', '0']),
      row('oe', ['8000', '0'], ['200', '0']),   // Expense leg: +200 cost
      row('inv', ['0', '0'], ['0', '200']),     // Inventory leg: balancing
    ]);
    const res = await svc.getProfitAndLoss({ year: 2026 });
    expect(res.inventoryAdjustments).toBe('200.0000');   // NOT '0.0000'
    expect(res.totalCostOfSales).toBe('63200.0000');
    expect(res.sections.find((s) => s.key === 'expenses')!.total).toBe('8000.0000');
    expect(res.grossProfit).toBe('56800.0000');
    expect(res.netProfit).toBe('48800.0000');
    expect(res.integrity.anomalies).toEqual([]);
  });

  it('reports a clean tie-out when classification is complete', async () => {
    const { svc } = build([
      row('sales', ['0', '120000']),
      row('cogs', ['63000', '0']),
      row('oe', ['8000', '0'], ['200', '0']),
      row('inv', ['0', '0'], ['0', '200']),
    ]);
    const res = await svc.getProfitAndLoss({ year: 2026 });
    expect(res.integrity.tieOutOk).toBe(true);
    expect(res.integrity.independentNetProfit).toBe(res.netProfit);
  });

  it('excludes soft-deleted lines and entries in every query', async () => {
    const { svc, stubs } = build([row('sales', ['0', '100'])]);
    await svc.getProfitAndLoss({ year: 2026 });
    const clauses = stubs.whereCalls.join(' | ');
    expect(clauses).toContain('l."deletedAt" IS NULL');
    expect(clauses).toContain('e."deletedAt" IS NULL');
  });

  it('bounds the query to the requested calendar year', async () => {
    const { svc, stubs } = build([row('sales', ['0', '100'])]);
    await svc.getProfitAndLoss({ year: 2026 });
    const clauses = stubs.whereCalls.join(' | ');
    expect(clauses).toContain('e."entryDate" >= :from');
    expect(clauses).toContain('e."entryDate" <= :to');
  });

  it('lists available years from the earliest posting, newest first', async () => {
    const currentYear = new Date().getFullYear();
    const { svc } = build([], `${currentYear - 2}-05-01`);
    const res = await svc.getProfitAndLoss({ year: currentYear });
    expect(res.availableYears[0]).toBe(currentYear);
    expect(res.availableYears).toContain(currentYear - 2);
    expect(res.availableYears).toEqual([...res.availableYears].sort((a, b) => b - a));
  });

  it('still offers the current year when there are no postings at all', async () => {
    const currentYear = new Date().getFullYear();
    const { svc } = build([], null);
    const res = await svc.getProfitAndLoss({ year: currentYear });
    expect(res.availableYears).toEqual([currentYear]);
  });

  it('returns all four zeroed sections for a year with no movement', async () => {
    const { svc } = build([]);
    const res = await svc.getProfitAndLoss({ year: 2026 });
    expect(res.sections.map((s) => s.key)).toEqual(['revenue', 'cogs', 'otherIncome', 'expenses']);
    expect(res.netProfit).toBe('0.0000');
    expect(res.totalCostOfSales).toBe('0.0000');
  });
});
