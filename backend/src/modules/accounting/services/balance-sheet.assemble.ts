// balance-sheet.assemble.ts
import { formatScale4 } from '@/common/utils/money';
import { BALANCE_SHEET_LINES, SETTINGS_KEY_LINE } from './balance-sheet.lines';
import type {
  Amount, BalanceCheck, BalanceCheckReason, BalanceSheetAccountAmount,
  BalanceSheetAccountRef, BalanceSheetFinding, BalanceSheetRow,
} from './balance-sheet.types';

export interface AssembleAccount {
  id: string; code: string; name: string; type: string; isPostable: boolean;
}

export interface AssembleInput {
  accounts: AssembleAccount[];
  /** RAW debit-minus-credit at asOfDate. */
  atDate: Map<string, bigint>;
  /** RAW debit-minus-credit at {year-1}-12-31. */
  preYear: Map<string, bigint>;
  settingsAccountIds: Record<string, string | null>;
  openingBalanceEquityAccountId: string | null;
  /** null when selected-year profit is untrustworthy. */
  netProfit: bigint | null;
  /** false when the prior period's profit is untrustworthy. */
  priorProfitValid: boolean;
  profitFindings: BalanceSheetFinding[];
}

export interface AssembleOutput {
  rows: BalanceSheetRow[];
  balanceCheck: BalanceCheck;
  findings: BalanceSheetFinding[];
}

const CREDIT_NORMAL = new Set(['Liability', 'Equity', 'Income']);
const BALANCE_SHEET_TYPES = new Set(['Asset', 'Liability', 'Equity']);

/** Same convention as AccountBalanceService.naturalBalance. */
const natural = (type: string, raw: bigint) => (CREDIT_NORMAL.has(type) ? -raw : raw);

/** Sum of a list of Amounts; null if ANY is null (unknowns propagate). */
const sumAmounts = (parts: (bigint | null)[]): bigint | null =>
  parts.reduce<bigint | null>((a, b) => (a === null || b === null ? null : a + b), 0n);

const fmt = (v: bigint | null): Amount => (v === null ? null : formatScale4(v));

