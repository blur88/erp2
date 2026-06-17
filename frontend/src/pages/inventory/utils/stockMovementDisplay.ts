import { StockMovementType } from '@/types'

const MOVEMENT_LABELS: Record<StockMovementType, string> = {
  [StockMovementType.PURCHASE_RECEIPT]: 'Purchase Receipt',
  [StockMovementType.SALES_RETURN]: 'Sales Return',
  [StockMovementType.SALE_REVERSAL]: 'Sale Reversal',
  [StockMovementType.PRODUCTION_RECEIPT]: 'Production Receipt',
  [StockMovementType.TRANSFER_IN]: 'Transfer In',
  [StockMovementType.ADJUSTMENT_INCREASE]: 'Stock Adjustment',
  [StockMovementType.INITIAL_STOCK]: 'Initial Stock',
  [StockMovementType.SALE]: 'Sale',
  [StockMovementType.PURCHASE_RETURN]: 'Purchase Return',
  [StockMovementType.PRODUCTION_CONSUMPTION]: 'Production Consumption',
  [StockMovementType.TRANSFER_OUT]: 'Transfer Out',
  [StockMovementType.ADJUSTMENT_DECREASE]: 'Stock Adjustment',
  [StockMovementType.DAMAGE]: 'Damage',
  [StockMovementType.EXPIRY]: 'Expiry',
  [StockMovementType.THEFT]: 'Theft',
  [StockMovementType.LOSS]: 'Loss',
}

export function getMovementLabel(type: StockMovementType): string {
  return MOVEMENT_LABELS[type] ?? type
}

export type MovementNavTarget = 'sales_order' | 'purchase_order'

export function getMovementNavTarget(referenceType?: string): MovementNavTarget | null {
  if (referenceType === 'sales_order') return 'sales_order'
  if (referenceType === 'purchase_order') return 'purchase_order'
  return null
}

const REFERENCE_LABELS: Record<string, string> = {
  sales_order: 'Sales Order',
  purchase_order: 'Purchase Order',
  stock_adjustment: 'Stock Adjustment',
  stock_movement_reversal: 'Reversal',
}

/** Human-readable label for a movement's referenceType (snake_case → Title Case). */
export function getReferenceLabel(referenceType?: string): string {
  if (!referenceType) return '—'
  return (
    REFERENCE_LABELS[referenceType] ??
    referenceType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  )
}
