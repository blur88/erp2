import { StockMovementType, type StockMovement } from '@/types'

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
  [StockMovementType.OWNER_DRAWING]: 'Owner Drawing',
  [StockMovementType.OWNER_DRAWING_REVERSAL]: 'Owner Drawing Reversal',
}

export function getMovementLabel(type: StockMovementType): string {
  return MOVEMENT_LABELS[type] ?? type
}

export type MovementNavTarget = 'sales_order' | 'purchase_order' | 'owner_equity'

export function getMovementNavTarget(referenceType?: string): MovementNavTarget | null {
  if (referenceType === 'sales_order') return 'sales_order'
  if (referenceType === 'purchase_order') return 'purchase_order'
  if (referenceType === 'owner_equity') return 'owner_equity'
  return null
}

/**
 * Whether the View action can reach a detail page for this movement.
 *
 * The requirement differs per target because the two lookups differ, so this
 * keys off referenceType, never movementType — an owner drawing and its
 * reversal both point at the same Owner Equity document:
 *
 * - sales_order / purchase_order: `referenceId`, looked up lazily to read the
 *   order number the route needs.
 * - owner_equity: the resolved `referenceNumber`. The Owner Equity API is keyed
 *   by reference number (`GET /owner-equity/:referenceNumber`) with no by-id
 *   endpoint, so a bare `referenceId` cannot be turned into a route.
 *
 * Exported so the Action column and the click handler share one predicate and
 * cannot drift into an enabled button that navigates nowhere.
 */
export function isMovementNavigable(movement: StockMovement): boolean {
  const target = getMovementNavTarget(movement.referenceType)
  if (target === 'owner_equity') return Boolean(movement.referenceNumber)
  if (target) return Boolean(movement.referenceId)
  return false
}

const REFERENCE_LABELS: Record<string, string> = {
  sales_order: 'Sales Order',
  purchase_order: 'Purchase Order',
  stock_adjustment: 'Stock Adjustment',
  owner_equity: 'Owner Equity',
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