export function assembleBalanceSheet(input: AssembleInput): AssembleOutput {
  const {
    accounts, atDate, preYear, settingsAccountIds,
    openingBalanceEquityAccountId, netProfit, priorProfitValid, profitFindings,
  } = input;

  const byId = new Map(accounts.map((a) => [a.id, a]));
  const naturalAt = (id: string, map: Map<string, bigint>): bigint => {
    const a = byId.get(id);
    if (!a) return 0n;
    return natural(a.type, map.get(id) ?? 0n);
  };

  // ---- Mapped line -> contributing accounts -------------------------------
  // Invert SETTINGS_KEY_LINE via the CONFIGURED IDs, never via account codes.
  const lineAccounts = new Map<string, BalanceSheetAccountAmount[]>();
  const mappedIds = new Set<string>();

  for (const [settingsKey, line] of Object.entries(SETTINGS_KEY_LINE)) {
    const accountId = settingsAccountIds[settingsKey] ?? null;
    if (!accountId) continue;
    const account = byId.get(accountId);
    if (!account) continue;
    mappedIds.add(accountId);

    // N49 is PERIOD MOVEMENT: closing minus pre-year. Using the closing balance
    // would double-count prior drawings already inside N47, throwing N50 out by
    // exactly the prior-year drawings total.
    //
    // NO EXTRA NEGATION. Owner Drawings is Equity, so it is credit-normal and
    // naturalBalance() already returns -raw. A withdrawal is a DEBIT, so its
    // natural balance is ALREADY NEGATIVE, and the movement of two negatives is
    // negative. Negating again would render drawings as a positive addition to
    // equity — the exact inversion the 'PERIOD MOVEMENT' test asserts against.
    const value = line === 'N49'
      ? naturalAt(accountId, atDate) - naturalAt(accountId, preYear)
      : naturalAt(accountId, atDate);

    const list = lineAccounts.get(line) ?? [];
    list.push({
      accountId, code: account.code, name: account.name, amount: formatScale4(value),
    });
    lineAccounts.set(line, list);
  }

  const mappedTotal = (line: string): bigint => {
    const list = lineAccounts.get(line);
    if (!list) return 0n;
    // Re-derive from the same source rather than parsing the formatted string.
    let total = 0n;
    for (const ref of list) {
      total += line === 'N49'
        ? naturalAt(ref.accountId, atDate) - naturalAt(ref.accountId, preYear)
        : naturalAt(ref.accountId, atDate);
    }
    return total;
  };

  // ---- N47: cumulative pre-year profit + signed pre-year drawings ---------
  // A raw natural-balance sum over account TYPES. It never consults
  // salesRevenueAccountId/cogsAccountId and never routes through classify(), so
  // it has no classification settings to be wrong about and no second
  // computation to disagree with. Its only integrity exposure is the shared COA
  // graph, which is period-independent.
  let priorProfit = 0n;
  for (const a of accounts) {
    if (!a.isPostable) continue;
    if (a.type === 'Income') priorProfit += natural(a.type, preYear.get(a.id) ?? 0n);
    else if (a.type === 'Expense') priorProfit -= natural(a.type, preYear.get(a.id) ?? 0n);
  }
  const drawingsId = settingsAccountIds.ownerDrawingsAccountId ?? null;
  // ADDED, not subtracted. naturalBalance() already signs this: Owner Drawings
  // is credit-normal Equity, so a debit withdrawal yields a NEGATIVE natural
  // balance that reduces the brought-forward figure on its own. Subtracting it
  // would make prior withdrawals INCREASE owner equity.
  const priorDrawings = drawingsId ? naturalAt(drawingsId, preYear) : 0n;
  const n47: bigint | null = priorProfitValid ? priorProfit + priorDrawings : null;

  // ---- Unmapped balance-sheet accounts with a non-zero closing balance ----
  // By CLOSING BALANCE, not movement: a balance carried in from a prior year is
  // in ledger reality but in no mapped row, and movement-based detection would
  // miss exactly that case.
  const unmapped: BalanceSheetAccountAmount[] = [];
  for (const a of accounts) {
    if (!a.isPostable) continue;
    if (!BALANCE_SHEET_TYPES.has(a.type)) continue;
    if (mappedIds.has(a.id)) continue;
    const bal = naturalAt(a.id, atDate);
    if (bal === 0n) continue;
    unmapped.push({
      accountId: a.id, code: a.code, name: a.name, amount: formatScale4(bal),
    });
  }

  // Opening Balance Equity is checked INDEPENDENTLY of the unmapped scan, not
  // inside it.
  //
  // An earlier version detected it as a side effect of the loop above, on the
  // reasoning that OBE "maps to no LHDN line, so it is unmapped BY
  // CONSTRUCTION". That holds only while nothing else maps that account. If a
  // misconfiguration points another settings key at it — ownerCapitalAccountId,
  // say — the account becomes mapped, `mappedIds.has(a.id)` skips it before the
  // OBE check is ever reached, and a live clearing balance silently produces NO
  // warning and a green "Balanced". A setup/clearing balance is a fact about the
  // account's own balance; it must not depend on how the account happens to be
  // mapped.
  const obeAccounts: BalanceSheetAccountAmount[] = [];
  if (openingBalanceEquityAccountId) {
    const obe = byId.get(openingBalanceEquityAccountId);
    if (obe) {
      const bal = naturalAt(obe.id, atDate);
      if (bal !== 0n) {
        obeAccounts.push({
          accountId: obe.id, code: obe.code, name: obe.name, amount: formatScale4(bal),
        });
      }
    }
  }

  // The Balance Check is disqualified by EITHER condition. Deduplicated by id,
  // because an unmapped OBE account legitimately appears in both scans and must
  // be reported once.
  const blockingIds = new Set<string>();
  const blocking: BalanceSheetAccountAmount[] = [];
  for (const ref of [...unmapped, ...obeAccounts]) {
    if (blockingIds.has(ref.accountId)) continue;
    blockingIds.add(ref.accountId);
    blocking.push(ref);
  }

  // ---- Rows ---------------------------------------------------------------
  const values = new Map<string, bigint | null>();
  for (const def of BALANCE_SHEET_LINES) {
    if (def.kind === 'mapped') values.set(def.line, mappedTotal(def.line));
  }
  values.set('N47', n47);
  values.set('N48', netProfit);

  /**
   * Read a line's value PRESERVING null. `?? 0n` here would be a bug: it cannot
   * distinguish "this line was never set" from "this line is explicitly
   * unknown", so an unknown N48 would silently become zero and N50 would report
   * a confident total built on a figure the backend declined to compute.
   *
   * Every mapped and computed line IS set before this point, so a missing key
   * can only mean a taxonomy/assembly mismatch — `has()` keeps that a visible
   * 0n default rather than laundering a null.
   */
  const v = (line: string): bigint | null =>
    values.has(line) ? (values.get(line) as bigint | null) : 0n;

  values.set('N32', sumAmounts(['N28', 'N29', 'N30', 'N31'].map(v)));
  values.set('N40', sumAmounts(['N34', 'N35', 'N36', 'N37', 'N38', 'N39'].map(v)));
  values.set('N41', sumAmounts([v('N32'), v('N33'), v('N40')]));
  values.set('N45', sumAmounts(['N42', 'N43', 'N44'].map(v)));
  values.set('N50', sumAmounts([v('N47'), v('N48'), v('N49')]));

  const rows: BalanceSheetRow[] = BALANCE_SHEET_LINES.map((def) => ({
    line: def.line,
    label: def.label,
    formula: def.formula,
    section: def.section,
    kind: def.kind,
    isTotal: def.isTotal,
    // v(), not `?? 0n`: an explicitly null N47/N48/N50 must serialize as null.
    amount: fmt(v(def.line)),
    accounts: lineAccounts.get(def.line) ?? [],
  }));

  // ---- Findings -----------------------------------------------------------
  const findings: BalanceSheetFinding[] = [...profitFindings];
  if (unmapped.length > 0) {
    findings.push({
      code: 'UNMAPPED_BALANCE_ACCOUNTS',
      severity: 'warning',
      scope: null,
      affectedLines: ['N41', 'N45', 'N46'],
      message:
        `${unmapped.length} Asset, Liability or Equity account(s) hold a non-zero ` +
        `balance but map to no LHDN line. Their balances are NOT included in the ` +
        `official totals.`,
      accounts: unmapped as [BalanceSheetAccountAmount, ...BalanceSheetAccountAmount[]],
    });
  }
  if (obeAccounts.length > 0) {
    findings.push({
      code: 'OPENING_BALANCE_EQUITY_NONZERO',
      severity: 'warning',
      scope: null,
      affectedLines: ['N46', 'N50'],
      message:
        'Opening Balance Equity holds a non-zero balance. This is a setup/clearing ' +
        'account and must be resolved before the LHDN Balance Sheet is complete.',
      accounts: obeAccounts as [BalanceSheetAccountAmount, ...BalanceSheetAccountAmount[]],
    });
  }

  // ---- Balance Check ------------------------------------------------------
  const reasons: BalanceCheckReason[] = [];
  // Reuse the identities the profit findings already carry, so the Balance Check
  // panel can name the faulted accounts without the caller re-deriving them.
  const refsForScope = (scope: 'priorPeriod' | 'selectedYear') => {
    const f = profitFindings.find(
      (x) => x.code === 'PROFIT_STRUCTURAL_FAULTS' && x.scope === scope,
    );
    return (f?.accounts ?? []) as BalanceSheetAccountRef[];
  };
  if (netProfit === null) {
    reasons.push({
      code: 'PROFIT_INTEGRITY', scope: 'selectedYear', affectedLines: ['N48', 'N50'],
      message: 'Selected-year profit could not be determined, so the owner\'s ' +
               'current account is unknown.',
      accounts: refsForScope('selectedYear'),
    });
  }
  if (!priorProfitValid) {
    reasons.push({
      code: 'PROFIT_INTEGRITY', scope: 'priorPeriod', affectedLines: ['N47', 'N50'],
      message: 'Prior-period profit could not be determined, so the brought-forward ' +
               'balance is unknown.',
      accounts: refsForScope('priorPeriod'),
    });
  }
  if (blocking.length > 0) {
    reasons.push({
      code: 'UNMAPPED_BALANCES', scope: null, affectedLines: ['N41', 'N45', 'N46'],
      message: 'Unmapped or unresolved clearing balances leave the official totals ' +
               'incomplete, so the accounting equation cannot be validated.',
      accounts: blocking as [BalanceSheetAccountAmount, ...BalanceSheetAccountAmount[]],
    });
  }

  const totalAssets = v('N41');
  const totalLiabEquity = sumAmounts([v('N45'), v('N46'), v('N50')]);

  let balanceCheck: BalanceCheck;
  if (reasons.length > 0 || totalAssets === null || totalLiabEquity === null) {
    // A warning alone must never permit a misleading "Balanced".
    const fallback: BalanceCheckReason = {
      code: 'PROFIT_INTEGRITY', scope: 'selectedYear', affectedLines: ['N48', 'N50'],
      message: 'A required figure is unavailable.', accounts: [],
    };
    const nonEmpty = (reasons.length > 0 ? reasons : [fallback]) as
      [BalanceCheckReason, ...BalanceCheckReason[]];
    balanceCheck = {
      status: 'unavailable',
      totalAssets: fmt(totalAssets),
      totalLiabilitiesAndEquity: fmt(totalLiabEquity),
      difference: null,
      reasons: nonEmpty,
    };
  } else {
    const difference = totalAssets - totalLiabEquity;
    balanceCheck = {
      status: difference === 0n ? 'balanced' : 'outOfBalance',
      totalAssets: formatScale4(totalAssets),
      totalLiabilitiesAndEquity: formatScale4(totalLiabEquity),
      difference: formatScale4(difference),
      reasons: [],
    } as BalanceCheck;
  }

  return { rows, balanceCheck, findings };
}
