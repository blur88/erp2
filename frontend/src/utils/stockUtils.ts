export type StockStatusKey = 'in_stock' | 'low_stock' | 'out_of_stock'

export const getStockStatus = (
  stockQuantity: number,
  lowStockThreshold: number,
): StockStatusKey => {
  if (stockQuantity <= 0) return 'out_of_stock'
  if (stockQuantity <= lowStockThreshold) return 'low_stock'
  return 'in_stock'
}
