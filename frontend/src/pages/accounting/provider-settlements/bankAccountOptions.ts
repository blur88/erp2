import type { Account } from '@/types'

export interface BankAccountOption { id: string; label: string; disabled: boolean }

/** #1298: a settlement destination must be an active, flagged bank account. */
export function isEligibleBankAccount(accounts: Account[], id: string): boolean {
  const account = accounts.find((a) => a.id === id)
  return !!account && account.isActive && account.isBankAccount
}

/**
 * Eligible accounts, plus — when the saved selection is no longer eligible — that
 * selection as a DISABLED option labelled with the reason, so an existing draft
 * never renders a blank select. "Not a bank account" wins over "inactive": the
 * flag is the more fundamental requirement.
 */
export function bankAccountOptions(
  accounts: Account[],
  selectedId: string,
  stored?: { code: string; name: string } | null,
): BankAccountOption[] {
  const eligible = accounts
    .filter((a) => a.isActive && a.isBankAccount)
    .map((a) => ({ id: a.id, label: `${a.code} ${a.name}`, disabled: false }))
  if (!selectedId || eligible.some((o) => o.id === selectedId)) return eligible
  const account = accounts.find((a) => a.id === selectedId)
  const base = account ? `${account.code} ${account.name}` : stored ? `${stored.code} ${stored.name}` : selectedId
  const suffix = !account ? '(unavailable)' : !account.isBankAccount ? '(not a bank account)' : '(inactive)'
  return [{ id: selectedId, label: `${base} ${suffix}`, disabled: true }, ...eligible]
}
