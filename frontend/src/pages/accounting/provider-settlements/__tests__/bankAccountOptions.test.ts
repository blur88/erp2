import { describe, expect, it } from 'vitest'
import { bankAccountOptions, isEligibleBankAccount } from '../bankAccountOptions'

const a = (id: string, code: string, name: string, over: Record<string, unknown> = {}) =>
  ({ id, code, name, isActive: true, isPostable: true, isProviderClearing: false, isBankAccount: false, ...over }) as any

const ACCOUNTS = [
  a('b1', '1200', 'CIMB', { isBankAccount: true }),
  a('b3', '1210', 'Maybank', { isBankAccount: true }),
  a('cash', '1100', 'Cash'),
  a('exp', '6990', 'Other Expenses', { type: 'Expense' }),
  a('old', '1250', 'Old Bank', { isBankAccount: true, isActive: false }),
]

describe('bankAccountOptions (#1298)', () => {
  it('offers only active flagged accounts', () => {
    expect(bankAccountOptions(ACCOUNTS, '')).toEqual([
      { id: 'b1', label: '1200 CIMB', disabled: false },
      { id: 'b3', label: '1210 Maybank', disabled: false },
    ])
  })
  it('keeps an unflagged saved account as a disabled "(not a bank account)" option', () => {
    expect(bankAccountOptions(ACCOUNTS, 'cash')[0]).toEqual({ id: 'cash', label: '1100 Cash (not a bank account)', disabled: true })
  })
  it('labels a flagged but inactive saved account "(inactive)"', () => {
    expect(bankAccountOptions(ACCOUNTS, 'old')[0]).toEqual({ id: 'old', label: '1250 Old Bank (inactive)', disabled: true })
  })
  it('prefers "(not a bank account)" when an account is both unflagged and inactive', () => {
    const accts = [...ACCOUNTS, a('both', '1260', 'Both', { isActive: false })]
    expect(bankAccountOptions(accts, 'both')[0].label).toBe('1260 Both (not a bank account)')
  })
  it('falls back to the stored code/name, then the id, with "(unavailable)"', () => {
    expect(bankAccountOptions(ACCOUNTS, 'gone', { code: '1270', name: 'Closed' })[0])
      .toEqual({ id: 'gone', label: '1270 Closed (unavailable)', disabled: true })
    expect(bankAccountOptions(ACCOUNTS, 'gone')[0].label).toBe('gone (unavailable)')
  })
  it('adds nothing extra when the selected account is eligible', () => {
    expect(bankAccountOptions(ACCOUNTS, 'b1')).toHaveLength(2)
  })
  it('isEligibleBankAccount: active AND flagged only', () => {
    expect(isEligibleBankAccount(ACCOUNTS, 'b1')).toBe(true)
    expect(isEligibleBankAccount(ACCOUNTS, 'cash')).toBe(false)
    expect(isEligibleBankAccount(ACCOUNTS, 'old')).toBe(false)
    expect(isEligibleBankAccount(ACCOUNTS, 'gone')).toBe(false)
  })
})
