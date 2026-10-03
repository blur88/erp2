import type { BankReconciliationDto, ReconciliationSummaryDto } from '@/types'

export type BankReconciliationActionKey =
  | 'view'
  | 'edit'
  | 'complete'
  | 'discard'
  | 'reopen'
  | 'cancelReopen'

/** An account that is no longer an active bank account is read-only. */
export function accountWritable(r: BankReconciliationDto): boolean {
  return r.bankAccount.isActive && r.bankAccount.isBankAccount
}

function isReopenedDraft(r: BankReconciliationDto): boolean {
  return r.status === 'DRAFT' && r.currentVersionNo !== null
}

export function availableActions(r: BankReconciliationDto): BankReconciliationActionKey[] {
  const writable = accountWritable(r)
  if (r.status === 'DRAFT') {
    if (isReopenedDraft(r)) {
      return writable ? ['view', 'edit', 'complete', 'cancelReopen'] : ['view', 'cancelReopen']
    }
    return writable ? ['view', 'edit', 'complete', 'discard'] : ['view', 'discard']
  }
  if (writable && r.isLatest && !r.accountHasDraft) return ['view', 'reopen']
  return ['view']
}

export function readOnlyNotice(r: BankReconciliationDto): string | null {
  if (accountWritable(r)) return null
  const prefix = 'This bank account is no longer an active bank account.'
  if (r.status === 'COMPLETED') return `${prefix} This reconciliation is read-only.`
  if (isReopenedDraft(r)) {
    return `${prefix} The reopened reconciliation cannot be edited or completed; cancel the reopen to restore the completed version.`
  }
  return `${prefix} The draft cannot be edited or completed; it can only be discarded.`
}

export function lockedReason(r: BankReconciliationDto): string | null {
  if (r.status !== 'COMPLETED') return null
  if (!accountWritable(r)) return readOnlyNotice(r)
  if (!r.isLatest) return 'A later reconciliation exists for this bank account, so this one is locked.'
  if (r.accountHasDraft) {
    return 'A draft exists for this bank account. Complete or discard it before reopening.'
  }
  return null
}

export function completeBlockers(s: ReconciliationSummaryDto): string[] {
  const out: string[] = []
  if (!isZero(s.difference)) out.push(`Difference is ${s.difference}`)
  if (s.openingBalanceDifference !== null && !isZero(s.openingBalanceDifference)) {
    out.push(`Opening Balance Difference is ${s.openingBalanceDifference}`)
  }
  if (s.unclassifiedCount !== null && s.unclassifiedCount > 0) {
    out.push(
      s.unclassifiedCount === 1
        ? '1 entry is unclassified'
        : `${s.unclassifiedCount} entries are unclassified`,
    )
  }
  return out
}

function isZero(v: string): boolean {
  return /^-?0+(\.0+)?$/.test(v)
}

export const CONFIRM_COPY: Record<
  'complete' | 'discard' | 'reopen' | 'cancelReopen',
  { title: string; message: string; confirmText: string }
> = {
  discard: {
    title: 'Discard draft?',
    message:
      'This deletes the draft reconciliation and releases the entries it had ticked or classified. Its number will not be reused. No journal entries are changed. This cannot be undone.',
    confirmText: 'Discard',
  },
  cancelReopen: {
    title: 'Cancel reopen?',
    message:
      'This discards every change made since reopening and restores the reconciliation exactly as it was last completed, including its balances and matched entries. No journal entries are changed.',
    confirmText: 'Cancel Reopen',
  },
  reopen: {
    title: 'Reopen reconciliation?',
    message:
      'This returns the reconciliation to Draft so it can be corrected. Its matched entries stay reserved. You can cancel the reopen to restore the completed version.',
    confirmText: 'Reopen',
  },
  complete: {
    title: 'Complete reconciliation?',
    message:
      'This locks the reconciliation and records the matched and outstanding entries as they are now. No journal entries are changed.',
    confirmText: 'Complete',
  },
}

export const DONE_LABEL: Record<keyof typeof CONFIRM_COPY, string> = {
  discard: 'Draft discarded',
  cancelReopen: 'Reopen cancelled',
  reopen: 'Reconciliation reopened',
  complete: 'Reconciliation completed',
}
