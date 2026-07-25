import type { Expense } from '@/types'

export type ExpenseAction = 'pay' | 'refund' | 'edit' | 'cancel'

export interface ExpenseActionMeta {
  action: ExpenseAction
  disabled?: boolean
  tooltip?: string
}

export function getExpenseActionMetas(
  e: Pick<Expense, 'documentStatus' | 'paymentStatus'>,
): ExpenseActionMeta[] {
  if (e.documentStatus === 'CANCELLED') return []

  const metas: ExpenseActionMeta[] = []

  if (e.paymentStatus !== 'PAID') metas.push({ action: 'pay' })
  if (e.paymentStatus !== 'UNPAID') metas.push({ action: 'refund' })
  if (e.paymentStatus !== 'PAID') metas.push({ action: 'edit' })
  if (e.paymentStatus === 'UNPAID') metas.push({ action: 'cancel' })

  return metas
}
