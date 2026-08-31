import { jest } from '@jest/globals';
import { FormBService } from './form-b.service';
import type { PlAccount } from './profit-and-loss.types';

const acc = (over: Partial<PlAccount> = {}): PlAccount => ({
  id: 'inv', code: '1300', name: 'Inventory', type: 'Asset',
  parentId: null, isPostable: true, ...over,
});

// Only validateRoot is exercised here — it is pure, so the repositories and
// collaborators are irrelevant and passed as nulls.
const service = () => new FormBService(
  null as any, null as any, null as any, null as any, null as any, null as any,
);

const validate = (
  id: string | null,
  accounts: PlAccount[],
  over: { cyclicIds?: Set<string>; danglingIds?: Set<string> } = {},
) => service().validateRoot({
  id, expectedType: 'Asset', accounts,
  cyclicIds: over.cyclicIds ?? new Set(),
  danglingIds: over.danglingIds ?? new Set(),
});

describe('FormBService.validateRoot', () => {
  it('accepts a present, correctly-typed, well-formed root', () => {
    expect(validate('inv', [acc()])).toEqual({ ok: true, id: 'inv' });
  });

  it('reports an unset root as missing, not invalid', () => {
    expect(validate(null, [acc()])).toEqual({ ok: false, kind: 'missing' });
  });

  it('reports a root that names no account', () => {
    expect(validate('ghost', [acc()]))
      .toEqual({ ok: false, kind: 'invalid', detail: 'notFound' });
  });

  it('reports a wrong-type root', () => {
    expect(validate('inv', [acc({ type: 'Income' })]))
      .toEqual({ ok: false, kind: 'invalid', detail: 'wrongType' });
  });

  it('reports a dangling parent anywhere in the subtree', () => {
    const child = acc({ id: 'c1', parentId: 'inv' });
    expect(validate('inv', [acc(), child], { danglingIds: new Set(['c1']) }))
      .toEqual({ ok: false, kind: 'invalid', detail: 'dangling' });
  });

  // getRollup() recurses with NO visited set (account-balance.service.ts:40),
  // so a cyclic subtree is unbounded recursion. This must be caught BEFORE any
  // rollup runs. The test asserting termination is in Task 8.
  it('reports a cycle in the subtree', () => {
    const child = acc({ id: 'c1', parentId: 'inv' });
    expect(validate('inv', [acc(), child], { cyclicIds: new Set(['c1']) }))
      .toEqual({ ok: false, kind: 'invalid', detail: 'cyclic' });
  });

  it('ignores a cycle that is outside the validated subtree', () => {
    const elsewhere = acc({ id: 'x1', parentId: null, code: '6000' });
    expect(validate('inv', [acc(), elsewhere], { cyclicIds: new Set(['x1']) }))
      .toEqual({ ok: true, id: 'inv' });
  });
});

// ---- getFormB assembly ----

const YEAR = 2025;

/**
 * Builds a service whose collaborators are stubs. `accounts` drives both the
 * chart and the graph; `leaf` maps accountId -> raw debit-minus-credit at each
 * as-of date.
 */
const buildService = (opts: {
  accounts?: PlAccount[];
  leafPrior?: Record<string, bigint>;
  leafClosing?: Record<string, bigint>;
  purchases?: bigint;
  drawings?: bigint;
  settings?: Record<string, string | null>;
  accountingTotalCostOfSales?: string;
  inventoryAdjustments?: string;
  plIntegrity?: any;
}) => {
  const accounts = opts.accounts ?? [
    acc({ id: 'inv', code: '1300', name: 'Inventory', type: 'Asset' }),
    acc({ id: 'rev', code: '4100', name: 'Sales Revenue', type: 'Income' }),
    acc({ id: 'cogs', code: '5100', name: 'Cost of Goods Sold', type: 'Expense' }),
  ];
  const coaRepo = { find: (jest.fn as unknown as any)().mockResolvedValue(accounts) };
  const balance = {
    getLeafBalances: (jest.fn as unknown as any)(async (asOf?: string) =>
      new Map(Object.entries(
        asOf === `${YEAR - 1}-12-31` ? (opts.leafPrior ?? {}) : (opts.leafClosing ?? {}),
      ))),
    getRollup: (jest.fn as unknown as any)((id: string, leaf: Map<string, bigint>) => leaf.get(id) ?? 0n),
    naturalBalance: (jest.fn as unknown as any)((type: string, raw: bigint) =>
      type === 'Income' || type === 'Liability' || type === 'Equity' ? -raw : raw),
  };
  const settings = {
    get: (jest.fn as unknown as any)().mockResolvedValue({
      inventoryAccountId: 'inv', salesRevenueAccountId: 'rev', cogsAccountId: 'cogs',
      ...(opts.settings ?? {}),
    }),
  };
  const accountingReport = {
    getProfitAndLoss: (jest.fn as unknown as any)().mockResolvedValue({
      year: YEAR, availableYears: [YEAR, YEAR - 1],
      totalCostOfSales: opts.accountingTotalCostOfSales ?? '0.0000',
      inventoryAdjustments: opts.inventoryAdjustments ?? '0.0000',
      integrity: opts.plIntegrity ?? {
        anomalies: [], structuralFaults: [], tieOutOk: true, independentNetProfit: '0.0000',
      },
    }),
  };
  const identity = {
    resolve: (jest.fn as unknown as any)().mockResolvedValue({
      businessName: { value: 'Acme', source: 'formB', override: 'Acme' },
      registrationNumber: { value: '201901234567', source: 'formB', override: '201901234567' },
      businessCode: { value: '47111', source: 'formB', override: '47111' },
      activityType: { value: 'Retail', source: 'formB', override: 'Retail' },
    }),
  };
  const lineRepo = {} as any;

  const service = new FormBService(
    coaRepo as any, lineRepo, balance as any, settings as any,
    accountingReport as any, identity as any,
  );
  jest.spyOn(service, 'getInventoryPurchases').mockResolvedValue(opts.purchases ?? 0n);
  jest.spyOn(service, 'getOwnerStockDrawings').mockResolvedValue(opts.drawings ?? 0n);
  // No movements unless a test supplies them.
  jest.spyOn(service as any, 'getMovements').mockResolvedValue(new Map());
  return service;
};

