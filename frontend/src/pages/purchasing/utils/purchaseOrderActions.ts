import type { PurchaseOrder } from '@/types'

export type PurchaseOrderAction =
  | 'pay'
  | 'receive'
  | 'return'
  | 'edit'
  | 'cancel'
  | 'uncancel'
  | 'print'
  | 'unpay'

export interface PurchaseOrderActionMeta {
  action: PurchaseOrderAction
  disabled?: boolean
  tooltip?: string
}

export function getPurchaseOrderActionMetas(order: PurchaseOrder): PurchaseOrderActionMeta[] {
  const status = order.status
  const paymentStatus = order.paymentStatus
  const isDraft = status === 'DRAFT'
  const isReady = status === 'READY' || (status === 'DRAFT' && (paymentStatus === 'PAID' || paymentStatus === 'OVERPAID'))
  const isReceived = status === 'RECEIVED'
  const isCancelled = status === 'CANCELLED'
  const isUnpaid = paymentStatus === 'UNPAID'

  if (isCancelled) {
    // Mirror Sales Order: a cancelled order can be uncancelled (back to DRAFT)
    // and still printed. All other actions are unavailable.
    return [{ action: 'uncancel' }, { action: 'print' }]
  }

  const metas: PurchaseOrderActionMeta[] = []

  if (isDraft) {
    if (paymentStatus !== 'PAID' && paymentStatus !== 'OVERPAID') {
      metas.push({ action: 'pay' })
    }

    if (isUnpaid) {
      metas.push({ action: 'cancel' })
    }
  }

  if (isReady) {
    metas.push({ action: 'receive' })
    metas.push({ action: 'unpay' })
    metas.push({ action: 'edit' })
  }

  if (isReceived) {
    metas.push({ action: 'return' })
  }

  metas.push({ action: 'print' })

  return metas
}
