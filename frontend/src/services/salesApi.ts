import { ApiService } from './api'
import type { Customer, CustomerType, PriceLevel, SalesOrder, Invoice, Payment, PaginatedResponse, QueryParams } from '@/types'

interface CustomerQueryParams extends QueryParams {
  type?: CustomerType;
  priceLevel?: PriceLevel;
}

interface CustomerSummary {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

export const salesApi = {
  // Customers
  async getCustomers(params?: CustomerQueryParams) {
    return ApiService.get<PaginatedResponse<Customer>>('customers', { params })
  },

  async getCustomer(id: string) {
    return ApiService.get<Customer>(`customers/${id}`)
  },

  
  async getCustomerSummaries() {
    return ApiService.get<CustomerSummary[]>('customers/summary')
  },

  async createCustomer(customerData: Partial<Customer>) {
    return ApiService.post<Customer>('customers', customerData)
  },

  async updateCustomer(id: string, customerData: Partial<Customer>) {
    return ApiService.put<Customer>(`customers/${id}`, customerData)
  },

  async deleteCustomer(id: string) {
    return ApiService.delete(`customers/${id}`)
  },


  async getCustomerSalesHistory(id: string, limit?: number) {
    return ApiService.get(`customers/${id}/sales-history`, { params: { limit } })
  },

  async getOutstandingInvoices(id: string) {
    return ApiService.get(`customers/${id}/outstanding-invoices`)
  },

  async getCustomerStatistics(id: string) {
    return ApiService.get(`customers/${id}/statistics`)
  },

  async getDeletedCustomers(params?: CustomerQueryParams) {
    return ApiService.get<PaginatedResponse<Customer>>('customers/deleted', { params })
  },

  async restoreCustomer(id: string) {
    return ApiService.post<Customer>(`customers/${id}/restore`)
  },

  async bulkRestoreCustomers(customerIds: string[]) {
    return ApiService.post<{ message: string; restoredCount: number; failedIds: string[] }>('customers/bulk-restore', { customerIds })
  },

  async permanentDeleteCustomer(id: string) {
    return ApiService.delete(`customers/${id}/permanent`)
  },

  async bulkPermanentDeleteCustomers(customerIds: string[]) {
    return ApiService.post<{ message: string; deletedCount: number; failedIds: string[] }>('customers/bulk-permanent-delete', { customerIds })
  },

  // Sales Orders - Updated to match backend controller routes
  async getOrders(params?: QueryParams & { 
    customerId?: string; 
    status?: string; 
    priority?: string;
    fromDate?: string;
    toDate?: string;
    overdue?: boolean;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }) {
    return ApiService.get<PaginatedResponse<SalesOrder>>('sales-orders', { params })
  },

  async getOrder(id: string) {
    return ApiService.get<SalesOrder>(`sales-orders/${id}`)
  },

  async getOrderByNumber(orderNumber: string) {
    return ApiService.get<SalesOrder>(`sales-orders/number/${orderNumber}`)
  },

  async createOrder(orderData: Partial<SalesOrder>) {
    return ApiService.post<SalesOrder>('sales-orders', orderData)
  },

  async updateOrder(id: string, orderData: Partial<SalesOrder>) {
    return ApiService.put<SalesOrder>(`sales-orders/${id}`, orderData)
  },

  async deleteOrder(id: string) {
    return ApiService.delete(`sales-orders/${id}`)
  },

  async confirmOrder(id: string) {
    return ApiService.put<SalesOrder>(`sales-orders/${id}/confirm`)
  },

  async shipOrder(id: string, data: { trackingNumber?: string; shippingMethod?: string; notes?: string }) {
    return ApiService.put<SalesOrder>(`sales-orders/${id}/ship`, data)
  },

  async deliverOrder(id: string) {
    return ApiService.put<SalesOrder>(`sales-orders/${id}/deliver`)
  },

  async completeOrder(id: string) {
    return ApiService.put<SalesOrder>(`sales-orders/${id}/complete`)
  },

  async cancelOrder(id: string, reason?: string) {
    return ApiService.put<SalesOrder>(`sales-orders/${id}/cancel`, { reason })
  },

  async duplicateOrder(id: string) {
    return ApiService.post<SalesOrder>(`sales-orders/${id}/duplicate`)
  },

  async getOrderSummaries() {
    return ApiService.get('sales-orders/summary')
  },

  async getDashboardStats() {
    return ApiService.get('sales-orders/dashboard-stats')
  },

  async getFulfillmentStatus(id: string) {
    return ApiService.get(`sales-orders/${id}/fulfillment-status`)
  },

  async getOrdersByCustomer(customerId: string, limit?: number) {
    return ApiService.get(`sales-orders/customer/${customerId}`, { params: { limit } })
  },

  async getOrderInvoices(id: string) {
    return ApiService.get(`sales-orders/${id}/invoices`)
  },

  async createInvoiceFromOrder(id: string) {
    return ApiService.post(`sales-orders/${id}/create-invoice`)
  },

  async getDeletedOrders(params?: QueryParams & {
    customerId?: string;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }) {
    return ApiService.get<PaginatedResponse<SalesOrder>>('sales-orders/deleted', { params })
  },

  async restoreOrder(id: string) {
    return ApiService.post<SalesOrder>(`sales-orders/${id}/restore`)
  },

  async bulkRestoreOrders(orderIds: string[]) {
    return ApiService.post<{ restoredCount: number; failedIds: string[] }>('sales-orders/bulk-restore', { salesOrderIds: orderIds })
  },

  async permanentDeleteOrder(id: string) {
    return ApiService.delete(`sales-orders/${id}/permanent`)
  },

  async bulkDeleteOrders(orderIds: string[]) {
    return ApiService.post<{ deletedCount: number; failedIds: string[] }>('sales-orders/bulk-permanent-delete', { salesOrderIds: orderIds })
  },

  // Invoices
  async getInvoices(params?: QueryParams & { customerId?: string; status?: string }) {
    return ApiService.get<PaginatedResponse<Invoice>>('invoices', { params })
  },

  async getInvoice(id: string) {
    return ApiService.get<Invoice>(`invoices/${id}`)
  },

  async createInvoice(invoiceData: Partial<Invoice>) {
    return ApiService.post<Invoice>('invoices', invoiceData)
  },

  async updateInvoice(id: string, invoiceData: Partial<Invoice>) {
    return ApiService.put<Invoice>(`invoices/${id}`, invoiceData)
  },

  async deleteInvoice(id: string) {
    return ApiService.delete(`invoices/${id}`)
  },

  async getDeletedInvoices(params?: QueryParams) {
    return ApiService.get<PaginatedResponse<Invoice>>('invoices/deleted', { params })
  },

  async restoreInvoice(id: string) {
    return ApiService.post<Invoice>(`invoices/${id}/restore`)
  },

  async bulkRestoreInvoices(invoiceIds: string[]) {
    return ApiService.post('invoices/bulk-restore', { invoiceIds })
  },

  async sendInvoice(id: string, options?: {
    email?: string
    subject?: string
    message?: string
  }) {
    return ApiService.post(`invoices/${id}/send`, options)
  },

  async printInvoice(id: string) {
    return ApiService.downloadFile(`invoices/${id}/print`, `invoice-${id}.pdf`)
  },

  async markInvoiceAsPaid(id: string, paymentData?: {
    amount: number
    method: string
    reference?: string
    paidDate?: Date
  }) {
    return ApiService.post<Invoice>(`invoices/${id}/mark-paid`, paymentData)
  },

  // Payments
  async getPayments(params?: QueryParams & { customerId?: string; invoiceId?: string }) {
    return ApiService.get<PaginatedResponse<Payment>>('payments', { params })
  },

  async getPayment(id: string) {
    return ApiService.get<Payment>(`payments/${id}`)
  },

  async recordPayment(paymentData: Partial<Payment>) {
    return ApiService.post<Payment>('payments', paymentData)
  },

  async updatePayment(id: string, paymentData: Partial<Payment>) {
    return ApiService.put<Payment>(`payments/${id}`, paymentData)
  },

  async deletePayment(id: string) {
    return ApiService.delete(`payments/${id}`)
  },

  async voidPayment(id: string, reason?: string) {
    return ApiService.post<Payment>(`payments/${id}/void`, { reason })
  },

  async getDeletedPayments(params?: QueryParams) {
    return ApiService.get<PaginatedResponse<Payment>>('payments/deleted', { params })
  },

  async restorePayment(id: string) {
    return ApiService.post<Payment>(`payments/${id}/restore`)
  },

  async bulkRestorePayments(paymentIds: string[]) {
    return ApiService.post('payments/bulk-restore', { paymentIds })
  },


  // Reports
  async getSalesReport(params: {
    startDate?: Date
    endDate?: Date
    customerId?: string
    productId?: string
    groupBy?: 'day' | 'week' | 'month'
    format?: 'json' | 'csv' | 'pdf'
  }) {
    if (params.format && params.format !== 'json') {
      return ApiService.downloadFile('/sales/reports', `sales-report.${params.format}`)
    }
    return ApiService.get('/sales/reports', { params })
  },

  async getTopCustomersReport(params?: {
    limit?: number
    period?: 'month' | 'quarter' | 'year'
  }) {
    return ApiService.get<Array<{
      customer: Customer
      totalOrders: number
      totalRevenue: number
      averageOrderValue: number
    }>>('/sales/reports/top-customers', { params })
  },

  async getProductPerformanceReport(params?: {
    startDate?: Date
    endDate?: Date
    limit?: number
  }) {
    return ApiService.get<Array<{
      productId: string
      productName: string
      quantitySold: number
      revenue: number
      profit: number
      margin: number
    }>>('/sales/reports/product-performance', { params })
  },

  // Analytics
  async getSalesAnalytics(params: {
    period: 'week' | 'month' | 'quarter' | 'year'
    startDate?: Date
    endDate?: Date
  }) {
    return ApiService.get<{
      totalRevenue: number
      totalOrders: number
      averageOrderValue: number
      conversionRate: number
      topProducts: Array<{
        productId: string
        productName: string
        revenue: number
        quantity: number
      }>
      revenueChart: {
        labels: string[]
        data: number[]
      }
      ordersByStatus: Array<{
        status: string
        count: number
        percentage: number
      }>
    }>('/sales/analytics', { params })
  },
}