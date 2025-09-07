import { ApiService } from './api'
import type { Customer, CustomerType, CustomerStatus, PriceLevel, SalesOrder, Invoice, Payment, PaginatedResponse, QueryParams } from '@/types'

interface CustomerQueryParams extends QueryParams {
  type?: CustomerType;
  status?: CustomerStatus;
  priceLevel?: PriceLevel;
}

interface CustomerSummary {
  id: string;
  customerCode: string;
  name: string;
  email?: string;
  phone?: string;
  status: CustomerStatus;
  currentBalance: number;
  creditLimit: number;
  availableCredit: number;
}

interface CreditCheckRequest {
  customerId: string;
  amount: number;
}

interface CreditCheckResponse {
  approved: boolean;
  creditLimit: number;
  currentBalance: number;
  availableCredit: number;
  requestedAmount: number;
  remainingCreditAfterPurchase: number;
  message?: string;
}

export const salesApi = {
  // Customers
  async getCustomers(params?: CustomerQueryParams) {
    return ApiService.get<PaginatedResponse<Customer>>('customers', { params })
  },

  async getCustomer(id: string) {
    return ApiService.get<Customer>(`customers/${id}`)
  },

  async getCustomerByCode(customerCode: string) {
    return ApiService.get<Customer>(`customers/code/${customerCode}`)
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

  async checkCredit(data: CreditCheckRequest) {
    return ApiService.post<CreditCheckResponse>('customers/credit-check', data)
  },

  async updateCreditLimit(id: string, creditLimit: number) {
    return ApiService.put<Customer>(`customers/${id}/credit-limit`, { creditLimit })
  },

  async activateCustomer(id: string) {
    return ApiService.put<Customer>(`customers/${id}/activate`)
  },

  async deactivateCustomer(id: string) {
    return ApiService.put<Customer>(`customers/${id}/deactivate`)
  },

  async suspendCustomer(id: string, reason?: string) {
    return ApiService.put<Customer>(`customers/${id}/suspend`, { reason })
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