import { describe, expect, it } from 'vitest'

import type { PurchaseOrder } from '@/types'

import { getPurchaseOrderActionMetas } from '../purchaseOrderActions'

function order(
  status: PurchaseOrder['status'],
  paymentStatus: PurchaseOrder['paymentStatus'],
): PurchaseOrder {
  return { status, paymentStatus } as PurchaseOrder
}

function actions(po: PurchaseOrder): string[] {
  return getPurchaseOrderActionMetas(po).map((m) => m.action)
}

describe('getPurchaseOrderActionMetas', () => {
  it('draft + unpaid: pay, edit, cancel, duplicate, print', () => {
    expect(actions(order('DRAFT', 'UNPAID'))).toEqual(['pay', 'edit', 'cancel', 'duplicate', 'print'])
  })

  it('draft + partial: pay, edit, duplicate, print (no cancel)', () => {
    expect(actions(order('DRAFT', 'PARTIAL'))).toEqual(['pay', 'edit', 'duplicate', 'print'])
  })

  it('ready (fully paid): receive, refund, edit, duplicate, print', () => {
    expect(actions(order('READY', 'PAID'))).toEqual(['receive', 'refund', 'edit', 'duplicate', 'print'])
  })

  it('received: return, refund (disabled), duplicate, print', () => {
    const metas = getPurchaseOrderActionMetas(order('RECEIVED', 'PAID'))
    expect(metas.map((m) => m.action)).toEqual(['return', 'refund', 'duplicate', 'print'])
    expect(metas.find((m) => m.action === 'refund')?.disabled).toBe(true)
  })

  it('cancelled: uncancel, print', () => {
    expect(actions(order('CANCELLED', 'UNPAID'))).toEqual(['uncancel', 'print'])
  })

  it('no refund when unpaid', () => {
    expect(actions(order('DRAFT', 'UNPAID'))).not.toContain('refund')
  })

  it('paid draft is treated as ready: receive, refund, edit, duplicate, print', () => {
    expect(actions(order('DRAFT', 'PAID'))).toEqual(['receive', 'refund', 'edit', 'duplicate', 'print'])
  })
})
