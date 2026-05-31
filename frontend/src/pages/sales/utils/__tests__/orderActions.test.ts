import { describe, expect, it } from 'vitest'
import type { SalesOrder } from '@/types'
import { getOrderActions, getOrderActionMetas } from '../orderActions'

const makeOrder = (status: SalesOrder['status'], paymentStatus: SalesOrder['paymentStatus']): SalesOrder =>
  ({ id: 'o1', orderNumber: 'SO-26-001', status, paymentStatus } as SalesOrder)

describe('getOrderActions', () => {
  it('DRAFT + UNPAID: pay, edit, cancel, duplicate, print — no fulfill, refund, uncancel', () => {
    const actions = getOrderActions(makeOrder('DRAFT', 'UNPAID'))
    expect(actions).toContain('pay')
    expect(actions).toContain('edit')
    expect(actions).toContain('cancel')
    expect(actions).toContain('duplicate')
    expect(actions).toContain('print')
    expect(actions).not.toContain('fulfill')
    expect(actions).not.toContain('refund')
    expect(actions).not.toContain('uncancel')
    expect(actions).not.toContain('unfulfill')
  })

  it('DRAFT + PARTIAL: pay, refund, edit, duplicate, print — no fulfill, no cancel', () => {
    const actions = getOrderActions(makeOrder('DRAFT', 'PARTIAL'))
    expect(actions).toContain('pay')
    expect(actions).toContain('refund')
    expect(actions).toContain('edit')
    expect(actions).toContain('duplicate')
    expect(actions).toContain('print')
    expect(actions).not.toContain('fulfill')
    expect(actions).not.toContain('cancel')
  })

  it('DRAFT + PAID (Ready): fulfill, refund, edit, duplicate, print — no pay, no cancel', () => {
    const actions = getOrderActions(makeOrder('DRAFT', 'PAID'))
    expect(actions).toContain('fulfill')
    expect(actions).toContain('refund')
    expect(actions).toContain('edit')
    expect(actions).toContain('duplicate')
    expect(actions).not.toContain('pay')
    expect(actions).not.toContain('cancel')
  })

  it('READY + PAID: fulfill, refund, edit, duplicate, print — no pay, no cancel', () => {
    const actions = getOrderActions(makeOrder('READY', 'PAID'))
    expect(actions).toContain('fulfill')
    expect(actions).toContain('refund')
    expect(actions).toContain('edit')
    expect(actions).toContain('duplicate')
    expect(actions).toContain('print')
    expect(actions).not.toContain('pay')
    expect(actions).not.toContain('cancel')
  })

  it('READY + OVERPAID: still fulfill + refund + edit', () => {
    const actions = getOrderActions(makeOrder('READY', 'OVERPAID'))
    expect(actions).toContain('fulfill')
    expect(actions).toContain('refund')
    expect(actions).toContain('edit')
  })

  it('FULFILLED + PAID: unfulfill, refund, duplicate, print — no pay, edit, cancel, fulfill', () => {
    const actions = getOrderActions(makeOrder('FULFILLED', 'PAID'))
    expect(actions).toContain('unfulfill')
    expect(actions).toContain('refund')
    expect(actions).toContain('duplicate')
    expect(actions).toContain('print')
    expect(actions).not.toContain('pay')
    expect(actions).not.toContain('edit')
    expect(actions).not.toContain('cancel')
    expect(actions).not.toContain('fulfill')
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

describe('getOrderActionMetas — disabled flags & tooltips', () => {
  it('fulfill is hidden (absent) when DRAFT + UNPAID', () => {
    const metas = getOrderActionMetas(makeOrder('DRAFT', 'UNPAID'))
    expect(metas.find((m) => m.action === 'fulfill')).toBeUndefined()
  })

  it('fulfill is hidden (absent) when DRAFT + PARTIAL', () => {
    const metas = getOrderActionMetas(makeOrder('DRAFT', 'PARTIAL'))
    expect(metas.find((m) => m.action === 'fulfill')).toBeUndefined()
  })

  it('edit is enabled (no disabled flag) when DRAFT + PAID', () => {
    const metas = getOrderActionMetas(makeOrder('DRAFT', 'PAID'))
    const edit = metas.find((m) => m.action === 'edit')
    expect(edit).toBeDefined()
    expect(edit?.disabled).toBeFalsy()
  })

  it('cancel is hidden (absent) when DRAFT + PARTIAL', () => {
    const metas = getOrderActionMetas(makeOrder('DRAFT', 'PARTIAL'))
    expect(metas.find((m) => m.action === 'cancel')).toBeUndefined()
  })

  it('cancel is enabled when DRAFT + UNPAID', () => {
    const metas = getOrderActionMetas(makeOrder('DRAFT', 'UNPAID'))
    const cancel = metas.find((m) => m.action === 'cancel')
    expect(cancel).toBeDefined()
    expect(cancel?.disabled).toBeFalsy()
  })

  it('refund is disabled with tooltip when FULFILLED + PAID', () => {
    const metas = getOrderActionMetas(makeOrder('FULFILLED', 'PAID'))
    const refund = metas.find((m) => m.action === 'refund')
    expect(refund?.disabled).toBe(true)
    expect(refund?.tooltip).toMatch(/unfulfill first/i)
  })

  it('refund is enabled (not disabled) when DRAFT + PAID', () => {
    const metas = getOrderActionMetas(makeOrder('DRAFT', 'PAID'))
    const refund = metas.find((m) => m.action === 'refund')
    expect(refund?.disabled).toBeFalsy()
  })

  it('fulfill is enabled when READY + PAID', () => {
    const metas = getOrderActionMetas(makeOrder('READY', 'PAID'))
    const fulfill = metas.find((m) => m.action === 'fulfill')
    expect(fulfill).toEqual({ action: 'fulfill' })
  })
})
