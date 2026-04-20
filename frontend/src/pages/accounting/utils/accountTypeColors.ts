import type { AccountType } from '@/types'

export const ACCOUNT_TYPE_COLORS: Record<AccountType, 'success' | 'error' | 'primary' | 'info' | 'warning'> = {
  ASSET: 'success',
  LIABILITY: 'error',
  EQUITY: 'primary',
  REVENUE: 'info',
  EXPENSE: 'warning',
}
