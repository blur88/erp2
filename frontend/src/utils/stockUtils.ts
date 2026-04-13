export const getStockStatus = (
  stockQuantity: number,
  lowStockThreshold: number,
): { label: string; color: 'error' | 'warning' | 'success' } => {
  if (stockQuantity <= 0) return { label: 'Out of Stock', color: 'error' }
  if (stockQuantity <= lowStockThreshold) return { label: 'Low Stock', color: 'warning' }
  return { label: 'In Stock', color: 'success' }
}
