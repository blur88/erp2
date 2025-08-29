import { ApiService } from './api'
import type { Product, Category, StockMovement, PaginatedResponse, QueryParams } from '@/types'

export const inventoryApi = {
  // Products
  async getProducts(params?: QueryParams) {
    return ApiService.get<PaginatedResponse<Product>>('/inventory/products', { params })
  },

  async getProduct(id: string) {
    return ApiService.get<Product>(`/inventory/products/${id}`)
  },

  async createProduct(productData: Partial<Product>) {
    return ApiService.post<Product>('/inventory/products', productData)
  },

  async updateProduct(id: string, productData: Partial<Product>) {
    return ApiService.patch<Product>(`/inventory/products/${id}`, productData)
  },

  async deleteProduct(id: string) {
    return ApiService.delete(`/inventory/products/${id}`)
  },

  async uploadProductImage(productId: string, file: File) {
    return ApiService.uploadFile<{ url: string }>(`/inventory/products/${productId}/image`, file)
  },

  async bulkUpdateProducts(updates: Array<{ id: string; data: Partial<Product> }>) {
    return ApiService.post<Product[]>('/inventory/products/bulk-update', { updates })
  },

  async importProducts(file: File) {
    return ApiService.uploadFile<{
      imported: number
      failed: number
      errors: Array<{ row: number; error: string }>
    }>('/inventory/products/import', file)
  },

  async exportProducts(params?: { format: 'csv' | 'xlsx' | 'pdf' }) {
    return ApiService.downloadFile('/inventory/products/export', `products.${params?.format || 'csv'}`)
  },

  // Categories
  async getCategories(params?: QueryParams & { includeProductCount?: boolean }) {
    return ApiService.get<PaginatedResponse<Category>>('/inventory/categories', { params })
  },

  async getCategory(id: string) {
    return ApiService.get<Category>(`/inventory/categories/${id}`)
  },

  async createCategory(categoryData: Partial<Category>) {
    return ApiService.post<Category>('/inventory/categories', categoryData)
  },

  async updateCategory(id: string, categoryData: Partial<Category>) {
    return ApiService.patch<Category>(`/inventory/categories/${id}`, categoryData)
  },

  async deleteCategory(id: string) {
    return ApiService.delete(`/inventory/categories/${id}`)
  },

  // Stock management
  async getStockMovements(params?: QueryParams & { productId?: string }) {
    return ApiService.get<PaginatedResponse<StockMovement>>('/inventory/stock-movements', { params })
  },

  async createStockAdjustment(data: {
    productId: string
    quantity: number
    type: 'in' | 'out' | 'adjustment'
    reason?: string
    reference?: string
  }) {
    return ApiService.post<StockMovement>('/inventory/stock-movements', data)
  },

  async getStockLevels(params?: { lowStock?: boolean; outOfStock?: boolean }) {
    return ApiService.get<Array<{
      product: Product
      currentStock: number
      minStock: number
      maxStock: number
      status: 'in_stock' | 'low_stock' | 'out_of_stock'
    }>>('/inventory/stock-levels', { params })
  },

  async stockTake(data: Array<{ productId: string; countedQuantity: number }>) {
    return ApiService.post<{
      adjustments: StockMovement[]
      summary: {
        totalProducts: number
        adjustmentsMade: number
        totalVariance: number
      }
    }>('/inventory/stock-take', { items: data })
  },

  // Reports
  async getInventoryReport(params: {
    startDate?: Date
    endDate?: Date
    categoryId?: string
    format?: 'json' | 'csv' | 'pdf'
  }) {
    if (params.format && params.format !== 'json') {
      return ApiService.downloadFile('/inventory/reports', `inventory-report.${params.format}`)
    }
    return ApiService.get('/inventory/reports', { params })
  },

  async getStockMovementReport(params: {
    startDate?: Date
    endDate?: Date
    productId?: string
    type?: string
    format?: 'json' | 'csv' | 'pdf'
  }) {
    if (params.format && params.format !== 'json') {
      return ApiService.downloadFile('/inventory/stock-movements/report', `stock-movements.${params.format}`)
    }
    return ApiService.get('/inventory/stock-movements/report', { params })
  },

  // Analytics
  async getInventoryAnalytics(params: {
    period: 'week' | 'month' | 'quarter' | 'year'
    startDate?: Date
    endDate?: Date
  }) {
    return ApiService.get<{
      totalValue: number
      totalProducts: number
      lowStockCount: number
      outOfStockCount: number
      topMovingProducts: Array<{
        product: Product
        movementCount: number
        totalQuantity: number
      }>
      categoryBreakdown: Array<{
        category: Category
        productCount: number
        totalValue: number
      }>
      stockTurnover: Array<{
        period: string
        turnover: number
      }>
    }>('/inventory/analytics', { params })
  },
}