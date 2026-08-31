import { FormBExpenseCategory, FormBIncomeCategory } from '../entities/form-b-category.enum';

/**
 * The taxonomy version this feature encodes. FIXED — never derived from the
 * selected year. A report for another year is still presented using this
 * taxonomy and raises FORM_VERSION_MISMATCH (spec §2.1).
 */
export const FORM_VERSION = 2025 as const;

export interface FormBLineDef {
  line: string;
  label: string;
  /** Shown to the user so derived totals are auditable. null when not derived. */
  formula: string | null;
  kind: 'computed' | 'mappedExpense' | 'mappedIncome' | 'inventory' | 'revenue' | 'filerInput';
}

/**
 * HASiL Borang B YA 2025, Bahagian N. The single place the taxonomy is written
 * down. Labels use the official English wording.
 */
export const FORM_B_LINES: readonly FormBLineDef[] = [
  { line: 'N3',  label: 'Sales / Turnover',                     formula: null,             kind: 'revenue' },
  { line: 'N4',  label: 'Opening Inventory',                    formula: null,             kind: 'inventory' },
  { line: 'N5',  label: 'Purchases and Production Costs',       formula: null,             kind: 'inventory' },
  { line: 'N6',  label: 'Closing Inventory',                    formula: null,             kind: 'inventory' },
  { line: 'N7',  label: 'Cost of Sales',                        formula: 'N4 + N5 - N6',   kind: 'computed' },
  { line: 'N8',  label: 'Gross Profit / Loss',                  formula: 'N3 - N7',        kind: 'computed' },
  { line: 'N9',  label: 'Other Business',                       formula: null,             kind: 'mappedIncome' },
  { line: 'N10', label: 'Dividends',                            formula: null,             kind: 'mappedIncome' },
  { line: 'N11', label: 'Interest and Discounts',               formula: null,             kind: 'mappedIncome' },
  { line: 'N12', label: 'Rent, Royalties and Premiums',         formula: null,             kind: 'mappedIncome' },
  { line: 'N13', label: 'Other Income',                         formula: null,             kind: 'mappedIncome' },
  { line: 'N14', label: 'Total Other Income',                   formula: 'N9 to N13',      kind: 'computed' },
  { line: 'N15', label: 'Loan Interest',                        formula: null,             kind: 'mappedExpense' },
  { line: 'N16', label: 'Salaries and Wages',                   formula: null,             kind: 'mappedExpense' },
  { line: 'N17', label: 'Rent / Lease',                         formula: null,             kind: 'mappedExpense' },
  { line: 'N18', label: 'Contract and Subcontract',             formula: null,             kind: 'mappedExpense' },
  { line: 'N19', label: 'Commission',                           formula: null,             kind: 'mappedExpense' },
  { line: 'N20', label: 'Bad Debts',                            formula: null,             kind: 'mappedExpense' },
  { line: 'N21', label: 'Travel and Transportation',            formula: null,             kind: 'mappedExpense' },
  { line: 'N22', label: 'Repairs and Maintenance',              formula: null,             kind: 'mappedExpense' },
  { line: 'N23', label: 'Promotion and Advertising',            formula: null,             kind: 'mappedExpense' },
  { line: 'N24', label: 'Other Expenses',                       formula: null,             kind: 'mappedExpense' },
  { line: 'N25', label: 'Total Expenses',                       formula: 'N15 to N24',     kind: 'computed' },
  { line: 'N26', label: 'Net Profit / Loss',                    formula: 'N8 + N14 - N25', kind: 'computed' },
  { line: 'N27', label: 'Disallowed Expenses',                  formula: null,             kind: 'filerInput' },
] as const;

export const EXPENSE_CATEGORY_LINE: Record<FormBExpenseCategory, string> = {
  [FormBExpenseCategory.LOAN_INTEREST]: 'N15',
  [FormBExpenseCategory.SALARIES_AND_WAGES]: 'N16',
  [FormBExpenseCategory.RENT_LEASE]: 'N17',
  [FormBExpenseCategory.CONTRACT_SUBCONTRACT]: 'N18',
  [FormBExpenseCategory.COMMISSION]: 'N19',
  [FormBExpenseCategory.BAD_DEBTS]: 'N20',
  [FormBExpenseCategory.TRAVEL_TRANSPORT]: 'N21',
  [FormBExpenseCategory.REPAIRS_MAINTENANCE]: 'N22',
  [FormBExpenseCategory.PROMOTION_ADVERTISING]: 'N23',
  [FormBExpenseCategory.OTHER_EXPENSES]: 'N24',
};

export const INCOME_CATEGORY_LINE: Record<FormBIncomeCategory, string> = {
  [FormBIncomeCategory.OTHER_BUSINESS]: 'N9',
  [FormBIncomeCategory.DIVIDENDS]: 'N10',
  [FormBIncomeCategory.INTEREST_AND_DISCOUNTS]: 'N11',
  [FormBIncomeCategory.RENT_ROYALTIES_PREMIUMS]: 'N12',
  [FormBIncomeCategory.OTHER_INCOME]: 'N13',
};

/** The lines unmapped accounts fall back to (spec §5.4). */
export const EXPENSE_FALLBACK_LINE = 'N24';
export const INCOME_FALLBACK_LINE = 'N13';
