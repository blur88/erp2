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
  it('draft + unpaid: pay, cancel, print', () => {
    expect(actions(order('DRAFT', 'UNPAID'))).toEqual(['pay', 'cancel', 'print'])
  })

  it('draft + partial: pay (no cancel), print', () => {
    expect(actions(order('DRAFT', 'PARTIAL'))).toEqual(['pay', 'print'])
  })

  it('ready: receive, unpay, edit, print', () => {
    expect(actions(order('READY', 'PAID'))).toEqual(['receive', 'unpay', 'edit', 'print'])
  })

  it('received: return, print', () => {
    expect(actions(order('RECEIVED', 'PAID'))).toEqual(['return', 'print'])
  })

  it('cancelled: uncancel, print (mirrors Sales Order)', () => {
    expect(actions(order('CANCELLED', 'UNPAID'))).toEqual(['uncancel', 'print'])
  })

  it('does not offer pay once fully paid in draft', () => {
    expect(actions(order('DRAFT', 'PAID'))).not.toContain('pay')
  })
})
