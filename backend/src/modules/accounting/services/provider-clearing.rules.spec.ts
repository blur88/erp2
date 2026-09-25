import { providerClearingViolation } from './provider-clearing.rules';
import { AccountType } from '../entities/account-type.enum';

const settings = { cashAccountId: 'cash', bankAccountId: 'cimb', customerDepositAccountId: 'dep' } as any;
const asset = (id: string, isPostable = true) => ({ id, type: AccountType.ASSET, isPostable });

describe('providerClearingViolation (#1285)', () => {
  it('accepts a postable Asset that no setting uses', () => {
    expect(providerClearingViolation(asset('shopee'), settings)).toBeNull();
  });
  it('rejects a non-Asset', () => {
    expect(providerClearingViolation({ id: 'x', type: AccountType.LIABILITY, isPostable: true }, settings))
      .toBe('Only an Asset account can be a provider clearing account');
  });
  it('rejects a non-postable account', () => {
    expect(providerClearingViolation(asset('grp', false), settings))
      .toBe('Only a postable account can be a provider clearing account');
  });
  it.each([
    ['cash', 'Cash'], ['cimb', 'Bank'], ['dep', 'Customer Deposit'],
  ])('rejects the configured %s account', (id, label) => {
    expect(providerClearingViolation(asset(id), settings)).toBe(
      `This account is the Accounting Settings ${label} account and cannot be a provider clearing account`,
    );
  });
  it('treats a missing settings row as no conflict', () => {
    expect(providerClearingViolation(asset('cash'), null)).toBeNull();
  });
});
