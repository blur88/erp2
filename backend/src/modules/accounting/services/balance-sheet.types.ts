// balance-sheet.types.ts
import type { BalanceSheetSection } from './balance-sheet.lines';

/** formatScale4 output, or null. NEVER rendered as '0.00' — null means unknown. */
export type Amount = string | null;

/**
 * Identity only. An integrity finding may name an account whose contribution is
 * undefined; inventing an amount asserts what it does not know. (Same reasoning
 * as FormBFindingAccount vs FormBAccountRef.)
 */
export interface BalanceSheetAccountRef {
  accountId: string;
  code: string;
  name: string;
}

/** Identity plus a real, known contribution. */
export interface BalanceSheetAccountAmount extends BalanceSheetAccountRef {
  amount: string;
}

export interface BalanceSheetRow {
  line: string;
  label: string;
  formula: string | null;
  section: BalanceSheetSection;
  kind: 'mapped' | 'computed' | 'derivedProfit';
  isTotal: boolean;
  amount: Amount;
  /** Non-empty only for mapped rows with contributing accounts. */
  accounts: BalanceSheetAccountAmount[];
}

/** Which period's profit failed: N47 (prior) or N48 (selected year). */
export type ProfitScope = 'priorPeriod' | 'selectedYear';

/**
 * Discriminated by `code`, so an unmapped reason CANNOT be built without
 * amounts and a profit reason cannot fabricate them.
 */
export type BalanceCheckReason =
  | {
      code: 'UNMAPPED_BALANCES';
      scope: null;
      affectedLines: string[];
      message: string;
      accounts: [BalanceSheetAccountAmount, ...BalanceSheetAccountAmount[]];
    }
  | {
      code: 'PROFIT_INTEGRITY';
      scope: ProfitScope;
      affectedLines: string[];
      message: string;
      accounts: BalanceSheetAccountRef[];
    };

/**
 * The union makes invalid combinations unrepresentable: `unavailable` cannot
 * carry a difference, settled statuses cannot carry reasons, and `unavailable`
 * requires at least one reason — a check cannot be disqualified for nothing.
 * totalAssets stays Amount under `unavailable` because an unmapped balance can
 * leave even N41 incomplete.
 */
export type BalanceCheck =
  | { status: 'balanced'; totalAssets: string; totalLiabilitiesAndEquity: string;
      difference: string; reasons: [] }
  | { status: 'outOfBalance'; totalAssets: string; totalLiabilitiesAndEquity: string;
      difference: string; reasons: [] }
  | { status: 'unavailable'; totalAssets: Amount; totalLiabilitiesAndEquity: Amount;
      difference: null; reasons: [BalanceCheckReason, ...BalanceCheckReason[]] };

export type BalanceSheetFinding =
  | {
      code: 'UNMAPPED_BALANCE_ACCOUNTS' | 'OPENING_BALANCE_EQUITY_NONZERO';
      severity: 'warning';
      scope: null;
      affectedLines: string[];
      message: string;
      accounts: [BalanceSheetAccountAmount, ...BalanceSheetAccountAmount[]];
    }
  | {
      code: 'PROFIT_STRUCTURAL_FAULTS' | 'PROFIT_TIE_OUT_FAILED' | 'PROFIT_ANOMALIES';
      severity: 'integrity' | 'warning';
      scope: ProfitScope;
      affectedLines: string[];
      message: string;
      accounts: BalanceSheetAccountRef[];
    };

export interface BalanceSheetResponse {
  year: number;
  /** The effective cutoff the server actually used: min(businessToday, Dec 31). */
  asOfDate: string;
  availableYears: number[];
  /** ALWAYS all of N28-N50, in order. */
  rows: BalanceSheetRow[];
  balanceCheck: BalanceCheck;
  findings: BalanceSheetFinding[];
}
