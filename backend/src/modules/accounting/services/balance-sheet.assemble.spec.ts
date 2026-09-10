// balance-sheet.assemble.spec.ts
import {
  assembleBalanceSheet, deriveTotals,
  type AssembleInput, type AssembleAccount,
} from './balance-sheet.assemble';
import type { BalanceCheckReason } from './balance-sheet.types';

const CASH = 'acc-cash', BANK = 'acc-bank', DRAW = 'acc-draw', CAP = 'acc-cap';
const OBE = 'acc-obe', CUSTDEP = 'acc-custdep';

const acc = (id: string, code: string, name: string, type: string): AssembleAccount =>
  ({ id, code, name, type, isPostable: true });

const ACCOUNTS: AssembleAccount[] = [
  acc(CASH, '1100', 'Cash', 'Asset'),
  acc(BANK, '1200', 'Bank', 'Asset'),
  acc(CUSTDEP, '2100', 'Customer Deposit', 'Liability'),
  acc(CAP, '3100', 'Owner Capital', 'Equity'),
  acc(OBE, '3200', 'Opening Balance Equity', 'Equity'),
  acc(DRAW, '3300', 'Owner Drawings', 'Equity'),
];

const SETTINGS = {
  cashAccountId: CASH, bankAccountId: BANK, inventoryAccountId: null,
  supplierDepositAccountId: null, customerDepositAccountId: CUSTDEP,
  ownerCapitalAccountId: CAP, ownerDrawingsAccountId: DRAW,
};

// RM in scale-4 minor units.
const rm = (n: number) => BigInt(Math.round(n * 10000));

const base = (over: Partial<AssembleInput> = {}): AssembleInput => ({
  accounts: ACCOUNTS,
  atDate: new Map(),
  preYear: new Map(),
  settingsAccountIds: SETTINGS,
  openingBalanceEquityAccountId: OBE,
  netProfit: 0n,
  priorProfitValid: true,
  profitFindings: [],
  ...over,
});

const rowOf = (out: ReturnType<typeof assembleBalanceSheet>, line: string) =>
  out.rows.find((r) => r.line === line)!;

