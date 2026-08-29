import { classify, auditAssignments, assembleSections } from './profit-and-loss.classify';
import type { PlAccount, AccountMovement } from './profit-and-loss.types';

const ACCOUNTS: PlAccount[] = [
  { id: 'inc-root', code: '4000', name: 'Income', type: 'Income', parentId: null, isPostable: false },
  { id: 'sales', code: '4100', name: 'Sales Revenue', type: 'Income', parentId: 'inc-root', isPostable: true },
  { id: 'misc-inc', code: '4900', name: 'Misc Income', type: 'Income', parentId: 'inc-root', isPostable: true },
  { id: 'cos-root', code: '5000', name: 'Cost of Sales', type: 'Expense', parentId: null, isPostable: false },
  { id: 'cogs', code: '5100', name: 'COGS', type: 'Expense', parentId: 'cos-root', isPostable: true },
  { id: 'exp-root', code: '6000', name: 'Expenses', type: 'Expense', parentId: null, isPostable: false },
  { id: 'other-exp', code: '6990', name: 'Other Expenses', type: 'Expense', parentId: 'exp-root', isPostable: true },
];

const mv = (accountId: string, ordinary: bigint, stockAdjustment = 0n): AccountMovement =>
  ({ accountId, ordinary, stockAdjustment });

const base = (movements: AccountMovement[]) => ({
  accounts: ACCOUNTS,
  movements,
  salesRevenueAccountId: 'sales',
  cogsAccountId: 'cogs',
});

describe('classify — section assignment', () => {
  it('routes each account to exactly one section', () => {
    const res = classify(base([
      mv('sales', 1200000000n),
      mv('misc-inc', 5000000n),
      mv('cogs', 630000000n),
      mv('other-exp', 80000000n),
    ]));

    expect(res.assignments.get('revenue')!.get('sales')).toBe(1200000000n);
    expect(res.assignments.get('otherIncome')!.get('misc-inc')).toBe(5000000n);
    expect(res.assignments.get('cogs')!.get('cogs')).toBe(630000000n);
    expect(res.assignments.get('expenses')!.get('other-exp')).toBe(80000000n);
    expect(res.anomalies).toEqual([]);
    expect(res.structuralFaults).toEqual([]);
  });

  it('puts Income outside the Sales Revenue subtree into Other Income', () => {
    const res = classify(base([mv('misc-inc', 5000000n)]));
    expect(res.assignments.get('revenue')!.size).toBe(0);
    expect(res.assignments.get('otherIncome')!.get('misc-inc')).toBe(5000000n);
  });

  it('puts Expense outside the COGS subtree into Operating Expenses', () => {
    const res = classify(base([mv('other-exp', 80000000n)]));
    expect(res.assignments.get('cogs')!.size).toBe(0);
    expect(res.assignments.get('expenses')!.get('other-exp')).toBe(80000000n);
  });
});

