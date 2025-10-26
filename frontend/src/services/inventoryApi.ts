import { ApiService } from './api'
import type { Product, Category, StockMovement, StockAdjustment, PaginatedResponse, QueryParams } from '@/types'

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

  async getDeletedProducts(params?: QueryParams) {
    return ApiService.get<PaginatedResponse<Product>>('/inventory/products/deleted', { params })
  },

  async restoreProduct(id: string) {
    return ApiService.post<Product>(`/inventory/products/${id}/restore`)
  },

  async bulkRestoreProducts(productIds: string[]) {
    return ApiService.post<{ message: string; restoredCount: number; failedIds: string[] }>(
      '/inventory/products/bulk-restore',
      { productIds }
    )
  },

  async permanentDeleteProduct(id: string) {
    return ApiService.delete(`/inventory/products/${id}/permanent`)
  },

  async bulkPermanentDeleteProducts(productIds: string[]) {
    return ApiService.post<{ message: string; deletedCount: number; failedIds: string[] }>(
      '/inventory/products/bulk-permanent-delete',
      { productIds }
    )
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

  async checkProductDuplicate(params: {
    name?: string
    barcode?: string
    excludeId?: string
  }) {
    return ApiService.get<{
      nameExists: boolean
      barcodeExists: boolean
      nameConflict?: {
        id: string
        name: string
        isDeleted: boolean
        barcode?: string
      }
      barcodeConflict?: {
        id: string
        name: string
        isDeleted: boolean
        barcode?: string
      }
    }>('/inventory/products/check-duplicate', { params })
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

  async checkCategoryDuplicate(params: {
    name?: string
    parentId?: string
    excludeId?: string
  }) {
    return ApiService.get<{
      nameExists: boolean
      nameConflict?: {
        id: string
        name: string
        isDeleted: boolean
        parentId?: string
      }
    }>('/inventory/categories/check-duplicate', { params })
  },

  async getDeletedCategories(params?: QueryParams) {
    return ApiService.get<PaginatedResponse<Category>>('/inventory/categories/deleted', { params })
  },

  async restoreCategory(id: string) {
    return ApiService.post<Category>(`/inventory/categories/${id}/restore`)
  },

  async permanentDeleteCategory(id: string) {
    return ApiService.delete(`/inventory/categories/${id}/permanent`)
  },

  async bulkRestoreCategories(categoryIds: string[]) {
    return ApiService.post<{ message: string; restoredCount: number; failedIds: string[] }>(
      '/inventory/categories/bulk-restore',
      { categoryIds }
    )
  },

  async bulkPermanentDeleteCategories(categoryIds: string[]) {
    return ApiService.post<{ message: string; deletedCount: number; failedIds: string[] }>(
      '/inventory/categories/bulk-permanent-delete',
      { categoryIds }
    )
  },

  // Hierarchical category methods
  async getCategoryTree(includeProductCount?: boolean) {
    return ApiService.get<{
      data: Category[]
      meta: { totalCategories: number; maxDepth: number; rootCategories: number }
    }>('/inventory/categories/tree', { params: { includeProductCount } })
  },

  async getRootCategories(includeProductCount?: boolean) {
    return ApiService.get<PaginatedResponse<Category>>('/inventory/categories/roots', { 
      params: { includeProductCount } 
    })
  },

  async getCategoryChildren(parentId: string, includeProductCount?: boolean) {
    return ApiService.get<PaginatedResponse<Category>>(`/inventory/categories/${parentId}/children`, {
      params: { includeProductCount }
    })
  },

  async getCategoryAncestors(id: string) {
    return ApiService.get<{
      id: string
      ancestors: Category[]
      category: Category
      breadcrumbs: string[]
    }>(`/inventory/categories/${id}/ancestors`)
  },

  async getCategoryStats(id: string) {
    return ApiService.get<{
      id: string
      name: string
      fullPath: string
      directProductCount: number
      totalProductCount: number
      subcategoryCount: number
      totalSubcategoryCount: number
      totalStockValue: number
      activeProductCount: number
      inactiveProductCount: number
      lowStockProductCount: number
      outOfStockProductCount: number
      averageRetailPrice: number
      highestPrice: number
      lowestPrice: number
      createdAt: string
      updatedAt: string
    }>(`/inventory/categories/${id}/stats`)
  },

  async moveCategory(id: string, newParentId: string | null, sortOrder?: number) {
    return ApiService.patch<Category>(`/inventory/categories/${id}/move`, {
      newParentId,
      sortOrder
    })
  },

  async bulkUpdateCategories(updates: Array<{
    id: string
    name?: string
    isActive?: boolean
    sortOrder?: number
    parentId?: string
  }>) {
    return ApiService.post<{ message: string }>('/inventory/categories/bulk-update', {
      categories: updates
    })
  },

  // Stock management
  async getStockMovements(params?: QueryParams & { productId?: string }) {
    return ApiService.get<PaginatedResponse<StockMovement>>('/inventory/stock/movements', { params })
  },

  // Stock Adjustments
  async getStockAdjustments(params?: QueryParams & {
    status?: string
    fromDate?: string
    toDate?: string
    adjustedByUserId?: string
  }) {
    return ApiService.get<PaginatedResponse<StockAdjustment>>('/inventory/stock-adjustments', { params })
  },

  async getStockAdjustment(id: string) {
    return ApiService.get<StockAdjustment>(`/inventory/stock-adjustments/${id}`)
  },

  async createStockAdjustment(data: {
    adjustmentDate?: Date
    notes?: string
    items: Array<{
      productId: string
      oldQuantity: number
      newQuantity: number
      difference: number
      unitCost?: number
      notes?: string
    }>
  }) {
    return ApiService.post<StockAdjustment>('/inventory/stock-adjustments', data)
  },

  async updateStockAdjustment(id: string, data: {
    adjustmentDate?: Date
    notes?: string
    items?: Array<{
      productId: string
      oldQuantity: number
      newQuantity: number
      difference: number
      unitCost?: number
      notes?: string
    }>
  }) {
    return ApiService.put<StockAdjustment>(`/inventory/stock-adjustments/${id}`, data)
  },

  async completeStockAdjustment(id: string) {
    return ApiService.post<StockAdjustment>(`/inventory/stock-adjustments/${id}/complete`)
  },

  async cancelStockAdjustment(id: string) {
    return ApiService.post<StockAdjustment>(`/inventory/stock-adjustments/${id}/cancel`)
  },

  async deleteStockAdjustment(id: string) {
    return ApiService.delete(`/inventory/stock-adjustments/${id}`)
  },

  async getStockLevels(params?: { lowStock?: boolean; outOfStock?: boolean }) {
    return ApiService.get<Array<{
      product: Product
      currentStock: number
      minStock: number
      maxStock: number
      status: 'in_stock' | 'low_stock' | 'out_of_stock'
    }>>('/inventory/stock/levels', { params })
  },

  async stockTake(data: Array<{ productId: string; countedQuantity: number }>) {
    return ApiService.post<{
      adjustments: StockMovement[]
      summary: {
        totalProducts: number
        adjustmentsMade: number
        totalVariance: number
      }
    }>('/inventory/stock/take', { items: data })
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
      return ApiService.downloadFile('/inventory/stock/movements/report', `stock-movements.${params.format}`)
    }
    return ApiService.get('/inventory/stock/movements/report', { params })
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

  // Dashboard
  async getDashboardStats() {
    return ApiService.get<{
      totalProducts: number
      totalCategories: number
      inventoryValue: number
      lowStockCount: number
      outOfStockCount: number
      recentMovements: number
      categoryBreakdown: Array<{ category: string; count: number; value: number }>
      stockHealthMetrics: {
        inStockPercentage: number
        lowStockPercentage: number
        outOfStockPercentage: number
        averageValue: number
      }
    }>('/inventory/products/dashboard-stats')
  },
}