import { FormBExpenseCategory, FormBIncomeCategory } from '../entities/form-b-category.enum';

/**
 * The taxonomy version this feature encodes, and the MINIMUM assessment year it
 * supports. FIXED — never derived from the selected year.
 *
 * The Bahagian N field set carries forward, so this layout applies to
 * FORM_VERSION and every later year. Only a year EARLIER than this raises
 * FORM_VERSION_MISMATCH, since that form predates the layout verified here
 * (spec §2.1).
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

/**
 * Truncate a scale-4 minor-unit amount to whole ringgit, TOWARD ZERO.
 *
 * HASiL's instruction is "Masukkan amaun tanpa nilai sen" — enter the amount
 * without the sen value — and its FAQ gives the worked example
 * RM125,955.67 -> RM125,955. That is truncation, NOT rounding: RM1,234.99
 * truncates to RM1,234, and -RM1,234.99 to -RM1,234.
 *
 * Sources (supplied by the filer; hasil.gov.my/media and phl.hasil.gov.my were
 * not reachable to verify directly, though three official explanatory-notes
 * PDFs were checked and contain ~634k characters with ZERO sen amounts, which
 * corroborates the whole-ringgit rule):
 *   https://www.hasil.gov.my/media/kwxfd2wg/borang-nyata_b2024_1.pdf
 *   https://phl.hasil.gov.my/pdf/pdfam/FAQBBM2010_28022011_1.pdf
 *
 * Toward zero, not floor: flooring a negative (-1234.99 -> -1235) would
 * overstate a loss. N8 and N26 are legitimately negative, so the sign matters.
 *
 * The ledger keeps full NUMERIC(18,4) precision throughout; this applies only
 * at the Form B presentation edge.
 */
export function truncateToRinggit(minor: bigint): bigint {
  const scale = 10n ** 4n;
  const remainder = minor % scale;
  return minor - remainder;
}