describe('classify — stock adjustments (spec 4.2)', () => {
  it('claims stock-adjustment lines exclusively, keeping them out of expenses', () => {
    const res = classify(base([mv('other-exp', 80000000n, 2000000n)]));
    expect(res.inventoryAdjustments).toBe(2000000n);
    expect(res.assignments.get('expenses')!.get('other-exp')).toBe(80000000n);
  });

  // A stock adjustment posts a BALANCED journal: Dr Inventory / Cr Expense (or
  // the reverse). Both legs carry a stockAdjustment component, so summing the
  // component across every account is identically zero. Only the Expense leg
  // is a cost. A fixture without the Inventory leg cannot catch this.
  it('counts only the Expense leg, ignoring the balancing Inventory leg', () => {
    const accounts = [...ACCOUNTS, {
      id: 'inv', code: '1300', name: 'Inventory',
      type: 'Asset', parentId: null, isPostable: true,
    }];
    const res = classify({
      accounts,
      movements: [
        mv('other-exp', 0n, 2000000n),  // Expense leg  — the cost
        mv('inv', 0n, -2000000n),       // Inventory leg — balancing, ignored
      ],
      salesRevenueAccountId: 'sales',
      cogsAccountId: 'cogs',
    });
    expect(res.inventoryAdjustments).toBe(2000000n); // NOT 0n
    expect(res.anomalies).toEqual([]); // the Asset leg is not an anomaly
  });

  it('ignores Asset and Equity ordinary movements without flagging them', () => {
    const accounts = [...ACCOUNTS,
      { id: 'inv', code: '1300', name: 'Inventory', type: 'Asset', parentId: null, isPostable: true },
      { id: 'draw', code: '3300', name: 'Owner Drawings', type: 'Equity', parentId: null, isPostable: true },
    ];
    const res = classify({
      accounts,
      movements: [mv('inv', 5000000n), mv('draw', 3000000n)],
      salesRevenueAccountId: 'sales',
      cogsAccountId: 'cogs',
    });
    expect(res.anomalies).toEqual([]);
    for (const k of ['revenue', 'cogs', 'otherIncome', 'expenses'] as const) {
      expect(res.assignments.get(k)!.size).toBe(0);
    }
  });

  it('keeps them out of the COGS row even when cogs and defaultExpense alias', () => {
    // The aliasing case: settings validate both as UUIDs of an Expense-type
    // account with no distinctness constraint, so this is reachable.
    const res = classify({
      accounts: ACCOUNTS,
      movements: [mv('cogs', 630000000n, 2000000n)],
      salesRevenueAccountId: 'sales',
      cogsAccountId: 'cogs',
    });
    expect(res.inventoryAdjustments).toBe(2000000n);
    expect(res.assignments.get('cogs')!.get('cogs')).toBe(630000000n);
    expect(res.anomalies).toEqual([]);
  });

  it('nets signed adjustments across accounts', () => {
    const res = classify(base([
      mv('other-exp', 0n, 3000000n),
      mv('cogs', 0n, -1000000n),
    ]));
    expect(res.inventoryAdjustments).toBe(2000000n);
  });
});

describe('classify — assignment counter (spec 7.3)', () => {
  it('does NOT flag an account holding both ordinary and adjustment money', () => {
    // The 6990 false-positive guard: account-level counting would say 2.
    const res = classify(base([mv('other-exp', 80000000n, 2000000n)]));
    expect(res.anomalies).toEqual([]);
  });

  it('ignores zero components', () => {
    const res = classify(base([mv('other-exp', 80000000n, 0n)]));
    expect(res.anomalies).toEqual([]);
  });

  it('flags movement on an account absent from the chart entirely', () => {
    const res = classify(base([mv('ghost', 4200000n)]));
    expect(res.anomalies).toEqual([
      { accountId: 'ghost', code: '(unknown)', name: '(unknown account)', component: 'ordinary', count: 0 },
    ]);
  });
});

// The audit is tested directly, because `classify` cannot currently produce a
// double-count — and a test that can only ever assert the happy path would not
// notice if the audit stopped working.
describe('auditAssignments (spec 7.3)', () => {
  const describe_ = (id: string) => {
    const a = ACCOUNTS.find((x) => x.id === id);
    return { code: a?.code ?? '(unknown)', name: a?.name ?? '(unknown account)' };
  };
  const emptyMaps = () => new Map<any, Map<string, bigint>>([
    ['revenue', new Map()], ['cogs', new Map()],
    ['otherIncome', new Map()], ['expenses', new Map()],
  ]);

  it('reports count 0 when an expected P&L component reached no section', () => {
    const assignments = emptyMaps(); // classification dropped it
    const anomalies = auditAssignments({
      accounts: ACCOUNTS,
      movements: [mv('other-exp', 80000000n)],
      assignments: assignments as any,
      counts: new Map(),
      describe: describe_,
    });
    expect(anomalies).toEqual([
      { accountId: 'other-exp', code: '6990', name: 'Other Expenses', component: 'ordinary', count: 0 },
    ]);
  });

  it('reports count 2 when one account landed in two sections', () => {
    const assignments = emptyMaps();
    assignments.get('cogs')!.set('other-exp', 80000000n);
    assignments.get('expenses')!.set('other-exp', 80000000n);

    const anomalies = auditAssignments({
      accounts: ACCOUNTS,
      movements: [mv('other-exp', 80000000n)],
      assignments: assignments as any,
      counts: new Map(),
      describe: describe_,
    });
    expect(anomalies).toEqual([
      { accountId: 'other-exp', code: '6990', name: 'Other Expenses', component: 'ordinary', count: 2 },
    ]);
  });

  it('reports a stock-adjustment component that was never claimed', () => {
    const assignments = emptyMaps();
    assignments.get('expenses')!.set('other-exp', 80000000n);
    const anomalies = auditAssignments({
      accounts: ACCOUNTS,
      movements: [mv('other-exp', 80000000n, 2000000n)],
      assignments: assignments as any,
      counts: new Map(), // never bumped
      describe: describe_,
    });
    expect(anomalies).toEqual([
      { accountId: 'other-exp', code: '6990', name: 'Other Expenses', component: 'stockAdjustment', count: 0 },
    ]);
  });

  it('stays silent when every component is placed exactly once', () => {
    const assignments = emptyMaps();
    assignments.get('expenses')!.set('other-exp', 80000000n);
    const anomalies = auditAssignments({
      accounts: ACCOUNTS,
      movements: [mv('other-exp', 80000000n, 2000000n)],
      assignments: assignments as any,
      counts: new Map([['other-exp::stockAdjustment', 1]]),
      describe: describe_,
    });
    expect(anomalies).toEqual([]);
  });
});

