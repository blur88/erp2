import type { SalesOrder } from '@/types'

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
  const isFulfilled = status === 'FULFILLED'
  const isCancelled = status === 'CANCELLED'
  const isUnpaid = paymentStatus === 'UNPAID'
  const isPartiallyPaid = paymentStatus === 'PARTIAL'
  const needsPayment = isUnpaid || isPartiallyPaid

  if (isCancelled) {
    return [
      { action: 'uncancel' },
      { action: 'print' },
    ]
  }

  const metas: OrderActionMeta[] = []

  if (isDraft && needsPayment) {
    metas.push({ action: 'pay' })
  }

  if (isDraft) {
    metas.push({
      action: 'fulfill',
      disabled: needsPayment,
      tooltip: needsPayment ? 'Full payment required' : undefined,
    })
  }

  if (isFulfilled) {
    metas.push({ action: 'unfulfill' })
  }

  if (!isUnpaid) {
    metas.push({
      action: 'refund',
      disabled: isFulfilled,
      tooltip: isFulfilled ? 'Cannot refund a fulfilled order. Please unfulfill first.' : undefined,
    })
  }

  if (isDraft) {
    metas.push({
      action: 'edit',
      disabled: !needsPayment,
      tooltip: !needsPayment ? 'Cancel payment first to edit' : undefined,
    })
    metas.push({
      action: 'cancel',
      disabled: !needsPayment,
      tooltip: !needsPayment ? 'Cancel payment first' : undefined,
    })
  }

  metas.push({ action: 'duplicate' })
  metas.push({ action: 'print' })

  return metas
}

export function getOrderActions(order: SalesOrder): OrderAction[] {
  return getOrderActionMetas(order).map((m) => m.action)
}
