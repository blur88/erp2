/**
 * HASiL Form B YA 2025, Bahagian N. Values are SEMANTIC, never presentation
 * labels — Form B wording can change without a data migration. Line numbers
 * and labels live in services/form-b.categories.ts.
 *
 * Declaration order matches the migration's CREATE TYPE order. Postgres
 * ALTER TYPE ... ADD VALUE has no BEFORE/AFTER clause, so any future value
 * must be appended in BOTH places or verify-baseline.sh fails.
 */
export enum FormBExpenseCategory {
  LOAN_INTEREST = 'LOAN_INTEREST',
  SALARIES_AND_WAGES = 'SALARIES_AND_WAGES',
  RENT_LEASE = 'RENT_LEASE',
  CONTRACT_SUBCONTRACT = 'CONTRACT_SUBCONTRACT',
  COMMISSION = 'COMMISSION',
  BAD_DEBTS = 'BAD_DEBTS',
  TRAVEL_TRANSPORT = 'TRAVEL_TRANSPORT',
  REPAIRS_MAINTENANCE = 'REPAIRS_MAINTENANCE',
  PROMOTION_ADVERTISING = 'PROMOTION_ADVERTISING',
  OTHER_EXPENSES = 'OTHER_EXPENSES',
}

export enum FormBIncomeCategory {
  OTHER_BUSINESS = 'OTHER_BUSINESS',
  DIVIDENDS = 'DIVIDENDS',
  INTEREST_AND_DISCOUNTS = 'INTEREST_AND_DISCOUNTS',
  RENT_ROYALTIES_PREMIUMS = 'RENT_ROYALTIES_PREMIUMS',
  OTHER_INCOME = 'OTHER_INCOME',
}