describe('assembleBalanceSheet', () => {
  it('always emits all 23 rows N28..N50 even with no activity', () => {
    const out = assembleBalanceSheet(base());
    expect(out.rows).toHaveLength(23);
    expect(out.rows[0].line).toBe('N28');
    expect(out.rows[22].line).toBe('N50');
    expect(rowOf(out, 'N37').amount).toBe('0.0000');
    expect(out.balanceCheck.status).toBe('balanced');
  });

  it('maps by configured ID, not by account code', () => {
    // A decoy coded 1100 that is NOT the configured cash account must not map.
    const decoy = acc('acc-decoy', '1100', 'Legacy Cash', 'Asset');
    const recoded = acc(CASH, '9999', 'Cash Renamed', 'Asset');
    const out = assembleBalanceSheet(base({
      accounts: [recoded, decoy, ...ACCOUNTS.filter((a) => a.id !== CASH)],
      atDate: new Map([[CASH, rm(500)], ['acc-decoy', rm(70)]]),
    }));
    // Configured account maps despite its new code…
    expect(rowOf(out, 'N37').amount).toBe('500.0000');
    // …and the decoy is unmapped, which disqualifies the check.
    expect(out.balanceCheck.status).toBe('unavailable');
    const reason = out.balanceCheck.reasons.find((r: BalanceCheckReason) => r.code === 'UNMAPPED_BALANCES')!;
    expect(reason.accounts.map((a) => a.accountId)).toContain('acc-decoy');
  });

  it('computes N49 as PERIOD MOVEMENT, not the closing balance', () => {
    // Drawings are DEBITS to a credit-normal Equity account, so raw is positive
    // and naturalBalance() flips it negative. Prior 300, current 200 => raw
    // closing 500.
    //
    // Two failure modes this pins at once:
    //   closing balance instead of movement  => '-500.0000'
    //   an extra negation after natural()    => '200.0000'
    const out = assembleBalanceSheet(base({
      atDate: new Map([[DRAW, rm(500)]]),
      preYear: new Map([[DRAW, rm(300)]]),
    }));
    expect(rowOf(out, 'N49').amount).toBe('-200.0000');
  });

  it('includes the pre-year drawings balance in N47, signed as a reduction', () => {
    // Subtracting the already-negative natural balance would yield '300.0000',
    // making past withdrawals INCREASE owner equity.
    const out = assembleBalanceSheet(base({
      preYear: new Map([[DRAW, rm(300)]]),
    }));
    expect(rowOf(out, 'N47').amount).toBe('-300.0000');
  });

  it('keeps the equation balanced across a two-year drawings history', () => {
    // The end-to-end guard on both signs at once. Capital 1000 injected in the
    // prior year, 300 drawn then, 200 drawn now; cash therefore holds 500.
    //   N41 = 500
    //   N45 = 0, N46 = 1000, N47 = -300, N48 = 0, N49 = -200 => N50 = -500
    //   N45 + N46 + N50 = 500  => balanced
    const out = assembleBalanceSheet(base({
      atDate: new Map([[CASH, rm(500)], [CAP, -rm(1000)], [DRAW, rm(500)]]),
      preYear: new Map([[CAP, -rm(1000)], [DRAW, rm(300)]]),
    }));
    expect(rowOf(out, 'N50').amount).toBe('-500.0000');
    expect(out.balanceCheck.status).toBe('balanced');
  });

  it('computes N50 = N47 + N48 + N49', () => {
    const out = assembleBalanceSheet(base({
      atDate: new Map([[DRAW, rm(500)]]),
      preYear: new Map([[DRAW, rm(300)]]),
      netProfit: rm(1000),
    }));
    // N47 = -300, N48 = 1000, N49 = -200 => 500
    expect(rowOf(out, 'N50').amount).toBe('500.0000');
  });

  it('computes the asset and liability totals', () => {
    const out = assembleBalanceSheet(base({
      atDate: new Map([[CASH, rm(400)], [BANK, rm(600)], [CUSTDEP, -rm(250)]]),
    }));
    expect(rowOf(out, 'N40').amount).toBe('1000.0000');
    expect(rowOf(out, 'N41').amount).toBe('1000.0000');
    expect(rowOf(out, 'N45').amount).toBe('250.0000');
  });

  it('reports balanced when assets equal liabilities plus equity', () => {
    // Cash 1000 = Customer Deposit 250 + Capital 750
    const out = assembleBalanceSheet(base({
      atDate: new Map([[CASH, rm(1000)], [CUSTDEP, -rm(250)], [CAP, -rm(750)]]),
    }));
    expect(out.balanceCheck.status).toBe('balanced');
    expect(out.balanceCheck.difference).toBe('0.0000');
    expect(out.balanceCheck.reasons).toEqual([]);
  });

  it('reports outOfBalance with the difference when the equation fails', () => {
    const out = assembleBalanceSheet(base({
      atDate: new Map([[CASH, rm(1000)], [CAP, -rm(600)]]),
    }));
    expect(out.balanceCheck.status).toBe('outOfBalance');
    expect(out.balanceCheck.difference).toBe('400.0000');
  });

  it('nulls N48 and N50 on selected-year profit failure but LEAVES N47', () => {
    const out = assembleBalanceSheet(base({
      preYear: new Map([[DRAW, rm(300)]]),
      netProfit: null,
      priorProfitValid: true,
    }));
    expect(rowOf(out, 'N47').amount).toBe('-300.0000');
    expect(rowOf(out, 'N48').amount).toBeNull();
    expect(rowOf(out, 'N50').amount).toBeNull();
    expect(out.balanceCheck.status).toBe('unavailable');
    expect(out.balanceCheck.difference).toBeNull();
    const r = out.balanceCheck.reasons.find((x: BalanceCheckReason) => x.code === 'PROFIT_INTEGRITY')!;
    expect(r.scope).toBe('selectedYear');
    expect(r.affectedLines).toEqual(['N48', 'N50']);
  });

  it('serializes an unknown line as null, never as 0.0000', () => {
    const out = assembleBalanceSheet(base({ netProfit: null }));
    // The `?? 0n` trap: a defaulted read would render these as '0.0000',
    // asserting a figure the backend explicitly declined to compute.
    expect(rowOf(out, 'N48').amount).toBeNull();
    expect(rowOf(out, 'N50').amount).toBeNull();
    expect(out.balanceCheck.totalLiabilitiesAndEquity).toBeNull();
  });

  it('nulls BOTH N47 and N48 when the prior period is also invalid', () => {
    const out = assembleBalanceSheet(base({ netProfit: null, priorProfitValid: false }));
    expect(rowOf(out, 'N47').amount).toBeNull();
    expect(rowOf(out, 'N48').amount).toBeNull();
    expect(rowOf(out, 'N50').amount).toBeNull();
  });

  it('detects an unmapped account with a prior-year balance and NO current movement', () => {
    const stray = acc('acc-stray', '1900', 'Stray Asset', 'Asset');
    const out = assembleBalanceSheet(base({
      accounts: [...ACCOUNTS, stray],
      atDate: new Map([['acc-stray', rm(120)]]),
      preYear: new Map([['acc-stray', rm(120)]]),   // identical => zero movement
    }));
    expect(out.balanceCheck.status).toBe('unavailable');
    const f = out.findings.find((x) => x.code === 'UNMAPPED_BALANCE_ACCOUNTS')!;
    expect(f.accounts[0]).toMatchObject({ code: '1900', amount: '120.0000' });
  });

  it('flags a non-zero Opening Balance Equity balance EVEN WHEN it is also mapped', () => {
    // Regression: OBE detection used to live inside the unmapped-account loop,
    // after `if (mappedIds.has(a.id)) continue`. A misconfiguration that points
    // another settings key at the OBE account made it "mapped", so the loop
    // skipped it and a live clearing balance produced NO warning and a green
    // "Balanced". A setup/clearing balance is a fact about the account's own
    // balance, independent of how it happens to be mapped.
    const out = assembleBalanceSheet(base({
      // Capital is configured to point AT the Opening Balance Equity account.
      settingsAccountIds: { ...SETTINGS, ownerCapitalAccountId: OBE },
      atDate: new Map([[CASH, rm(90)], [OBE, -rm(90)]]),
    }));
    expect(out.balanceCheck.status).toBe('unavailable');
    expect(out.balanceCheck.difference).toBeNull();
    const obe = out.findings.find((x) => x.code === 'OPENING_BALANCE_EQUITY_NONZERO');
    expect(obe).toBeDefined();
    expect(obe!.accounts.map((a) => a.accountId)).toContain(OBE);
    // Narrow first: the union types `reasons` as [] on settled statuses, so
    // reading .code without this is a type error — the contract working.
    if (out.balanceCheck.status !== 'unavailable') throw new Error('expected unavailable');
    const reason = out.balanceCheck.reasons.find((r) => r.code === 'UNMAPPED_BALANCES')!;
    expect(reason.accounts.map((a) => a.accountId)).toContain(OBE);
  });

  it('reports an unmapped OBE account only once', () => {
    // It qualifies under BOTH scans; the blocking list is deduplicated by id.
    const out = assembleBalanceSheet(base({ atDate: new Map([[OBE, -rm(50)]]) }));
    if (out.balanceCheck.status !== 'unavailable') throw new Error('expected unavailable');
    const reason = out.balanceCheck.reasons.find((r) => r.code === 'UNMAPPED_BALANCES')!;
    expect(reason.accounts.filter((a) => a.accountId === OBE)).toHaveLength(1);
  });

  it('forces unavailable on a non-zero Opening Balance Equity balance', () => {
    const out = assembleBalanceSheet(base({ atDate: new Map([[OBE, -rm(90)]]) }));
    expect(out.balanceCheck.status).toBe('unavailable');
    expect(out.balanceCheck.difference).toBeNull();
    const obe = out.findings.find((x) => x.code === 'OPENING_BALANCE_EQUITY_NONZERO')!;
    expect(obe.accounts[0]).toMatchObject({ accountId: OBE, amount: '90.0000' });
    const reason = out.balanceCheck.reasons.find((r: BalanceCheckReason) => r.code === 'UNMAPPED_BALANCES')!;
    expect(reason.accounts.map((a) => a.accountId)).toContain(OBE);
  });

  it('renders anomalies as warnings without nulling anything', () => {
    const out = assembleBalanceSheet(base({
      netProfit: rm(10),
      profitFindings: [{
        code: 'PROFIT_ANOMALIES', severity: 'warning', scope: 'selectedYear',
        affectedLines: ['N48'], message: 'anomaly', accounts: [],
      }],
    }));
    expect(rowOf(out, 'N48').amount).toBe('10.0000');
    expect(out.balanceCheck.status).not.toBe('unavailable');
    expect(out.findings.some((f) => f.code === 'PROFIT_ANOMALIES')).toBe(true);
  });

  it('excludes non-postable parent accounts from unmapped detection', () => {
    const parent: AssembleAccount = { ...acc('acc-root', '1000', 'Assets', 'Asset'), isPostable: false };
    const out = assembleBalanceSheet(base({
      accounts: [...ACCOUNTS, parent],
      atDate: new Map([['acc-root', rm(999)]]),
    }));
    expect(out.balanceCheck.status).toBe('balanced');
  });

  // ---- Derived presentation subtotals (#1212) ------------------------------
  // These are NOT LHDN fields and carry no N-code. They live on
  // `derivedTotals`, never in rows[], which stays exactly N28..N50.

  it('computes the derived subtotals from N45, N46 and N50', () => {
    // Capital 70,000 credit (Equity is credit-normal, so raw is negative),
    // customer deposit 30,000 credit, profit 0 => N46 70,000, N50 0,
    // N45 30,000. Assets are cash 100,000 to keep the equation whole.
    const out = assembleBalanceSheet(base({
      atDate: new Map([[CASH, rm(100000)], [CUSTDEP, -rm(30000)], [CAP, -rm(70000)]]),
    }));
    expect(rowOf(out, 'N45').amount).toBe('30000.0000');
    expect(rowOf(out, 'N46').amount).toBe('70000.0000');
    expect(rowOf(out, 'N50').amount).toBe('0.0000');

    expect(out.derivedTotals.ownersEquity).toBe('70000.0000');
    expect(out.derivedTotals.liabilitiesAndEquity).toBe('100000.0000');
    // The accounting equation still holds, and the Balance Check reads the
    // SAME value rather than recomputing it.
    expect(out.balanceCheck.status).toBe('balanced');
    expect(out.balanceCheck.totalLiabilitiesAndEquity)
      .toBe(out.derivedTotals.liabilitiesAndEquity);
    expect(out.balanceCheck.totalAssets).toBe('100000.0000');
  });

  it('keeps derived subtotals out of rows[] and gives them no N-code', () => {
    const out = assembleBalanceSheet(base());
    expect(out.rows).toHaveLength(23);
    expect(out.rows.map((r) => r.line)).not.toContain('');
    expect(out.rows.some((r) => /OWNER.S EQUITY/i.test(r.label) && r.line === '')).toBe(false);
  });

  it('propagates an unknown N50 to BOTH derived subtotals', () => {
    // netProfit null => N48 null => N50 null. Neither subtotal may substitute
    // a zero: a fabricated total is worse than an absent one.
    const out = assembleBalanceSheet(base({
      netProfit: null,
      atDate: new Map([[CASH, rm(100000)], [CUSTDEP, -rm(30000)], [CAP, -rm(70000)]]),
    }));
    expect(rowOf(out, 'N50').amount).toBeNull();
    expect(out.derivedTotals.ownersEquity).toBeNull();
    expect(out.derivedTotals.liabilitiesAndEquity).toBeNull();
    // N45 and N46 are still perfectly well known; the unknown does not spread
    // sideways into the official rows.
    expect(rowOf(out, 'N45').amount).toBe('30000.0000');
    expect(rowOf(out, 'N46').amount).toBe('70000.0000');
  });

  it('propagates an unknown prior period (N47) through N50 to both subtotals', () => {
    const out = assembleBalanceSheet(base({
      priorProfitValid: false,
      atDate: new Map([[CASH, rm(100000)], [CUSTDEP, -rm(30000)], [CAP, -rm(70000)]]),
    }));
    expect(rowOf(out, 'N47').amount).toBeNull();
    expect(rowOf(out, 'N50').amount).toBeNull();
    expect(out.derivedTotals.ownersEquity).toBeNull();
    expect(out.derivedTotals.liabilitiesAndEquity).toBeNull();
  });

  it('sums TOTAL OWNER\'S EQUITY from N46 + N47 + N48 + N49', () => {
    // The #1216 formula, pinned on the shared arithmetic directly. Distinct
    // values per leg, so dropping or duplicating any one of them changes the
    // result — equal legs would let an operand mix-up pass.
    // toMatchObject, not toEqual: deriveTotals also returns the raw bigints the
    // Balance Check subtracts. The formatted pair is what this test is about.
    expect(
      deriveTotals(rm(70000), rm(5000), rm(3000), rm(-1000), rm(30000)),
    ).toMatchObject({
      // 70000 + 5000 + 3000 - 1000
      ownersEquity: '77000.0000',
      // N45 + ownersEquity
      liabilitiesAndEquity: '107000.0000',
    });
  });

  it('propagates an unknown value in ANY equity leg to both subtotals', () => {
    // N46 and N49 are MAPPED lines and mappedTotal() returns bigint, so the
    // assembler cannot currently produce a null for those from any input —
    // asserting one via a crafted fixture would be theatre. What #1212/#1216
    // require is that an unknown operand is never laundered into a zero, so pin
    // the shared arithmetic directly: liabilitiesAndEquity folds through
    // ownersEquity, so a null equity leg cannot be rescued by a known N45.
    //
    // Each leg is nulled INDIVIDUALLY with the other three known, so a null
    // reaching only some operands fails here rather than passing on one case.
    const legs: [bigint | null, bigint | null, bigint | null, bigint | null][] = [
      [null, rm(5000), rm(3000), rm(-1000)],
      [rm(70000), null, rm(3000), rm(-1000)],
      [rm(70000), rm(5000), null, rm(-1000)],
      [rm(70000), rm(5000), rm(3000), null],
    ];
    for (const [n46, n47, n48, n49] of legs) {
      expect(deriveTotals(n46, n47, n48, n49, rm(30000))).toMatchObject({
        ownersEquity: null, liabilitiesAndEquity: null,
      });
    }
    // An unknown N45 nulls only the grand total; equity is still known.
    expect(
      deriveTotals(rm(70000), rm(5000), rm(3000), rm(-1000), null),
    ).toMatchObject({
      ownersEquity: '77000.0000', liabilitiesAndEquity: null,
    });
  });

  it('never folds N50 into either subtotal', () => {
    // N50 IS N47 + N48 + N49, so a subtotal that also added it would double the
    // current account. Assert on the assembled output, where a real N50 exists:
    // equity must equal N46 + N50 exactly ONCE, not N46 + 2 x N50.
    //
    // N50 MUST be non-zero here or the double-count assertion is vacuous:
    // n46 + n50 + n50 === n46 + n50 when n50 is 0, which is exactly what the
    // all-zero default fixture produces. netProfit drives N48 and a drawings
    // balance drives N49, so N50 lands non-zero.
    const out = assembleBalanceSheet(base({
      netProfit: rm(8000),
      atDate: new Map([
        [CASH, rm(100000)], [CUSTDEP, -rm(30000)], [CAP, -rm(70000)],
        [DRAW, rm(1000)],
      ]),
    }));
    expect(rowOf(out, 'N50').amount).not.toBe('0.0000');
    const n46 = BigInt(rowOf(out, 'N46').amount!.replace('.', ''));
    const n50 = BigInt(rowOf(out, 'N50').amount!.replace('.', ''));
    const equity = BigInt(out.derivedTotals.ownersEquity!.replace('.', ''));
    expect(equity).toBe(n46 + n50);
    expect(equity).not.toBe(n46 + n50 + n50);
  });

  it('does not leak raw bigints into the serialized derivedTotals', () => {
    // deriveTotals() returns the bigints the Balance Check subtracts, but the
    // RESPONSE must carry only the formatted pair: a bigint throws on
    // JSON.stringify, so a leak would 500 the endpoint rather than fail quietly.
    const out = assembleBalanceSheet(base());
    expect(Object.keys(out.derivedTotals).sort()).toEqual([
      'liabilitiesAndEquity', 'ownersEquity',
    ]);
    expect(() => JSON.stringify(out.derivedTotals)).not.toThrow();
  });

  it('leaves derived subtotals known when only the Balance Check is disqualified', () => {
    // An unmapped balance makes the check `unavailable`, but N45/N46/N50 are
    // each still known — the subtotals must show those values, not an em dash.
    // This is what lets the UI render all three Balance Check lines when
    // unavailable.
    const decoy = acc('acc-decoy', '1900', 'Suspense', 'Asset');
    const out = assembleBalanceSheet(base({
      accounts: [...ACCOUNTS, decoy],
      atDate: new Map([
        [CASH, rm(100000)], [CUSTDEP, -rm(30000)], [CAP, -rm(70000)],
        ['acc-decoy', rm(5)],
      ]),
    }));
    expect(out.balanceCheck.status).toBe('unavailable');
    expect(out.balanceCheck.difference).toBeNull();
    expect(out.derivedTotals.ownersEquity).toBe('70000.0000');
    expect(out.derivedTotals.liabilitiesAndEquity).toBe('100000.0000');
  });
});
