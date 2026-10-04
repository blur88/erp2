import { describe, expect, it } from 'vitest'
import type { BankReconciliationDto, ReconciliationSummaryDto } from '@/types'
import {
  CONFIRM_COPY,
  DONE_LABEL,
  accountWritable,
  availableActions,
  completeBlockers,
  lockedReason,
  readOnlyNotice,
} from '../bankReconciliationActions'

const summary: ReconciliationSummaryDto = {
  openingBalance: '0.00',
  closingBalance: '0.00',
  moneyIn: '0.00',
  moneyOut: '0.00',
  calculatedClosingBalance: '0.00',
  difference: '0.00',
  openingClearedNet: null,
  openingBalanceDifference: null,
  unclassifiedCount: null,
}

function make(
  over: Partial<Omit<BankReconciliationDto, 'bankAccount'>> & {
    bankAccount?: Partial<BankReconciliationDto['bankAccount']>
  } = {},
): BankReconciliationDto {
  const { bankAccount, ...rest } = over
  return {
    id: 'r1',
    reconciliationNo: 'BR-26-001',
    sequenceNo: 1,
    bankAccountId: 'a1',
    bankAccount: { code: '1200', name: 'Bank', isActive: true, isBankAccount: true, ...bankAccount },
    periodFrom: '2026-01-01',
    periodTo: '2026-01-31',
    status: 'DRAFT',
    reopened: false,
    currentVersionNo: null,
    lockVersion: 1,
    completedAt: null,
    completedBy: null,
    isLatest: true,
    accountHasDraft: false,
    summary,
    ...rest,
  }
}

describe('bankReconciliationActions', () => {
  it.each([
    [{ status: 'DRAFT', currentVersionNo: null }, ['view', 'edit', 'complete', 'discard']],
    [{ status: 'DRAFT', currentVersionNo: 1, reopened: true }, ['view', 'edit', 'complete', 'cancelReopen']],
    [{ status: 'COMPLETED', isLatest: true, accountHasDraft: false }, ['view', 'reopen']],
    [{ status: 'COMPLETED', isLatest: false, accountHasDraft: false }, ['view']],
    [{ status: 'COMPLETED', isLatest: true, accountHasDraft: true }, ['view']],
    [{ status: 'DRAFT', currentVersionNo: null, bankAccount: { isBankAccount: false } }, ['view', 'discard']],
    [{ status: 'DRAFT', currentVersionNo: 1, reopened: true, bankAccount: { isActive: false } }, ['view', 'cancelReopen']],
    [{ status: 'COMPLETED', isLatest: true, accountHasDraft: false, bankAccount: { isBankAccount: false } }, ['view']],
  ] as const)('availableActions(%o) → %j', (over, expected) => {
    expect(availableActions(make(over as never))).toEqual(expected)
  })

  it('accountWritable needs an active, flagged bank account', () => {
    expect(accountWritable(make())).toBe(true)
    expect(accountWritable(make({ bankAccount: { isActive: false } }))).toBe(false)
    expect(accountWritable(make({ bankAccount: { isBankAccount: false } }))).toBe(false)
  })

  it('lockedReason explains each locked case and is null otherwise', () => {
    expect(lockedReason(make({ status: 'COMPLETED', isLatest: false }))).toBe(
      'A later reconciliation exists for this bank account, so this one is locked.',
    )
    expect(lockedReason(make({ status: 'COMPLETED', isLatest: true, accountHasDraft: true }))).toBe(
      'A draft exists for this bank account. Complete or discard it before reopening.',
    )
    expect(lockedReason(make({ status: 'COMPLETED', isLatest: true }))).toBeNull()
    expect(lockedReason(make({ status: 'DRAFT' }))).toBeNull()
    expect(
      lockedReason(make({ status: 'COMPLETED', isLatest: false, bankAccount: { isActive: false } })),
    ).toBe('This bank account is no longer an active bank account. This reconciliation is read-only.')
  })

  it('readOnlyNotice gives the exact text for each of the three states on an unwritable account and null otherwise', () => {
    const off = { isActive: false }
    expect(readOnlyNotice(make())).toBeNull()
    expect(readOnlyNotice(make({ bankAccount: off }))).toBe(
      'This bank account is no longer an active bank account. The draft cannot be edited or completed; it can only be discarded.',
    )
    expect(readOnlyNotice(make({ reopened: true, currentVersionNo: 1, bankAccount: off }))).toBe(
      'This bank account is no longer an active bank account. The reopened reconciliation cannot be edited or completed; cancel the reopen to restore the completed version.',
    )
    expect(readOnlyNotice(make({ status: 'COMPLETED', bankAccount: off }))).toBe(
      'This bank account is no longer an active bank account. This reconciliation is read-only.',
    )
  })

  it('completeBlockers lists each failing gate and is empty when all pass', () => {
    expect(completeBlockers(summary)).toEqual([])
    expect(
      completeBlockers({
        ...summary,
        difference: '5.00',
        openingBalanceDifference: '3.00',
        unclassifiedCount: 1,
      }),
    ).toEqual(['Difference is 5.00', 'Opening Balance Difference is 3.00', '1 entry is unclassified'])
    expect(completeBlockers({ ...summary, unclassifiedCount: 2 })).toEqual(['2 entries are unclassified'])
  })

  it('DONE_LABEL has a label for every confirmed action', () => {
    for (const key of Object.keys(CONFIRM_COPY)) {
      expect(DONE_LABEL[key as keyof typeof DONE_LABEL]).toBeTruthy()
    }
    expect(CONFIRM_COPY.discard.title).toBe('Discard draft?')
  })
})