const lineOf = (res: any, line: string) => res.rows.find((r: any) => r.line === line);
const codes = (res: any) => res.findings.map((f: any) => f.code).sort();

describe('FormBService.getFormB', () => {
  it('returns all of N3-N27 in order', async () => {
    const res = await buildService({}).getFormB({ year: YEAR });
    expect(res.rows.map((r) => r.line)).toEqual(
      Array.from({ length: 25 }, (_, i) => `N${i + 3}`),
    );
  });

  it('computes N7 as N4 + N5 - N6 and N8 as N3 - N7', async () => {
    const res = await buildService({
      leafPrior: { inv: 10_0000n },
      leafClosing: { inv: 4_0000n, rev: -30_0000n },
      purchases: 20_0000n,
    }).getFormB({ year: YEAR });
    expect(lineOf(res, 'N4').amount).toBe('10.0000');
    expect(lineOf(res, 'N5').amount).toBe('20.0000');
    expect(lineOf(res, 'N6').amount).toBe('4.0000');
    expect(lineOf(res, 'N7').amount).toBe('26.0000');   // 10 + 20 - 4
  });

  it('pins formVersion at 2025 and flags a mismatched year', async () => {
    const match = await buildService({}).getFormB({ year: 2025 });
    expect(match.formVersion).toBe(2025);
    expect(codes(match)).not.toContain('FORM_VERSION_MISMATCH');

    const mismatch = await buildService({}).getFormB({ year: 2024 });
    expect(mismatch.formVersion).toBe(2025);
    expect(codes(mismatch)).toContain('FORM_VERSION_MISMATCH');
  });

  it('always reports N27 as undetermined, never zero', async () => {
    const res = await buildService({}).getFormB({ year: YEAR });
    const n27 = lineOf(res, 'N27');
    expect(n27.amount).toBeNull();
    expect(n27.derived).toBe(false);
    expect(n27.status).toBe('requiresFilerInput');
    expect(codes(res)).toContain('DISALLOWED_EXPENSES_UNDETERMINED');
  });

  it('marks productionCost null on N5 and absent everywhere else', async () => {
    const res = await buildService({}).getFormB({ year: YEAR });
    expect(lineOf(res, 'N5').productionCost).toBeNull();
    expect('productionCost' in lineOf(res, 'N7')).toBe(false);
  });

  // Spec §5.3 — (b) is NESTED inside (a). Subtracting both double-counts the
  // adjustment and yields a residual equal to it on any stock-adjustment year.
  it('reconciles to zero residual when (b) is nested in (a)', async () => {
    const res = await buildService({
      leafPrior: { inv: 10_0000n },
      leafClosing: { inv: 0n },
      purchases: 0n,
      accountingTotalCostOfSales: '10.0000',  // includes the 3.00 adjustment
      inventoryAdjustments: '3.0000',
    }).getFormB({ year: YEAR });
    expect(res.reconciliation.n7).toBe('10.0000');
    expect(res.reconciliation.residual).toBe('0.0000');
    expect(codes(res)).not.toContain('UNEXPLAINED_INVENTORY_RESIDUAL');
  });

  it('raises a finding on a non-zero residual', async () => {
    const res = await buildService({
      leafPrior: { inv: 10_0000n }, leafClosing: { inv: 0n },
      accountingTotalCostOfSales: '7.0000',
    }).getFormB({ year: YEAR });
    expect(res.reconciliation.residual).toBe('3.0000');
    expect(codes(res)).toContain('UNEXPLAINED_INVENTORY_RESIDUAL');
  });

  it('subtracts owner stock drawings as part (c)', async () => {
    const res = await buildService({
      leafPrior: { inv: 10_0000n }, leafClosing: { inv: 0n },
      accountingTotalCostOfSales: '8.0000', drawings: 2_0000n,
    }).getFormB({ year: YEAR });
    expect(res.reconciliation.ownerStockDrawings).toBe('2.0000');
    expect(res.reconciliation.residual).toBe('0.0000');
  });

  // ---- null propagation (spec §5.6) ----

  it('nulls N4/N6/N7/N8/N26 and panel n7/(c)/(d) when Inventory is unset, keeping (a) and (b)', async () => {
    const res = await buildService({
      settings: { inventoryAccountId: null },
      accountingTotalCostOfSales: '5.0000', inventoryAdjustments: '1.0000',
    }).getFormB({ year: YEAR });
    for (const l of ['N4', 'N6', 'N7', 'N8', 'N26']) {
      expect(lineOf(res, l).amount).toBeNull();
    }
    expect(res.reconciliation.n7).toBeNull();
    expect(res.reconciliation.ownerStockDrawings).toBeNull();
    expect(res.reconciliation.residual).toBeNull();
    expect(res.reconciliation.accountingTotalCostOfSales).toBe('5.0000');
    expect(res.reconciliation.inventoryAdjustments).toBe('1.0000');
    expect(codes(res)).toContain('MISSING_CONFIGURED_ROOT');
  });

  it('nulls (a) and (d) when COGS is unset, keeping n7, (b) and (c)', async () => {
    const res = await buildService({
      settings: { cogsAccountId: null },
      leafPrior: { inv: 10_0000n }, leafClosing: { inv: 0n },
      inventoryAdjustments: '1.0000', drawings: 2_0000n,
    }).getFormB({ year: YEAR });
    expect(res.reconciliation.n7).toBe('10.0000');
    expect(res.reconciliation.inventoryAdjustments).toBe('1.0000');
    expect(res.reconciliation.ownerStockDrawings).toBe('2.0000');
    expect(res.reconciliation.accountingTotalCostOfSales).toBeNull();
    expect(res.reconciliation.residual).toBeNull();
    for (const l of ['N15', 'N24', 'N25', 'N26']) {
      expect(lineOf(res, l).amount).toBeNull();
    }
  });

  it('nulls N3 and N9-N14 when Sales Revenue is unset', async () => {
    const res = await buildService({ settings: { salesRevenueAccountId: null } })
      .getFormB({ year: YEAR });
    for (const l of ['N3', 'N9', 'N13', 'N14', 'N8', 'N26']) {
      expect(lineOf(res, l).amount).toBeNull();
    }
  });

  it('distinguishes an invalid root from a missing one', async () => {
    const res = await buildService({ settings: { inventoryAccountId: 'ghost' } })
      .getFormB({ year: YEAR });
    expect(codes(res)).toContain('INVALID_CONFIGURED_ROOT');
    expect(codes(res)).not.toContain('MISSING_CONFIGURED_ROOT');
  });

  // getRollup() has no visited set, so this must terminate by validation, not
  // by luck. A stack overflow fails the test.
  it('terminates on a cyclic Inventory subtree without recursing', async () => {
    const cyclic = [
      acc({ id: 'inv', code: '1300', name: 'Inventory', type: 'Asset', parentId: 'c1' }),
      acc({ id: 'c1', code: '1310', name: 'Child', type: 'Asset', parentId: 'inv' }),
      acc({ id: 'rev', code: '4100', name: 'Sales Revenue', type: 'Income' }),
      acc({ id: 'cogs', code: '5100', name: 'COGS', type: 'Expense' }),
    ];
    const res = await buildService({ accounts: cyclic }).getFormB({ year: YEAR });
    expect(lineOf(res, 'N7').amount).toBeNull();
    expect(codes(res)).toContain('INVALID_CONFIGURED_ROOT');
  });

  it('returns a full zero skeleton for a year with no activity, N27 still null', async () => {
    const res = await buildService({}).getFormB({ year: YEAR });
    expect(lineOf(res, 'N3').amount).toBe('0.0000');
    expect(lineOf(res, 'N26').amount).toBe('0.0000');
    expect(lineOf(res, 'N27').amount).toBeNull();
  });

  it('derives readiness counts from the findings', async () => {
    const res = await buildService({}).getFormB({ year: YEAR });
    expect(res.readiness.counts.incomplete).toBe(
      res.findings.filter((f) => f.severity === 'incomplete').length,
    );
    expect(res.readiness.hasIncomplete).toBe(true);   // N27 is always undetermined
  });
});
