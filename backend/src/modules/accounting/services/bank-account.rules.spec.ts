import { bankAccountViolation } from './bank-account.rules';
import { AccountType } from '../entities/account-type.enum';

const settings = { cashAccountId: 'cash', inventoryAccountId: 'inv', supplierDepositAccountId: 'sup' } as any;
const asset = (id: string, over: Record<string, unknown> = {}) =>
  ({ id, type: AccountType.ASSET, isPostable: true, isProviderClearing: false, ...over }) as any;

describe('bankAccountViolation (#1298)', () => {
  it('accepts a postable, non-clearing Asset no forbidden setting uses', () => {
    expect(bankAccountViolation(asset('maybank'), settings)).toBeNull();
  });
  it('rejects a non-Asset', () => {
    expect(bankAccountViolation(asset('x', { type: AccountType.EXPENSE }), settings))
      .toBe('Only an Asset account can be a bank account');
  });
  it('rejects a non-postable account', () => {
    expect(bankAccountViolation(asset('grp', { isPostable: false }), settings))
      .toBe('Only a postable account can be a bank account');
  });
  it('rejects a provider clearing account', () => {
    expect(bankAccountViolation(asset('shopee', { isProviderClearing: true }), settings))
      .toBe('A provider clearing account cannot be a bank account');
  });
  it.each([
    ['cash', 'Cash'], ['inv', 'Inventory'], ['sup', 'Supplier Deposit'],
  ])('rejects the configured %s account', (id, label) => {
    expect(bankAccountViolation(asset(id), settings)).toBe(
      `This account is the Accounting Settings ${label} account and cannot be a bank account`,
    );
  });
  it('treats a missing settings row as no conflict', () => {
    expect(bankAccountViolation(asset('cash'), null)).toBeNull();
  });
});
