/**
 * Neutral row identifiers (spec §4.3). NO LHDN codes. The frontend keys off
 * `rowId` and never string-matches labels.
 */
export type SectionKey = 'revenue' | 'cogs' | 'otherIncome' | 'expenses';

/** Which half of an account's period movement a contribution came from. */
export type MovementComponent = 'ordinary' | 'stockAdjustment';

/** One account's period movement, already split by component (spec §7.3). */
export interface AccountMovement {
  accountId: string;
  /** Natural-balance minor units from ordinary (non-stock-adjustment) lines. */
  ordinary: bigint;
  /** Natural-balance minor units from STOCK_ADJUSTMENT-sourced lines. */
  stockAdjustment: bigint;
}

/** A Chart of Accounts node as this report needs it. */
export interface PlAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  parentId: string | null;
  isPostable: boolean;
}

/**
 * An account row. `children` is non-empty only for a NON-postable structural
 * category, which expands; a postable row drills through directly (spec §7.1).
 */
export interface PlAccountRow {
  rowId: string;
  accountId: string;
  code: string;
  name: string;
  isPostable: boolean;
  amount: string;
  children: PlAccountRow[];
}

export interface PlSection {
  rowId: string;
  key: SectionKey;
  label: string;
  rows: PlAccountRow[];
  total: string;
  totalRowId: string;
}

/** An account whose money is dropped (count 0) or double-counted (count >= 2). */
export interface PlAssignmentAnomaly {
  accountId: string;
  code: string;
  name: string;
  component: MovementComponent;
  count: number;
}

/** A configuration fault that ties out cleanly but makes the report wrong. */
export interface PlStructuralFault {
  kind: 'missingConfiguredAccount' | 'danglingParent' | 'parentCycle';
  /** Settings key for missingConfiguredAccount; otherwise null. */
  settingKey: string | null;
  accounts: Array<{ accountId: string; code: string; name: string }>;
}

/**
 * Integrity findings (spec §7.3). Empty arrays and `tieOutOk: true` mean the
 * report is trustworthy. These are guards, NOT proof of correctness: the
 * structural faults exist precisely because the counter and tie-out cannot
 * detect them.
 */
export interface PlIntegrity {
  anomalies: PlAssignmentAnomaly[];
  structuralFaults: PlStructuralFault[];
  tieOutOk: boolean;
  /** Independent Σ Income − Σ Expense, for diagnostics when tieOutOk is false. */
  independentNetProfit: string;
}

export interface ProfitAndLossResponse {
  year: number;
  availableYears: number[];
  sections: PlSection[];
  /** Signed net of STOCK_ADJUSTMENT-sourced expense lines (spec §4.2). */
  inventoryAdjustments: string;
  inventoryAdjustmentsRowId: string;
  /**
   * Cost of Sales section total PLUS inventory adjustments — the figure Gross
   * Profit is computed from, and the one the report must display. The `cogs`
   * section's own `total` covers only its account rows and is deliberately
   * NOT the printable total; rendering that would show a number that does not
   * reconcile with Gross Profit.
   */
  totalCostOfSales: string;
  totalCostOfSalesRowId: string;
  grossProfit: string;
  netProfit: string;
  integrity: PlIntegrity;
}