describe('classify — structural validation (spec 7.3)', () => {
  it('reports a dangling salesRevenueAccountId even though everything ties', () => {
    const res = classify({
      accounts: ACCOUNTS,
      movements: [mv('sales', 1200000000n)],
      salesRevenueAccountId: 'does-not-exist',
      cogsAccountId: 'cogs',
    });
    expect(res.structuralFaults).toEqual([
      { kind: 'missingConfiguredAccount', settingKey: 'salesRevenueAccountId', accounts: [] },
    ]);
    // The point of this check: the counter stays clean, so it alone would miss this.
    expect(res.anomalies).toEqual([]);
    expect(res.assignments.get('otherIncome')!.get('sales')).toBe(1200000000n);
  });

  it('reports a configured account of the WRONG TYPE, which also ties out', () => {
    const res = classify({
      accounts: ACCOUNTS,
      movements: [mv('sales', 1200000000n)],
      salesRevenueAccountId: 'other-exp', // an Expense account
      cogsAccountId: 'cogs',
    });
    expect(res.structuralFaults).toEqual([
      { kind: 'missingConfiguredAccount', settingKey: 'salesRevenueAccountId', accounts: [] },
    ]);
    expect(res.anomalies).toEqual([]); // existence check alone would miss this
  });

  it('reports a null cogsAccountId', () => {
    const res = classify({
      accounts: ACCOUNTS,
      movements: [],
      salesRevenueAccountId: 'sales',
      cogsAccountId: null,
    });
    expect(res.structuralFaults).toEqual([
      { kind: 'missingConfiguredAccount', settingKey: 'cogsAccountId', accounts: [] },
    ]);
  });

  it('reports a dangling parent', () => {
    const accounts = [...ACCOUNTS, {
      id: 'orphan', code: '6800', name: 'Orphan',
      type: 'Expense', parentId: 'vanished', isPostable: true,
    }];
    const res = classify({
      accounts, movements: [mv('orphan', 1000000n)],
      salesRevenueAccountId: 'sales', cogsAccountId: 'cogs',
    });
    expect(res.structuralFaults).toEqual([
      {
        kind: 'danglingParent', settingKey: null,
        accounts: [{ accountId: 'orphan', code: '6800', name: 'Orphan' }],
      },
    ]);
    expect(res.anomalies).toEqual([]); // still classified exactly once
  });

  it('reports a cycle AND still classifies, without hanging', () => {
    const accounts: PlAccount[] = [...ACCOUNTS,
      { id: 'x', code: '6810', name: 'X', type: 'Expense', parentId: 'y', isPostable: true },
      { id: 'y', code: '6820', name: 'Y', type: 'Expense', parentId: 'x', isPostable: true },
    ];
    const res = classify({
      accounts, movements: [mv('x', 1000000n)],
      salesRevenueAccountId: 'sales', cogsAccountId: 'cogs',
    });
    expect(res.structuralFaults.map((f) => f.kind)).toContain('parentCycle');
    expect(res.assignments.get('expenses')!.get('x')).toBe(1000000n);
  }, 5000); // fails by timeout if traversal is not cycle-safe
});

