import type { OwnerEquityDocument } from '@/types'

export type OwnerEquityAction =
  | 'settle'
  | 'refund'
  | 'edit'
  | 'complete'
  | 'uncomplete'
  | 'cancel'
  | 'uncancel'

export interface OwnerEquityActionMeta {
  action: OwnerEquityAction
  disabled?: boolean
  tooltip?: string
}

export function getOwnerEquityActionMetas(
  doc: Pick<OwnerEquityDocument, 'type' | 'documentStatus' | 'settlementStatus'>,
): OwnerEquityActionMeta[] {
  if (doc.type === 'STOCK_DRAWING') return stockDrawingMetas(doc.documentStatus)
  return monetaryMetas(doc.documentStatus, doc.settlementStatus)
}

function stockDrawingMetas(documentStatus: OwnerEquityDocument['documentStatus']): OwnerEquityActionMeta[] {
  if (documentStatus === 'COMPLETED') return [{ action: 'uncomplete' }]
  if (documentStatus === 'CANCELLED') return [{ action: 'uncancel' }]
  return [{ action: 'complete' }, { action: 'edit' }, { action: 'cancel' }]
}

/**
 * Monetary documents complete implicitly on full settlement (#1094), so they
 * offer no Complete/Uncomplete action at all: a COMPLETED document is reopened
 * by refunding it, which demotes it back to DRAFT. Same shape as
 * getExpenseActionMetas.
 */
function monetaryMetas(
  documentStatus: OwnerEquityDocument['documentStatus'],
  settlementStatus: OwnerEquityDocument['settlementStatus'],
): OwnerEquityActionMeta[] {
  if (documentStatus === 'CANCELLED') return [{ action: 'uncancel' }]
  if (documentStatus === 'COMPLETED') return [{ action: 'refund' }]

  const metas: OwnerEquityActionMeta[] = []
  const fullySettled = settlementStatus === 'SETTLED'

  if (!fullySettled) metas.push({ action: 'settle' })
  if (settlementStatus !== 'UNSETTLED') metas.push({ action: 'refund' })
  if (!fullySettled) metas.push({ action: 'edit' })
  if (settlementStatus === 'UNSETTLED') metas.push({ action: 'cancel' })

  return metas
}
