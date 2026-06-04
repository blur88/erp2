export type StockStatus = 'in_stock' | 'insufficient' | 'out_of_stock'

export interface StockOffender {
  name: string
  stock: number
  quantity: number
}

export interface StockOffenderInput {
  product?: { name?: string; stockQuantity?: number | string } | null
  quantity: number
}

export function getStockStatus(stockQuantity: number, orderedQty: number): StockStatus {
  const stock = Number(stockQuantity)
  if (stock <= 0) return 'out_of_stock'
  if (stock < orderedQty) return 'insufficient'
  return 'in_stock'
}

export function getStockOffenders(items: StockOffenderInput[]): StockOffender[] {
  return items
    .filter((item) => item.product && getStockStatus(Number(item.product.stockQuantity), item.quantity) !== 'in_stock')
    .map((item) => ({
      name: item.product?.name ?? 'Unknown item',
      stock: Number(item.product?.stockQuantity ?? 0),
      quantity: Number(item.quantity),
    }))
}
