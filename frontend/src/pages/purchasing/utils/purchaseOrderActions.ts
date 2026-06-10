import type { PurchaseOrder } from '@/types'

export type PurchaseOrderAction =
  | 'pay'
  | 'receive'
  | 'return'
  | 'refund'
  | 'edit'
  | 'cancel'
  | 'uncancel'
  | 'duplicate'
  | 'print'

export interface PurchaseOrderActionMeta {
  action: PurchaseOrderAction
  disabled?: boolean
  tooltip?: string
}

export function getPurchaseOrderActionMetas(order: PurchaseOrder): PurchaseOrderActionMeta[] {
  const status = order.status
  const paymentStatus = order.paymentStatus
  const isDraft = status === 'DRAFT'
  const isReady = status === 'READY'
  const isReceived = status === 'RECEIVED'
  const isCancelled = status === 'CANCELLED'
  const isUnpaid = paymentStatus === 'UNPAID'
  const isFullyPaid = paymentStatus === 'PAID' || paymentStatus === 'OVERPAID'
  const isOverpaid = paymentStatus === 'OVERPAID'
  const needsPayment = isUnpaid || paymentStatus === 'PARTIAL'
  // A paid DRAFT is "Ready" even if its status column still reads DRAFT. Overpaid
  // is excluded from the ready band (mirrors Sales Order).
  const isReadyState = !isOverpaid && (isReady || (isDraft && isFullyPaid))

  if (isCancelled) {
    return [{ action: 'uncancel' }, { action: 'print' }]
  }

  const metas: PurchaseOrderActionMeta[] = []

  // Pay — DRAFT with an outstanding balance.
  if (isDraft && needsPayment) {
    metas.push({ action: 'pay' })
  }

  // Receive — Ready only (fully paid). No stock check: a PO receives incoming goods.
  if (isReadyState) {
    metas.push({ action: 'receive' })
  }

  // Return — Received only.
  if (isReceived) {
    metas.push({ action: 'return' })
  }

  // Refund — only when fully paid (or overpaid); disabled on Received (return first).
  if (isFullyPaid) {
    metas.push({
      action: 'refund',
      disabled: isReceived,
      tooltip: isReceived ? 'Cannot refund a received order. Please return first.' : undefined,
    })
  }

  // Edit — any unreceived order (DRAFT/READY), enabled regardless of payment.
  if (isDraft || isReady) {
    metas.push({ action: 'edit' })
  }

  // Cancel — DRAFT with no payment at all.
  if (isDraft && isUnpaid) {
    metas.push({ action: 'cancel' })
  }

  // Duplicate — all non-cancelled orders (cancelled returned early above).
  metas.push({ action: 'duplicate' })

  metas.push({ action: 'print' })

  return metas
}

export function getPurchaseOrderActions(order: PurchaseOrder): PurchaseOrderAction[] {
  return getPurchaseOrderActionMetas(order).map((m) => m.action)
}
