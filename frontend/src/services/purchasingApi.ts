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
    return ApiService.put<Supplier>(`/purchasing/suppliers/${id}`, supplierData)
  },

  async deleteSupplier(id: string) {
    return ApiService.delete(`/purchasing/suppliers/${id}`)
  },

  async getSupplierProducts(id: string, params?: QueryParams) {
    return ApiService.get<PaginatedResponse<any>>(`/purchasing/suppliers/${id}/products`, { params })
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
    return ApiService.get<PaginatedResponse<GoodsReceivedNote>>('/purchasing/grn', { params })
  },

  async getGoodsReceivedNote(id: string) {
    return ApiService.get<GoodsReceivedNote>(`/purchasing/grn/${id}`)
  },

  async createGoodsReceivedNote(grnData: Partial<GoodsReceivedNote>) {
    return ApiService.post<GoodsReceivedNote>('/purchasing/grn', grnData)
  },

  async updateGoodsReceivedNote(id: string, grnData: Partial<GoodsReceivedNote>) {
    return ApiService.put<GoodsReceivedNote>(`/purchasing/grn/${id}`, grnData)
  },

  async deleteGoodsReceivedNote(id: string) {
    return ApiService.delete(`/purchasing/grn/${id}`)
  },

  async receiveGoods(purchaseOrderId: string, items: Array<{
    productId: string
    receivedQuantity: number
    damagedQuantity?: number
    notes?: string
  }>) {
    return ApiService.post<GoodsReceivedNote>(`/purchasing/orders/${purchaseOrderId}/receive`, {
      items,
    })
  },

  async printGoodsReceivedNote(id: string) {
    return ApiService.downloadFile(`/purchasing/grn/${id}/print`, `grn-${id}.pdf`)
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