// balance-sheet.lines.ts
export type BalanceSheetSection =
  | 'nonCurrentAssets' | 'otherAssets' | 'currentAssets' | 'liabilities' | 'ownersEquity';

export interface BalanceSheetLineDef {
  line: string;
  label: string;
  /** Shown to the user so derived totals are auditable. null when not derived. */
  formula: string | null;
  section: BalanceSheetSection;
  kind: 'mapped' | 'computed' | 'derivedProfit';
  isTotal: boolean;
}

const m = (line: string, label: string, section: BalanceSheetSection): BalanceSheetLineDef =>
  ({ line, label, formula: null, section, kind: 'mapped', isTotal: false });
const t = (line: string, label: string, formula: string, section: BalanceSheetSection): BalanceSheetLineDef =>
  ({ line, label, formula, section, kind: 'computed', isTotal: true });

/**
 * HASiL Borang B, Bahagian N, fields N28-N50. The single place this taxonomy is
 * written down. Labels use the official English wording.
 */
export const BALANCE_SHEET_LINES: readonly BalanceSheetLineDef[] = [
  m('N28', 'Land and Buildings', 'nonCurrentAssets'),
  m('N29', 'Plant and Machinery', 'nonCurrentAssets'),
  m('N30', 'Vehicles', 'nonCurrentAssets'),
  m('N31', 'Other Non-current Assets', 'nonCurrentAssets'),
  t('N32', 'Total Non-current Assets', 'N28 through N31', 'nonCurrentAssets'),
  m('N33', 'Investments', 'otherAssets'),
  m('N34', 'Inventory', 'currentAssets'),
  m('N35', 'Trade Debtors', 'currentAssets'),
  m('N36', 'Other Debtors', 'currentAssets'),
  m('N37', 'Cash Balance', 'currentAssets'),
  m('N38', 'Bank Balance', 'currentAssets'),
  m('N39', 'Other Current Assets', 'currentAssets'),
  t('N40', 'Total Current Assets', 'N34 through N39', 'currentAssets'),
  t('N41', 'TOTAL ASSETS', 'N32 + N33 + N40', 'currentAssets'),
  m('N42', 'Loans and Overdrafts', 'liabilities'),
  m('N43', 'Trade Creditors', 'liabilities'),
  m('N44', 'Other Creditors', 'liabilities'),
  t('N45', 'TOTAL LIABILITIES', 'N42 through N44', 'liabilities'),
  m('N46', 'Capital Account', 'ownersEquity'),
  { line: 'N47', label: 'Current Account Brought Forward', formula: null,
    section: 'ownersEquity', kind: 'derivedProfit', isTotal: false },
  { line: 'N48', label: 'Current-year Profit / Loss', formula: null,
    section: 'ownersEquity', kind: 'derivedProfit', isTotal: false },
  m('N49', 'Drawings / Advances (Net)', 'ownersEquity'),
  t('N50', 'Current Account Carried Forward', 'N47 + N48 + N49', 'ownersEquity'),
] as const;

/**
 * Configured-settings key -> LHDN line. Match by configured account ID, NEVER
 * by account code: SETTINGS_CODE_MAP is seeder/validation reference data
 * asserting that a settings field POINTS AT a standard code, not a lookup path.
 * A re-coded account still maps; an account that merely happens to be coded
 * '1100' does not.
 *
 * N49 (ownerDrawingsAccountId) resolves to a PERIOD MOVEMENT, not a closing
 * balance — see balance-sheet.assemble.ts. openingBalanceEquityAccountId is
 * deliberately absent: it maps to no LHDN line, which is what makes a non-zero
 * balance there an unmapped balance.
 */
export const SETTINGS_KEY_LINE: Record<string, string> = {
  cashAccountId: 'N37',
  bankAccountId: 'N38',
  inventoryAccountId: 'N34',
  supplierDepositAccountId: 'N39',
  customerDepositAccountId: 'N44',
  ownerCapitalAccountId: 'N46',
  ownerDrawingsAccountId: 'N49',
};
