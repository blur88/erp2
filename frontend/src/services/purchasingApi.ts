import { ApiService } from './api'
import type { Supplier, PurchaseOrder, GoodsReceivedNote, PaginatedResponse, QueryParams } from '@/types'

export const purchasingApi = {
  // Suppliers
  async getSuppliers(params?: QueryParams) {
    return ApiService.get<PaginatedResponse<Supplier>>('/purchasing/suppliers', { params })
  },

  async getSupplier(id: string) {
    return ApiService.get<Supplier>(`/purchasing/suppliers/${id}`)
  },

  async createSupplier(supplierData: Partial<Supplier>) {
    return ApiService.post<Supplier>('/purchasing/suppliers', supplierData)
  },

  async updateSupplier(id: string, supplierData: Partial<Supplier>) {
    return ApiService.patch<Supplier>(`/purchasing/suppliers/${id}`, supplierData)
  },

  async deleteSupplier(id: string) {
    return ApiService.delete(`/purchasing/suppliers/${id}`)
  },

  async getSupplierProducts(id: string, params?: QueryParams) {
    return ApiService.get<PaginatedResponse<any>>(`/purchasing/suppliers/${id}/products`, { params })
  },

  async getDeletedSuppliers(params?: QueryParams) {
    return ApiService.get<PaginatedResponse<Supplier>>('/purchasing/suppliers/deleted', { params })
  },

  async restoreSupplier(id: string) {
    return ApiService.post<Supplier>(`/purchasing/suppliers/${id}/restore`)
  },

  async permanentDeleteSupplier(id: string) {
    return ApiService.delete(`/purchasing/suppliers/${id}/permanent`)
  },

  async bulkRestoreSuppliers(supplierIds: string[]) {
    return ApiService.post<{ restoredCount: number; failedIds: string[] }>('/purchasing/suppliers/bulk-restore', {
      supplierIds
    })
  },

  async bulkPermanentDeleteSuppliers(supplierIds: string[]) {
    return ApiService.post<{ deletedCount: number; failedIds: string[] }>('/purchasing/suppliers/bulk-permanent-delete', {
      supplierIds
    })
  },

  async checkDuplicateCompanyName(companyName: string, excludeId?: string) {
    return ApiService.get<{ exists: boolean; message?: string }>('/purchasing/suppliers/check-duplicate', {
      params: { companyName, excludeId }
    })
  },

  // Purchase Orders
  async getPurchaseOrders(params?: QueryParams & { supplierId?: string; status?: string }) {
    return ApiService.get<PaginatedResponse<PurchaseOrder>>('/purchasing/orders', { params })
  },

  async getPurchaseOrder(id: string) {
    return ApiService.get<PurchaseOrder>(`/purchasing/orders/${id}`)
  },

  async createPurchaseOrder(orderData: Partial<PurchaseOrder>) {
    return ApiService.post<PurchaseOrder>('/purchasing/orders', orderData)
  },

  async updatePurchaseOrder(id: string, orderData: Partial<PurchaseOrder>) {
    return ApiService.put<PurchaseOrder>(`/purchasing/orders/${id}`, orderData)
  },

  async deletePurchaseOrder(id: string) {
    return ApiService.delete(`/purchasing/orders/${id}`)
  },

  async getDeletedPurchaseOrders(params?: QueryParams) {
    return ApiService.get<PaginatedResponse<PurchaseOrder>>('/purchasing/orders/deleted', { params })
  },

  async restorePurchaseOrder(id: string) {
    return ApiService.post<PurchaseOrder>(`/purchasing/orders/${id}/restore`)
  },

  async permanentDeletePurchaseOrder(id: string) {
    return ApiService.delete(`/purchasing/orders/${id}/permanent`)
  },

  async bulkRestorePurchaseOrders(orderIds: string[]) {
    return ApiService.post<{ restoredCount: number; failedIds: string[] }>('/purchasing/orders/bulk-restore', {
      orderIds
    })
  },

  async bulkPermanentDeletePurchaseOrders(orderIds: string[]) {
    return ApiService.post<{ deletedCount: number; failedIds: string[] }>('/purchasing/orders/bulk-permanent-delete', {
      orderIds
    })
  },

  async sendPurchaseOrder(id: string, options?: {
    email?: string
    subject?: string
    message?: string
  }) {
    return ApiService.post(`/purchasing/orders/${id}/send`, options)
  },

  async confirmPurchaseOrder(id: string) {
    return ApiService.post<PurchaseOrder>(`/purchasing/orders/${id}/confirm`)
  },

  async cancelPurchaseOrder(id: string, reason?: string) {
    return ApiService.post<PurchaseOrder>(`/purchasing/orders/${id}/cancel`, { reason })
  },

  async printPurchaseOrder(id: string) {
    return ApiService.downloadFile(`/purchasing/orders/${id}/print`, `purchase-order-${id}.pdf`)
  },

  // Goods Received Notes (GRN)
  async getGoodsReceivedNotes(params?: QueryParams & { supplierId?: string; purchaseOrderId?: string }) {
    // Convert sortOrder to uppercase for backend compatibility
    const apiParams = params ? {
      ...params,
      sortOrder: params.sortOrder ? params.sortOrder.toUpperCase() : undefined
    } : undefined
    return ApiService.get<PaginatedResponse<GoodsReceivedNote>>('/purchasing/goods-received-notes', { params: apiParams })
  },

  async getGoodsReceivedNote(id: string) {
    return ApiService.get<GoodsReceivedNote>(`/purchasing/goods-received-notes/${id}`)
  },

  async createGoodsReceivedNote(grnData: Partial<GoodsReceivedNote>) {
    return ApiService.post<GoodsReceivedNote>('/purchasing/goods-received-notes', grnData)
  },

  async updateGoodsReceivedNote(id: string, grnData: Partial<GoodsReceivedNote>) {
    return ApiService.put<GoodsReceivedNote>(`/purchasing/goods-received-notes/${id}`, grnData)
  },

  async deleteGoodsReceivedNote(id: string) {
    return ApiService.delete(`/purchasing/goods-received-notes/${id}`)
  },

  async getDeletedGRNs(params?: QueryParams) {
    return ApiService.get<PaginatedResponse<GoodsReceivedNote>>('/purchasing/goods-received-notes/deleted', { params })
  },

  async restoreGRN(id: string) {
    return ApiService.post<GoodsReceivedNote>(`/purchasing/goods-received-notes/${id}/restore`)
  },

  async bulkRestoreGRNs(grnIds: string[]) {
    return ApiService.post<{ restoredCount: number; failedIds: string[] }>('/purchasing/goods-received-notes/bulk-restore', {
      grnIds
    })
  },

  async bulkPermanentDeleteGRNs(grnIds: string[]) {
    return ApiService.post<{ deletedCount: number; failedIds: string[] }>('/purchasing/goods-received-notes/bulk-permanent-delete', {
      grnIds
    })
  },

  async permanentDeleteGRN(id: string) {
    return ApiService.delete(`/purchasing/goods-received-notes/${id}/permanent`)
  },

  // Receive/Return operations
  async receiveGoods(purchaseOrderId: string) {
    return ApiService.post<PurchaseOrder>(`/purchasing/orders/${purchaseOrderId}/receive`)
  },

  async returnGoods(purchaseOrderId: string) {
    return ApiService.post<PurchaseOrder>(`/purchasing/orders/${purchaseOrderId}/return`)
  },

  async printGoodsReceivedNote(id: string) {
    return ApiService.downloadFile(`/purchasing/goods-received-notes/${id}/print`, `grn-${id}.pdf`)
  },

  // Purchase Requisitions
  async getPurchaseRequisitions(params?: QueryParams & { status?: string; departmentId?: string }) {
    return ApiService.get<PaginatedResponse<any>>('/purchasing/requisitions', { params })
  },

  async createPurchaseRequisition(requisitionData: any) {
    return ApiService.post('/purchasing/requisitions', requisitionData)
  },

  async approvePurchaseRequisition(id: string, comment?: string) {
    return ApiService.post(`/purchasing/requisitions/${id}/approve`, { comment })
  },

  async rejectPurchaseRequisition(id: string, reason: string) {
    return ApiService.post(`/purchasing/requisitions/${id}/reject`, { reason })
  },

  async convertRequisitionToPurchaseOrder(id: string, supplierId: string) {
    return ApiService.post<PurchaseOrder>(`/purchasing/requisitions/${id}/convert`, { supplierId })
  },

  // Supplier Invoices
  async getSupplierInvoices(params?: QueryParams & { supplierId?: string; status?: string }) {
    return ApiService.get<PaginatedResponse<any>>('/purchasing/supplier-invoices', { params })
  },

  async createSupplierInvoice(invoiceData: any) {
    return ApiService.post('/purchasing/supplier-invoices', invoiceData)
  },

  async approveSupplierInvoice(id: string, comment?: string) {
    return ApiService.post(`/purchasing/supplier-invoices/${id}/approve`, { comment })
  },

  async paySupplierInvoice(id: string, paymentData: {
    amount: number
    method: string
    reference?: string
    paidDate?: Date
  }) {
    return ApiService.post(`/purchasing/supplier-invoices/${id}/pay`, paymentData)
  },

  // Reports
  async getPurchasingReport(params: {
    startDate?: Date
    endDate?: Date
    supplierId?: string
    format?: 'json' | 'csv' | 'pdf'
  }) {
    if (params.format && params.format !== 'json') {
      return ApiService.downloadFile('/purchasing/reports', `purchasing-report.${params.format}`)
    }
    return ApiService.get('/purchasing/reports', { params })
  },

  async getSupplierPerformanceReport(params?: {
    startDate?: Date
    endDate?: Date
    supplierId?: string
  }) {
    return ApiService.get<Array<{
      supplier: Supplier
      totalOrders: number
      totalValue: number
      averageDeliveryTime: number
      onTimeDeliveryRate: number
      qualityRating: number
    }>>('/purchasing/reports/supplier-performance', { params })
  },

  async getPurchaseAnalytics(params: {
    period: 'week' | 'month' | 'quarter' | 'year'
    startDate?: Date
    endDate?: Date
  }) {
    return ApiService.get<{
      totalPurchases: number
      totalOrders: number
      averageOrderValue: number
      topSuppliers: Array<{
        supplier: Supplier
        orderCount: number
        totalValue: number
        percentage: number
      }>
      purchasesByCategory: Array<{
        category: string
        amount: number
        percentage: number
      }>
      monthlyTrend: Array<{
        month: string
        amount: number
        orderCount: number
      }>
    }>('/purchasing/analytics', { params })
  },

  // Price management
  async getSupplierPrices(params?: {
    supplierId?: string
    productId?: string
  }) {
    return ApiService.get<Array<{
      supplier: Supplier
      product: any
      price: number
      currency: string
      validFrom: Date
      validTo?: Date
      minimumOrderQuantity?: number
    }>>('/purchasing/supplier-prices', { params })
  },

  async updateSupplierPrice(data: {
    supplierId: string
    productId: string
    price: number
    currency: string
    validFrom: Date
    validTo?: Date
    minimumOrderQuantity?: number
  }) {
    return ApiService.post('/purchasing/supplier-prices', data)
  },
}