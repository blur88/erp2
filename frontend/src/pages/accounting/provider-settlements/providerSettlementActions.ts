import type { ProviderSettlement, ProviderSettlementStatus } from '@/types'

export interface ProviderSettlementActionMeta {
  key: 'view' | 'edit' | 'post' | 'discard' | 'reverse'
  label: string
  destructive?: boolean
}

export const NOT_PROVIDER_CLEARING_TOOLTIP = 'Not a provider clearing account'

/**
 * UI SIGNAL ONLY (#1285, spec §9.3): a DRAFT whose STORED clearing account is
 * explicitly unflagged holds non-provider-clearing payments (a draft has exactly
 * one derived clearing account). Post-time re-derivation and server validation
 * remain authoritative. An unknown flag (undefined) never blocks.
 */
export function isNotProviderClearingDraft(
  s: Pick<ProviderSettlement, 'status' | 'clearingAccount'>,
): boolean {
  return s.status === 'DRAFT' && s.clearingAccount?.isProviderClearing === false
}

/**
 * Status drives the menu. A POSTED settlement is immutable, so it offers
 * neither edit nor discard; a REVERSED one is terminal.
 */
export function getProviderSettlementActionMetas(
  status: ProviderSettlementStatus,
): ProviderSettlementActionMeta[] {
  switch (status) {
    case 'DRAFT':
      return [
        { key: 'view', label: 'View' },
        { key: 'edit', label: 'Edit' },
        { key: 'post', label: 'Post' },
        { key: 'discard', label: 'Discard', destructive: true },
      ]
    case 'POSTED':
      return [
        { key: 'view', label: 'View' },
        { key: 'reverse', label: 'Reverse', destructive: true },
      ]
    case 'REVERSED':
      return [{ key: 'view', label: 'View' }]
  }
}