describe('assembleSections — category anchoring (spec 4.1.1)', () => {
  it('anchors on the first branch below the root, not the root', () => {
    const assignments = new Map([
      ['revenue', new Map()],
      ['cogs', new Map()],
      ['otherIncome', new Map()],
      ['expenses', new Map([['other-exp', 80000000n]])],
    ] as any);

    const sections = assembleSections(ACCOUNTS, assignments as any);
    const expenses = sections.find((s) => s.key === 'expenses')!;

    // 6990, NOT 6000.
    expect(expenses.rows.map((r) => r.code)).toEqual(['6990']);
    expect(expenses.total).toBe('8000.0000');
  });

  it('renders a postable category with no children, so it is not shown twice', () => {
    const assignments = new Map([
      ['revenue', new Map()], ['cogs', new Map()], ['otherIncome', new Map()],
      ['expenses', new Map([['other-exp', 80000000n]])],
    ] as any);

    const expenses = assembleSections(ACCOUNTS, assignments as any)
      .find((s) => s.key === 'expenses')!;

    expect(expenses.rows[0].isPostable).toBe(true);
    expect(expenses.rows[0].children).toEqual([]); // 6990 not its own child
  });

  it('expands a structural category over its postable descendants', () => {
    const accounts: PlAccount[] = [...ACCOUNTS,
      { id: 'overheads', code: '6500', name: 'Overheads', type: 'Expense', parentId: 'exp-root', isPostable: false },
      { id: 'phone', code: '6920', name: 'Telephone', type: 'Expense', parentId: 'overheads', isPostable: true },
      { id: 'power', code: '6930', name: 'Electricity', type: 'Expense', parentId: 'overheads', isPostable: true },
    ];
    const assignments = new Map([
      ['revenue', new Map()], ['cogs', new Map()], ['otherIncome', new Map()],
      ['expenses', new Map([['phone', 7300000n], ['power', 2700000n]])],
    ] as any);

    const expenses = assembleSections(accounts, assignments as any)
      .find((s) => s.key === 'expenses')!;
    const overheads = expenses.rows.find((r) => r.code === '6500')!;

    expect(overheads.isPostable).toBe(false);
    expect(overheads.amount).toBe('1000.0000');
    expect(overheads.children.map((c) => c.code)).toEqual(['6920', '6930']);
    expect(expenses.total).toBe('1000.0000');
  });

  it('sums only classified contributions, never re-walking excluded subtrees', () => {
    // COGS is classified into its own section; the Expenses section must not
    // pick it up even though both are Expense-typed.
    const assignments = new Map([
      ['revenue', new Map()],
      ['cogs', new Map([['cogs', 630000000n]])],
      ['otherIncome', new Map()],
      ['expenses', new Map([['other-exp', 80000000n]])],
    ] as any);

    const sections = assembleSections(ACCOUNTS, assignments as any);
    expect(sections.find((s) => s.key === 'expenses')!.total).toBe('8000.0000');
    expect(sections.find((s) => s.key === 'cogs')!.total).toBe('63000.0000');
  });

  it('returns all four sections with zero totals when nothing is classified', () => {
    const assignments = new Map([
      ['revenue', new Map()], ['cogs', new Map()],
      ['otherIncome', new Map()], ['expenses', new Map()],
    ] as any);
    const sections = assembleSections(ACCOUNTS, assignments as any);
    expect(sections.map((s) => s.key)).toEqual(['revenue', 'cogs', 'otherIncome', 'expenses']);
    expect(sections.every((s) => s.total === '0.0000')).toBe(true);
  });

  it('orders rows by account code', () => {
    const accounts: PlAccount[] = [...ACCOUNTS,
      { id: 'aaa', code: '6100', name: 'Aaa', type: 'Expense', parentId: 'exp-root', isPostable: true },
    ];
    const assignments = new Map([
      ['revenue', new Map()], ['cogs', new Map()], ['otherIncome', new Map()],
      ['expenses', new Map([['other-exp', 1n], ['aaa', 1n]])],
    ] as any);
    const expenses = assembleSections(accounts, assignments as any)
      .find((s) => s.key === 'expenses')!;
    expect(expenses.rows.map((r) => r.code)).toEqual(['6100', '6990']);
  });
});
