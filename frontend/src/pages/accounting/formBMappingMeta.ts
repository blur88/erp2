import type { FormBEligibilityReason } from '@/types'

/**
 * Presentation metadata for the Form B mapping screen.
 *
 * The category lists are lifted verbatim out of FormBMappingSection.tsx — no
 * category is added or removed here. They mirror EXPENSE_CATEGORY_LINE and
 * INCOME_CATEGORY_LINE in backend/src/modules/accounting/services/
 * form-b.categories.ts, which is the taxonomy's source of truth. The set is
 * FIXED by HASiL Borang B Bahagian N: statutory, not user data, and it cannot
 * grow — which is why the row control is a plain Select and not a searchable
 * Autocomplete.
 */
export interface FormBCategoryOption {
  value: string
  line: string
  label: string
}

export const EXPENSE_CATEGORY_OPTIONS: FormBCategoryOption[] = [
  { value: 'LOAN_INTEREST', line: 'N15', label: 'Loan Interest' },
  { value: 'SALARIES_AND_WAGES', line: 'N16', label: 'Salaries and Wages' },
  { value: 'RENT_LEASE', line: 'N17', label: 'Rent / Lease' },
  { value: 'CONTRACT_SUBCONTRACT', line: 'N18', label: 'Contract and Subcontract' },
  { value: 'COMMISSION', line: 'N19', label: 'Commission' },
  { value: 'BAD_DEBTS', line: 'N20', label: 'Bad Debts' },
  { value: 'TRAVEL_TRANSPORT', line: 'N21', label: 'Travel and Transportation' },
  { value: 'REPAIRS_MAINTENANCE', line: 'N22', label: 'Repairs and Maintenance' },
  { value: 'PROMOTION_ADVERTISING', line: 'N23', label: 'Promotion and Advertising' },
  { value: 'OTHER_EXPENSES', line: 'N24', label: 'Other Expenses' },
]

export const INCOME_CATEGORY_OPTIONS: FormBCategoryOption[] = [
  { value: 'OTHER_BUSINESS', line: 'N9', label: 'Other Business' },
  { value: 'DIVIDENDS', line: 'N10', label: 'Dividends' },
  { value: 'INTEREST_AND_DISCOUNTS', line: 'N11', label: 'Interest and Discounts' },
  { value: 'RENT_ROYALTIES_PREMIUMS', line: 'N12', label: 'Rent, Royalties and Premiums' },
  { value: 'OTHER_INCOME', line: 'N13', label: 'Other Income' },
]

export function optionsForType(type: string): FormBCategoryOption[] {
  if (type === 'Expense') return EXPENSE_CATEGORY_OPTIONS
  if (type === 'Income') return INCOME_CATEGORY_OPTIONS
  return []
}

/** Mirrors EXPENSE_FALLBACK_LINE / INCOME_FALLBACK_LINE (spec §5.4). */
export const FALLBACK_LINE: Record<string, FormBCategoryOption> = {
  Expense: { value: 'OTHER_EXPENSES', line: 'N24', label: 'Other Expenses' },
  Income: { value: 'OTHER_INCOME', line: 'N13', label: 'Other Income' },
}

export function categoryOptionFor(
  type: string,
  category: string | null,
): FormBCategoryOption | null {
  if (category === null) return null
  return optionsForType(type).find((o) => o.value === category) ?? null
}

/**
 * User-facing sentences for the eligibility verdicts.
 *
 * The API returns the raw discriminator (NOT_POSTABLE, GRAPH_FAULT, ...), which
 * previously rendered verbatim in the row. Each sentence names the cause AND the
 * remedy, because every one of these is repairable somewhere else in the app —
 * the row is listed precisely so the user can act on it.
 */
export const ELIGIBILITY_REASON_TEXT: Record<FormBEligibilityReason, string> = {
  NOT_EXPENSE_TYPE:
    'Holds an expense category but is not an Expense account. Clear the mapping, or correct the account type.',
  NOT_INCOME_TYPE:
    'Holds an income category but is not an Income account. Clear the mapping, or correct the account type.',
  NOT_POSTABLE:
    'Header account — map its child accounts instead.',
  INACTIVE:
    'Account is inactive, so its mapping can no longer be changed. Existing mappings still apply to past years.',
  IS_CONFIGURED_ROOT:
    'This is the configured Cost of Sales account. It already reaches Form B through N7 (Cost of Sales).',
  DESCENDANT_OF_EXCLUDED_ROOT:
    'Sits under the Cost of Sales account, so it is already counted in N7 and must not be counted again as an expense.',
  GRAPH_FAULT:
    'The account hierarchy above this account is broken. Fix its parent account in the Chart of Accounts first.',
}

export function reasonText(reason: FormBEligibilityReason | undefined): string {
  if (!reason) return 'This account cannot be mapped.'
  return ELIGIBILITY_REASON_TEXT[reason] ?? 'This account cannot be mapped.'
}
