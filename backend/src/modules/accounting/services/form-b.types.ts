// backend/src/modules/accounting/services/form-b.types.ts
import type { FormBExpenseCategory, FormBIncomeCategory } from '../entities/form-b-category.enum';
import type { EligibilityReason } from './form-b.eligibility';

/** formatScale4 output, or null per spec §5.6. NEVER rendered as '0.00'. */
export type Amount = string | null;

export type FormBCategory = FormBExpenseCategory | FormBIncomeCategory;

/** Whether an account reached its line by its own mapping or by fallback. */
export type Assignment = 'explicit' | 'fallback';

/** An account contributing to a report row. */
export interface FormBAccountRef {
  accountId: string;
  code: string;
  name: string;
  /** false = a mapping retained on a deactivated account. */
  isActive: boolean;
  /** null for a fallback contributor, which has no mapping. */
  category: FormBCategory | null;
  assignment: Assignment;
  /** This account's contribution. Never null — an account either contributes or is absent. */
  amount: string;
}

/**
 * An account named by a FINDING. Deliberately lighter than FormBAccountRef: a
 * configured root or a malformed account has no assignment and no contribution
 * amount, and inventing them would assert things the finding does not know.
 */
export interface FormBFindingAccount {
  accountId: string;
  code: string;
  name: string;
  /** Only for MAPPED_ACCOUNT_INELIGIBLE. */
  reason?: EligibilityReason;
}

export interface FormBRow {
  line: string;
  label: string;
  formula: string | null;
  amount: Amount;
  /** Non-empty only for the mapped rows N9-N13 and N15-N24. */
  accounts: FormBAccountRef[];
  /** N24 / N13 only: the same accounts split, for labelled subgroups. */
  cohorts: { explicit: FormBAccountRef[]; fallback: FormBAccountRef[] } | null;
  /** N5 only: always null for this retail-only ERP. Absent on every other row. */
  productionCost?: null;
  /** N27 only. */
  derived?: false;
  status?: 'requiresFilerInput';
}

/**
 * An identity value and where it came from. There is no `override`: Form B has
 * no identity store of its own, so `companySettings` is the only source and
 * `null` means the field is unset there.
 */
export interface FormBIdentityField {
  value: string | null;
  source: 'companySettings' | null;
}

/**
 * The two sides of the reconciliation (spec §5.3). N7 and ownerStockDrawings are
 * Inventory-leg credits minus debits; accountingTotalCostOfSales and
 * inventoryAdjustments are cost-positive Expense-side natural balances. Both
 * sides are cost-positive.
 */
export interface FormBReconciliation {
  n7: Amount;
  /** (a) — ALREADY INCLUDES (b). Do not add them. */
  accountingTotalCostOfSales: Amount;
  /** (b) — informational, nested inside (a). Depends on neither configured root. */
  inventoryAdjustments: Amount;
  /** (c) — Inventory leg, OWNER_EQUITY + OWNER_STOCK_DRAWING only. */
  ownerStockDrawings: Amount;
  /** (d) = n7 - (a + c). Null whenever any of the three is null. */
  residual: Amount;
}

export type FindingCode =
  | 'UNMAPPED_EXPENSE_ACCOUNTS'
  | 'UNMAPPED_INCOME_ACCOUNTS'
  | 'MISSING_BUSINESS_IDENTITY'
  | 'DISALLOWED_EXPENSES_UNDETERMINED'
  | 'FORM_VERSION_MISMATCH'
  | 'MISSING_CONFIGURED_ROOT'
  | 'INVALID_CONFIGURED_ROOT'
  | 'MAPPED_ACCOUNT_INELIGIBLE'
  | 'UNEXPLAINED_INVENTORY_RESIDUAL'
  | 'ACCOUNTING_VIEW_TIE_OUT_FAILED'
  | 'ACCOUNTING_VIEW_ANOMALIES'
  | 'ACCOUNTING_VIEW_STRUCTURAL_FAULTS';

export type FindingSeverity = 'warning' | 'incomplete' | 'integrity';

export interface FormBFinding {
  code: FindingCode;
  severity: FindingSeverity;
  message: string;
  /** [] when not account-scoped. */
  accounts: FormBFindingAccount[];
  /** For configuration findings; null otherwise. */
  settingKey: string | null;
}

/**
 * Derived from findings. Phrased as what was CHECKED — an empty integrity block
 * is not proof of correctness.
 */
export interface FormBReadiness {
  hasWarnings: boolean;
  hasIncomplete: boolean;
  hasIntegrity: boolean;
  counts: { warning: number; incomplete: number; integrity: number };
}

export interface FormBResponse {
  /** The selected assessment year. */
  year: number;
  /** The taxonomy encoded. Fixed at 2025. */
  formVersion: number;
  /** Same contract as the Accounting View, so the shell can drive the year filter. */
  availableYears: number[];
  /**
   * N1 and N1a only. N2 (business code) and N2a (activity type) are NOT
   * modelled: nothing in this ERP holds them, and inventing a store for two
   * fields the filer would have to key in by hand is not identity this system
   * knows.
   */
  identity: {
    businessName: FormBIdentityField;
    registrationNumber: FormBIdentityField;
  };
  /** Always all of N3-N27, in order. The frontend never synthesises a line. */
  rows: FormBRow[];
  reconciliation: FormBReconciliation;
  findings: FormBFinding[];
  readiness: FormBReadiness;
}
