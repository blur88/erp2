import type { ProviderSettlementStatus } from '@/types'

export interface ProviderSettlementActionMeta {
  key: 'view' | 'edit' | 'post' | 'discard' | 'reverse'
  label: string
  destructive?: boolean
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
