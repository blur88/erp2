import type { SalesOrder } from '@/types'
import { getStockOffenders } from '@/utils/stockStatus'

export type OrderAction =
  | 'pay'
  | 'fulfill'
  | 'unfulfill'
  | 'refund'
  | 'edit'
  | 'cancel'
  | 'uncancel'
  | 'duplicate'
  | 'print'

export interface OrderActionMeta {
  action: OrderAction
  disabled?: boolean
  tooltip?: string
}

export function getOrderActionMetas(order: SalesOrder): OrderActionMeta[] {
  const { status, paymentStatus } = order
  const isDraft = status === 'DRAFT'
  const isReady = status === 'READY'
  const isFulfilled = status === 'FULFILLED'
  const isCancelled = status === 'CANCELLED'
  const isUnpaid = paymentStatus === 'UNPAID'
  const isFullyPaid = paymentStatus === 'PAID' || paymentStatus === 'OVERPAID'
  const needsPayment = isUnpaid || paymentStatus === 'PARTIAL'
  // Overpaid is treated like PARTIAL: NOT fulfillable. Only an exactly-paid order
  // is fulfillable. Mirrors backend updatePaymentStatusInTx, which excludes
  // OVERPAID from the paid-in-full band (so overpaid never reaches READY). Guard
  // the READY arm too in case a stale READY+OVERPAID state ever reaches the UI.
  const isOverpaid = paymentStatus === 'OVERPAID'
  // A paid DRAFT is "Ready" even if its status column still reads DRAFT.
  const isReadyState = !isOverpaid && (isReady || (isDraft && isFullyPaid))

  if (isCancelled) {
    return [{ action: 'uncancel' }, { action: 'print' }]
  }

  const metas: OrderActionMeta[] = []

  // Pay — DRAFT with an outstanding balance.
  if (isDraft && needsPayment) {
    metas.push({ action: 'pay' })
  }

  // Fulfill — Ready only (fully-paid). Hidden on unpaid/partial drafts.
  if (isReadyState) {
    const offenders = getStockOffenders(
      (order.items ?? []).map((item) => ({
        product: item.product,
        quantity: Number(item.quantity ?? 0),
      })),
    )
    const fulfillMeta: OrderActionMeta = { action: 'fulfill' }
    if (offenders.length > 0) {
      fulfillMeta.disabled = true
      fulfillMeta.tooltip = `Cannot fulfill — ${offenders.length} item(s) out of stock: ${offenders.map((o) => o.name).join(', ')}`
    }
    metas.push(fulfillMeta)
  }

  // Unfulfill — Fulfilled only.
  if (isFulfilled) {
    metas.push({ action: 'unfulfill' })
  }

  // Refund — whenever a payment exists; disabled on Fulfilled.
  if (!isUnpaid) {
    metas.push({
      action: 'refund',
      disabled: isFulfilled,
      tooltip: isFulfilled ? 'Cannot refund a fulfilled order. Please unfulfill first.' : undefined,
    })
  }

  // Edit — any unfulfilled order (all DRAFT/Ready states), enabled regardless of payment.
  if (isDraft || isReady) {
    metas.push({ action: 'edit' })
  }

  // Cancel — DRAFT with no payment at all.
  if (isDraft && isUnpaid) {
    metas.push({ action: 'cancel' })
  }

  metas.push({ action: 'duplicate' })
  metas.push({ action: 'print' })

  return metas
}

export function getOrderActions(order: SalesOrder): OrderAction[] {
  return getOrderActionMetas(order).map((m) => m.action)
}
