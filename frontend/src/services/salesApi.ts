import { ApiService } from './api'
import type { Customer, SalesOrder, Invoice, Payment, PaginatedResponse, QueryParams } from '@/types'

export const salesApi = {
  // Customers
  async getCustomers(params?: QueryParams) {
    return ApiService.get<PaginatedResponse<Customer>>('/sales/customers', { params })
  },

  async getCustomer(id: string) {
    return ApiService.get<Customer>(`/sales/customers/${id}`)
  },

  async createCustomer(customerData: Partial<Customer>) {
    return ApiService.post<Customer>('/sales/customers', customerData)
  },

  async updateCustomer(id: string, customerData: Partial<Customer>) {
    return ApiService.put<Customer>(`/sales/customers/${id}`, customerData)
  },

  async deleteCustomer(id: string) {
    return ApiService.delete(`/sales/customers/${id}`)
  },

  async getCustomerBalance(id: string) {
    return ApiService.get<{
      totalInvoiced: number
      totalPaid: number
      balance: number
      creditLimit: number
      availableCredit: number
    }>(`/sales/customers/${id}/balance`)
  },

  async getCustomerStatement(id: string, params: {
    startDate?: Date
    endDate?: Date
    format?: 'json' | 'pdf'
  }) {
    if (params.format === 'pdf') {
      return ApiService.downloadFile(`/sales/customers/${id}/statement`, `customer-statement.pdf`)
    }
    return ApiService.get(`/sales/customers/${id}/statement`, { params })
  },

  // Sales Orders
  async getOrders(params?: QueryParams & { customerId?: string; status?: string }) {
    return ApiService.get<PaginatedResponse<SalesOrder>>('/sales/orders', { params })
  },

  async getOrder(id: string) {
    return ApiService.get<SalesOrder>(`/sales/orders/${id}`)
  },

  async createOrder(orderData: Partial<SalesOrder>) {
    return ApiService.post<SalesOrder>('/sales/orders', orderData)
  },

  async updateOrder(id: string, orderData: Partial<SalesOrder>) {
    return ApiService.put<SalesOrder>(`/sales/orders/${id}`, orderData)
  },

  async deleteOrder(id: string) {
    return ApiService.delete(`/sales/orders/${id}`)
  },

  async confirmOrder(id: string) {
    return ApiService.post<SalesOrder>(`/sales/orders/${id}/confirm`)
  },

  async cancelOrder(id: string, reason?: string) {
    return ApiService.post<SalesOrder>(`/sales/orders/${id}/cancel`, { reason })
  },

  async printOrder(id: string) {
    return ApiService.downloadFile(`/sales/orders/${id}/print`, `order-${id}.pdf`)
  },

  // Invoices
  async getInvoices(params?: QueryParams & { customerId?: string; status?: string }) {
    return ApiService.get<PaginatedResponse<Invoice>>('/sales/invoices', { params })
  },

  async getInvoice(id: string) {
    return ApiService.get<Invoice>(`/sales/invoices/${id}`)
  },

  async createInvoice(invoiceData: Partial<Invoice>) {
    return ApiService.post<Invoice>('/sales/invoices', invoiceData)
  },

  async updateInvoice(id: string, invoiceData: Partial<Invoice>) {
    return ApiService.put<Invoice>(`/sales/invoices/${id}`, invoiceData)
  },

  async deleteInvoice(id: string) {
    return ApiService.delete(`/sales/invoices/${id}`)
  },

  async sendInvoice(id: string, options?: {
    email?: string
    subject?: string
    message?: string
  }) {
    return ApiService.post(`/sales/invoices/${id}/send`, options)
  },

  async printInvoice(id: string) {
    return ApiService.downloadFile(`/sales/invoices/${id}/print`, `invoice-${id}.pdf`)
  },

  async markInvoiceAsPaid(id: string, paymentData?: {
    amount: number
    method: string
    reference?: string
    paidDate?: Date
  }) {
    return ApiService.post<Invoice>(`/sales/invoices/${id}/mark-paid`, paymentData)
  },

  // Payments
  async getPayments(params?: QueryParams & { customerId?: string; invoiceId?: string }) {
    return ApiService.get<PaginatedResponse<Payment>>('/sales/payments', { params })
  },

  async getPayment(id: string) {
    return ApiService.get<Payment>(`/sales/payments/${id}`)
  },

  async recordPayment(paymentData: Partial<Payment>) {
    return ApiService.post<Payment>('/sales/payments', paymentData)
  },

  async updatePayment(id: string, paymentData: Partial<Payment>) {
    return ApiService.put<Payment>(`/sales/payments/${id}`, paymentData)
  },

  async deletePayment(id: string) {
    return ApiService.delete(`/sales/payments/${id}`)
  },

  async voidPayment(id: string, reason?: string) {
    return ApiService.post<Payment>(`/sales/payments/${id}/void`, { reason })
  },

  // Quotations/Estimates
  async getQuotations(params?: QueryParams & { customerId?: string; status?: string }) {
    return ApiService.get<PaginatedResponse<any>>('/sales/quotations', { params })
  },

  async createQuotation(quotationData: any) {
    return ApiService.post('/sales/quotations', quotationData)
  },

  async convertQuotationToOrder(id: string) {
    return ApiService.post<SalesOrder>(`/sales/quotations/${id}/convert`)
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