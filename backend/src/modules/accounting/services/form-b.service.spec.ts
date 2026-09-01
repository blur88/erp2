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
  companyName?: string | null;
  companyRegistrationNumber?: string | null;
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
  // Identity now comes from Company Settings (/settings/company); Form B has no
  // identity store of its own.
  const companySettings = {
    getCompanySettings: (jest.fn as unknown as any)().mockResolvedValue({
      // `in` not `??`: an explicit null must override the default, or a test
      // for the absent case silently exercises the populated one.
      name: 'companyName' in opts ? opts.companyName : 'Acme Sdn Bhd',
      registrationNumber:
        'companyRegistrationNumber' in opts ? opts.companyRegistrationNumber : '201901234567',
    }),
  };
  const lineRepo = {} as any;

  const service = new FormBService(
    coaRepo as any, lineRepo, balance as any, settings as any,
    accountingReport as any, companySettings as any,
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

  /*
   * FORM_VERSION is a FLOOR, not an exact match: the Bahagian N field set
   * carries forward, so 2025 and every later year use this layout legitimately
   * and must not warn. Only an EARLIER year is suspect.
   *
   * The 2026 case is the one that matters — under the previous exact-match rule
   * it warned, which was permanent noise on a correct report.
   */
  it.each([
    [2024, true],
    [2025, false],
    [2026, false],
    [2030, false],
  ])('year %i raises FORM_VERSION_MISMATCH: %s', async (year, expected) => {
    const res = await buildService({}).getFormB({ year });
    expect(res.formVersion).toBe(2025);
    expect(codes(res).includes('FORM_VERSION_MISMATCH')).toBe(expected);
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

describe('FormBService — identity from Company Settings', () => {
  it('reads N1 and N1a from Company Settings', async () => {
    const res = await buildService({
      companyName: 'Acme Sdn Bhd', companyRegistrationNumber: '201901234567',
    }).getFormB({ year: YEAR });
    expect(res.identity.businessName).toEqual({
      value: 'Acme Sdn Bhd', source: 'companySettings',
    });
    expect(res.identity.registrationNumber).toEqual({
      value: '201901234567', source: 'companySettings',
    });
    expect(codes(res)).not.toContain('MISSING_BUSINESS_IDENTITY');
  });

  // The settings row is seeded with blank defaults, so '' means "never filled
  // in" and must warn rather than print an empty identity on a filing.
  it('treats a blank company value as absent and warns', async () => {
    const res = await buildService({
      companyName: '   ', companyRegistrationNumber: null,
    }).getFormB({ year: YEAR });
    expect(res.identity.businessName).toEqual({ value: null, source: null });
    expect(res.identity.registrationNumber).toEqual({ value: null, source: null });
    const finding = res.findings.find((f) => f.code === 'MISSING_BUSINESS_IDENTITY')!;
    expect(finding.settingKey).toBe('companySettings');
    expect(finding.message).toMatch(/Company Settings/);
  });

  /*
   * Company Settings is authoritative: whatever is configured there is used
   * verbatim, seeded placeholders included. The report does not second-guess
   * the configured value.
   */
  it('uses the configured identity verbatim, including seeded placeholders', async () => {
    const res = await buildService({
      companyName: 'Your Company Name',
      companyRegistrationNumber: 'Your Registration Number',
    }).getFormB({ year: YEAR });
    expect(res.identity.businessName).toEqual({
      value: 'Your Company Name', source: 'companySettings',
    });
    expect(res.identity.registrationNumber).toEqual({
      value: 'Your Registration Number', source: 'companySettings',
    });
    expect(codes(res)).not.toContain('MISSING_BUSINESS_IDENTITY');
  });

  // A real value that merely resembles the placeholder must still be used.
  it('does not swallow a real value containing placeholder-like words', async () => {
    const res = await buildService({
      companyName: 'Your Company Name Sdn Bhd',
      companyRegistrationNumber: '201901234567',
    }).getFormB({ year: YEAR });
    expect(res.identity.businessName.value).toBe('Your Company Name Sdn Bhd');
    expect(res.identity.registrationNumber.value).toBe('201901234567');
  });

  // N2 and N2a are not modelled at all — nothing in this ERP holds them.
  it('exposes only N1 and N1a', async () => {
    const res = await buildService({}).getFormB({ year: YEAR });
    expect(Object.keys(res.identity).sort()).toEqual(['businessName', 'registrationNumber']);
  });
});

describe('FormBService — fallback warnings follow row availability', () => {
  const unmappedExpense = [
    acc({ id: 'inv', code: '1300', name: 'Inventory', type: 'Asset' }),
    acc({ id: 'rev', code: '4100', name: 'Sales Revenue', type: 'Income' }),
    acc({ id: 'cogs', code: '5100', name: 'COGS', type: 'Expense' }),
    acc({ id: 'sun', code: '6990', name: 'Sundry', type: 'Expense' }),
  ];

  it('warns about an unmapped expense account when N24 is available', async () => {
    const svc = buildService({ accounts: unmappedExpense });
    jest.spyOn(svc as any, 'getMovements')
      .mockResolvedValue(new Map([['sun', 5_0000n]]));
    const res = await svc.getFormB({ year: YEAR });
    expect(codes(res)).toContain('UNMAPPED_EXPENSE_ACCOUNTS');
  });

  // A warning pointing at a row rendered as an em dash is noise that buries the
  // configured-root finding, which is the actual problem.
  it('suppresses the N24 warning when the COGS root is unavailable', async () => {
    const svc = buildService({
      accounts: unmappedExpense, settings: { cogsAccountId: null },
    });
    jest.spyOn(svc as any, 'getMovements')
      .mockResolvedValue(new Map([['sun', 5_0000n]]));
    const res = await svc.getFormB({ year: YEAR });
    expect(codes(res)).not.toContain('UNMAPPED_EXPENSE_ACCOUNTS');
    expect(codes(res)).toContain('MISSING_CONFIGURED_ROOT');
  });

  it('suppresses the N13 warning when the Sales Revenue root is unavailable', async () => {
    const svc = buildService({
      accounts: [...unmappedExpense, acc({ id: 'oi', code: '4300', name: 'Other', type: 'Income' })],
      settings: { salesRevenueAccountId: null },
    });
    jest.spyOn(svc as any, 'getMovements')
      .mockResolvedValue(new Map([['oi', -5_0000n]]));
    const res = await svc.getFormB({ year: YEAR });
    expect(codes(res)).not.toContain('UNMAPPED_INCOME_ACCOUNTS');
  });
});

describe('FormBService — Accounting View integrity relay', () => {
  it('relays a tie-out failure', async () => {
    const res = await buildService({
      plIntegrity: { anomalies: [], structuralFaults: [], tieOutOk: false, independentNetProfit: '1.0000' },
    }).getFormB({ year: YEAR });
    expect(codes(res)).toContain('ACCOUNTING_VIEW_TIE_OUT_FAILED');
  });

  it('relays assignment anomalies', async () => {
    const res = await buildService({
      plIntegrity: {
        anomalies: [{ accountId: 'a1', code: '6100', name: 'Salaries', component: 'ordinary', count: 2 }],
        structuralFaults: [], tieOutOk: true, independentNetProfit: '0.0000',
      },
    }).getFormB({ year: YEAR });
    expect(codes(res)).toContain('ACCOUNTING_VIEW_ANOMALIES');
  });

  // structuralFaults gets its OWN code, not a broadened anomalies code: a
  // structural fault ties out cleanly, so folding the two together would let a
  // fault hide behind a passing tie-out.
  it('relays a structural fault with no Form B counterpart', async () => {
    const res = await buildService({
      plIntegrity: {
        anomalies: [],
        structuralFaults: [{
          kind: 'parentCycle', settingKey: null,
          accounts: [{ accountId: 'x9', code: '6500', name: 'Odd' }],
        }],
        tieOutOk: true, independentNetProfit: '0.0000',
      },
    }).getFormB({ year: YEAR });
    expect(codes(res)).toContain('ACCOUNTING_VIEW_STRUCTURAL_FAULTS');
  });

  // Dedup by settingKey: Form B already reported this exact defect, so relaying
  // it too would inflate readiness.counts and overstate how much is broken.
  it('suppresses a structural fault whose settingKey Form B already reported', async () => {
    const res = await buildService({
      settings: { inventoryAccountId: null },
      plIntegrity: {
        anomalies: [],
        structuralFaults: [{
          kind: 'missingConfiguredAccount', settingKey: 'inventoryAccountId', accounts: [],
        }],
        tieOutOk: true, independentNetProfit: '0.0000',
      },
    }).getFormB({ year: YEAR });
    expect(codes(res)).toContain('MISSING_CONFIGURED_ROOT');
    expect(codes(res)).not.toContain('ACCOUNTING_VIEW_STRUCTURAL_FAULTS');
  });

  it('suppresses a structural fault naming an account Form B already reported', async () => {
    const cyclic = [
      acc({ id: 'inv', code: '1300', name: 'Inventory', type: 'Asset', parentId: 'c1' }),
      acc({ id: 'c1', code: '1310', name: 'Child', type: 'Asset', parentId: 'inv' }),
      acc({ id: 'rev', code: '4100', name: 'Sales Revenue', type: 'Income' }),
      acc({ id: 'cogs', code: '5100', name: 'COGS', type: 'Expense' }),
    ];
    const res = await buildService({
      accounts: cyclic,
      plIntegrity: {
        anomalies: [],
        structuralFaults: [{
          kind: 'parentCycle', settingKey: null,
          accounts: [{ accountId: 'inv', code: '1300', name: 'Inventory' }],
        }],
        tieOutOk: true, independentNetProfit: '0.0000',
      },
    }).getFormB({ year: YEAR });
    expect(codes(res)).toContain('INVALID_CONFIGURED_ROOT');
    expect(codes(res)).not.toContain('ACCOUNTING_VIEW_STRUCTURAL_FAULTS');
  });

  it('keeps readiness counts equal to the rendered findings list', async () => {
    const res = await buildService({
      settings: { inventoryAccountId: null },
      plIntegrity: {
        anomalies: [],
        structuralFaults: [{
          kind: 'missingConfiguredAccount', settingKey: 'inventoryAccountId', accounts: [],
        }],
        tieOutOk: true, independentNetProfit: '0.0000',
      },
    }).getFormB({ year: YEAR });
    const actual = {
      warning: res.findings.filter((f) => f.severity === 'warning').length,
      incomplete: res.findings.filter((f) => f.severity === 'incomplete').length,
      integrity: res.findings.filter((f) => f.severity === 'integrity').length,
    };
    expect(res.readiness.counts).toEqual(actual);
  });
});
