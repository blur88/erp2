import { describe, expect, it } from 'vitest'
import type { Expense } from '@/types'
import { getExpenseActionMetas } from '../expenseActions'

const makeExpense = (
  documentStatus: Expense['documentStatus'],
  paymentStatus: Expense['paymentStatus'],
): Pick<Expense, 'documentStatus' | 'paymentStatus'> => ({
  documentStatus,
  paymentStatus,
})

describe('getExpenseActionMetas', () => {
  it('DRAFT + UNPAID → pay, edit, cancel', () => {
    const metas = getExpenseActionMetas(makeExpense('DRAFT', 'UNPAID'))
    expect(metas.map((m) => m.action)).toEqual(['pay', 'edit', 'cancel'])
  })

  it('DRAFT + PARTIAL → pay, refund, edit', () => {
    const metas = getExpenseActionMetas(makeExpense('DRAFT', 'PARTIAL'))
    expect(metas.map((m) => m.action)).toEqual(['pay', 'refund', 'edit'])
  })

  it('COMPLETED + PAID → refund only', () => {
    const metas = getExpenseActionMetas(makeExpense('COMPLETED', 'PAID'))
    expect(metas.map((m) => m.action)).toEqual(['refund'])
  })

  it('COMPLETED + OVERPAID → refund only', () => {
    const metas = getExpenseActionMetas(makeExpense('COMPLETED', 'OVERPAID'))
    expect(metas.map((m) => m.action)).toEqual(['refund'])
  })

  it('CANCELLED → empty array', () => {
    const metas = getExpenseActionMetas(makeExpense('CANCELLED', 'UNPAID'))
    expect(metas).toEqual([])
  })
})
