import { describe, expect, it } from 'vitest'
import type { SalesOrder } from '@/types'
import { getOrderActions, getOrderActionMetas } from '../orderActions'

const makeOrder = (status: SalesOrder['status'], paymentStatus: SalesOrder['paymentStatus']): SalesOrder =>
  ({ id: 'o1', orderNumber: 'SO-26-001', status, paymentStatus } as SalesOrder)

describe('getOrderActions', () => {
  it('DRAFT + UNPAID: pay, fulfill, edit, cancel, duplicate, print — no refund, no uncancel', () => {
    const actions = getOrderActions(makeOrder('DRAFT', 'UNPAID'))
    expect(actions).toContain('pay')
    expect(actions).toContain('fulfill')
    expect(actions).toContain('edit')
    expect(actions).toContain('cancel')
    expect(actions).toContain('duplicate')
    expect(actions).toContain('print')
    expect(actions).not.toContain('refund')
    expect(actions).not.toContain('uncancel')
    expect(actions).not.toContain('unfulfill')
  })

  it('DRAFT + PARTIAL: fulfill, refund, edit, cancel, duplicate, print — no pay', () => {
    const actions = getOrderActions(makeOrder('DRAFT', 'PARTIAL'))
    expect(actions).not.toContain('pay')
    expect(actions).toContain('fulfill')
    expect(actions).toContain('refund')
    expect(actions).toContain('edit')
    expect(actions).toContain('cancel')
    expect(actions).toContain('duplicate')
  })

  it('DRAFT + PAID: fulfill, refund, edit, cancel, duplicate, print — no pay', () => {
    const actions = getOrderActions(makeOrder('DRAFT', 'PAID'))
    expect(actions).not.toContain('pay')
    expect(actions).toContain('fulfill')
    expect(actions).toContain('refund')
    expect(actions).toContain('duplicate')
  })

  it('FULFILLED + PAID: unfulfill, refund, duplicate, print — no pay, edit, cancel', () => {
    const actions = getOrderActions(makeOrder('FULFILLED', 'PAID'))
    expect(actions).toContain('unfulfill')
    expect(actions).toContain('refund')
    expect(actions).toContain('duplicate')
    expect(actions).toContain('print')
    expect(actions).not.toContain('pay')
    expect(actions).not.toContain('edit')
    expect(actions).not.toContain('cancel')
  })

  it('FULFILLED + OVERPAID: unfulfill, refund, duplicate, print', () => {
    const actions = getOrderActions(makeOrder('FULFILLED', 'OVERPAID'))
    expect(actions).toContain('refund')
    expect(actions).toContain('unfulfill')
    expect(actions).toContain('duplicate')
  })

  it('CANCELLED: only uncancel + print', () => {
    const actions = getOrderActions(makeOrder('CANCELLED', 'UNPAID'))
    expect(actions).toEqual(expect.arrayContaining(['uncancel', 'print']))
    expect(actions).not.toContain('pay')
    expect(actions).not.toContain('edit')
    expect(actions).not.toContain('cancel')
    expect(actions).not.toContain('refund')
    expect(actions).not.toContain('duplicate')
    expect(actions).not.toContain('fulfill')
    expect(actions).not.toContain('unfulfill')
  })
})

describe('getOrderActionMetas — disabled flags', () => {
  it('fulfill is disabled when DRAFT + UNPAID', () => {
    const metas = getOrderActionMetas(makeOrder('DRAFT', 'UNPAID'))
    const fulfill = metas.find((m) => m.action === 'fulfill')
    expect(fulfill?.disabled).toBe(true)
    expect(fulfill?.tooltip).toMatch(/payment required/i)
  })

  it('fulfill is enabled when DRAFT + PARTIAL', () => {
    const metas = getOrderActionMetas(makeOrder('DRAFT', 'PARTIAL'))
    const fulfill = metas.find((m) => m.action === 'fulfill')
    expect(fulfill?.disabled).toBe(false)
  })

  it('edit is disabled when DRAFT + PAID', () => {
    const metas = getOrderActionMetas(makeOrder('DRAFT', 'PAID'))
    const edit = metas.find((m) => m.action === 'edit')
    expect(edit?.disabled).toBe(true)
  })

  it('cancel is disabled when DRAFT + PARTIAL', () => {
    const metas = getOrderActionMetas(makeOrder('DRAFT', 'PARTIAL'))
    const cancel = metas.find((m) => m.action === 'cancel')
    expect(cancel?.disabled).toBe(true)
  })
})
