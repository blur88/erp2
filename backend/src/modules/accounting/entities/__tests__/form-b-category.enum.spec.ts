import { FormBExpenseCategory, FormBIncomeCategory } from '../form-b-category.enum';

describe('Form B categories', () => {
  it('declares the ten Form B expense categories', () => {
    expect(Object.values(FormBExpenseCategory)).toEqual([
      'LOAN_INTEREST', 'SALARIES_AND_WAGES', 'RENT_LEASE',
      'CONTRACT_SUBCONTRACT', 'COMMISSION', 'BAD_DEBTS',
      'TRAVEL_TRANSPORT', 'REPAIRS_MAINTENANCE',
      'PROMOTION_ADVERTISING', 'OTHER_EXPENSES',
    ]);
  });

  it('declares the five Form B income categories', () => {
    expect(Object.values(FormBIncomeCategory)).toEqual([
      'OTHER_BUSINESS', 'DIVIDENDS', 'INTEREST_AND_DISCOUNTS',
      'RENT_ROYALTIES_PREMIUMS', 'OTHER_INCOME',
    ]);
  });

  // Declaration order is asserted because Postgres ALTER TYPE ... ADD VALUE has
  // no BEFORE/AFTER clause: a value appended here but inserted mid-list in a
  // migration makes verify-baseline.sh fail comparing migrated vs schema:sync.
  it('has no overlapping values between the two enums', () => {
    const expense = new Set<string>(Object.values(FormBExpenseCategory));
    for (const v of Object.values(FormBIncomeCategory)) {
      expect(expense.has(v)).toBe(false);
    }
  });
});
