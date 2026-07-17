import type { AccountingSourceType } from '@/types'

export function buildSourceLink(
  sourceType: AccountingSourceType,
  sourceDocumentId: string | null,
  sourceRef: string | null,
): string | null {
  switch (sourceType) {
    case 'SALES_ORDER':
      return sourceRef ? `/sales/orders/${sourceRef}/view` : null
    case 'PURCHASE_ORDER':
      return sourceRef ? `/purchasing/orders/${sourceRef}/view` : null
    case 'STOCK_ADJUSTMENT':
      return sourceDocumentId
        ? `/inventory/stock-adjustments/${sourceDocumentId}/view`
        : null
    case 'OPENING_BALANCE':
      return null
  }
}
