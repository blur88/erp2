import { createApi } from '@reduxjs/toolkit/query/react'

import type { Customer, Invoice, PaginatedResponse, Payment, SalesOrder, SalesOrderPayment } from '@/types'

import { axiosBaseQuery } from './baseQuery'
import { normalizeSingle } from './normalizers'

export interface SalesOrderItem {
  id: string
  orderNumber: string
  orderDate: string
  isFulfilled: boolean
  isPaid: boolean
  totalAmount: number
  itemsCount: number
}

export interface OutstandingInvoice {
  id: string
  invoiceNumber: string
  invoiceDate: string
  totalAmount: number
  paidAmount: number
  balanceDue: number
  salesOrderId: string | null
}

const defaultMeta = {
  total: 0,
  page: undefined as number | undefined,
  limit: undefined as number | undefined,
}

function normalizeNamedCollection<T>(
  response: any,
  key: 'customers' | 'orders' | 'invoices' | 'payments' | 'data',
): PaginatedResponse<T> {
  if (!response) {
    return { data: [], meta: defaultMeta }
  }

  if (Array.isArray(response)) {
    return {
      data: response,
      meta: { total: response.length },
    }
  }

  const data = response[key] ?? response.data ?? []
  const meta = {
    total: response.meta?.total ?? response.total ?? (Array.isArray(data) ? data.length : 0),
    page: response.meta?.page as number | undefined,
    limit: response.meta?.limit as number | undefined,
  }

  return {
    data: Array.isArray(data) ? data : [],
    meta,
  }
}

function withNormalizedSortOrder(params?: Record<string, unknown>) {
  if (!params) {
    return {}
  }

  if (typeof params.sortOrder !== 'string') {
    return params
  }

  return {
    ...params,
    sortOrder: params.sortOrder.toUpperCase(),
  }
}

export const salesApiSlice = createApi({
  reducerPath: 'salesApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: [
    'Customer',
    'DeletedCustomer',
    'SalesOrder',
    'DeletedSalesOrder',
    'Invoice',
    'DeletedInvoice',
    'Payment',
    'DeletedPayment',
  ],
  endpoints: (builder) => ({
    getCustomers: builder.query<PaginatedResponse<Customer>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/customers', params: params ?? {} }),
      transformResponse: (response: any) => normalizeNamedCollection<Customer>(response, 'customers'),
      providesTags: ['Customer'],
    }),
    getCustomer: builder.query<Customer, string>({
      query: (id) => ({ url: `/customers/${id}` }),
      transformResponse: normalizeSingle<Customer>,
      providesTags: (_result, _error, id) => [{ type: 'Customer', id }],
    }),
    getCustomerBySlug: builder.query<Customer, string>({
      query: (slug) => ({ url: `/customers/slug/${slug}` }),
      transformResponse: normalizeSingle<Customer>,
      providesTags: (result) => result ? [{ type: 'Customer', id: result.id }] : [],
    }),
    createCustomer: builder.mutation<Customer, Partial<Customer>>({
      query: (body) => ({ url: '/customers', method: 'POST', data: body }),
      transformResponse: normalizeSingle<Customer>,
      invalidatesTags: ['Customer', 'SalesOrder', 'Invoice', 'Payment'],
    }),
    updateCustomer: builder.mutation<Customer, { id: string; data: Partial<Customer> }>({
      query: ({ id, data }) => ({ url: `/customers/${id}`, method: 'PUT', data }),
      transformResponse: normalizeSingle<Customer>,
      invalidatesTags: ['Customer', 'SalesOrder', 'Invoice', 'Payment'],
    }),
    deleteCustomer: builder.mutation<void, string>({
      query: (id) => ({ url: `/customers/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Customer', 'DeletedCustomer', 'SalesOrder', 'Invoice', 'Payment'],
    }),
    getDeletedCustomers: builder.query<PaginatedResponse<Customer>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/customers/deleted', params: params ?? {} }),
      transformResponse: (response: any) => normalizeNamedCollection<Customer>(response, 'customers'),
      providesTags: ['DeletedCustomer'],
    }),
    restoreCustomer: builder.mutation<Customer, string>({
      query: (id) => ({ url: `/customers/${id}/restore`, method: 'POST' }),
      transformResponse: normalizeSingle<Customer>,
      invalidatesTags: ['Customer', 'DeletedCustomer', 'SalesOrder', 'Invoice', 'Payment'],
    }),
    bulkRestoreCustomers: builder.mutation<{ restoredCount: number; failedIds: string[] }, string[]>({
      query: (customerIds) => ({ url: '/customers/bulk-restore', method: 'POST', data: { customerIds } }),
      invalidatesTags: ['Customer', 'DeletedCustomer', 'SalesOrder', 'Invoice', 'Payment'],
    }),
    permanentDeleteCustomer: builder.mutation<void, string>({
      query: (id) => ({ url: `/customers/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: ['DeletedCustomer'],
    }),
    bulkPermanentDeleteCustomers: builder.mutation<{ deletedCount: number; failedIds: string[] }, string[]>({
      query: (customerIds) => ({
        url: '/customers/bulk-permanent-delete',
        method: 'POST',
        data: { customerIds },
      }),
      invalidatesTags: ['DeletedCustomer'],
    }),

    getSalesOrders: builder.query<PaginatedResponse<SalesOrder>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/sales-orders', params: withNormalizedSortOrder(params) }),
      transformResponse: (response: any) => normalizeNamedCollection<SalesOrder>(response, 'orders'),
      providesTags: ['SalesOrder'],
    }),
    getSalesOrder: builder.query<SalesOrder, string>({
      query: (id) => ({ url: `/sales-orders/${id}` }),
      transformResponse: normalizeSingle<SalesOrder>,
      providesTags: (_result, _error, id) => [{ type: 'SalesOrder', id }],
    }),
    getSalesOrderByNumber: builder.query<SalesOrder, string>({
      query: (orderNumber) => ({ url: `/sales-orders/number/${orderNumber}` }),
      transformResponse: normalizeSingle<SalesOrder>,
      providesTags: (result) => result ? [{ type: 'SalesOrder', id: result.id }] : [],
    }),
    getSalesOrderPayments: builder.query<SalesOrderPayment[], string>({
      query: (id) => ({ url: `/sales-orders/${id}/payments` }),
      transformResponse: (response: any) => response.data ?? [],
      providesTags: (_result, _error, id) => ['SalesOrder', 'Payment', { type: 'SalesOrder', id }],
    }),
    createSalesOrder: builder.mutation<SalesOrder, Partial<SalesOrder>>({
      query: (body) => ({ url: '/sales-orders', method: 'POST', data: body }),
      transformResponse: normalizeSingle<SalesOrder>,
      invalidatesTags: ['SalesOrder', 'Invoice', 'Payment'],
    }),
    updateSalesOrder: builder.mutation<SalesOrder, { id: string; data: Partial<SalesOrder> }>({
      query: ({ id, data }) => ({ url: `/sales-orders/${id}`, method: 'PUT', data }),
      transformResponse: normalizeSingle<SalesOrder>,
      invalidatesTags: ['SalesOrder', 'Invoice', 'Payment'],
    }),
    deleteSalesOrder: builder.mutation<
      { data?: SalesOrder | null; message?: string; deletedOrderNumber?: string; redirect?: string },
      string
    >({
      query: (id) => ({ url: `/sales-orders/${id}`, method: 'DELETE' }),
      invalidatesTags: ['SalesOrder', 'DeletedSalesOrder', 'Invoice', 'Payment'],
    }),
    confirmSalesOrder: builder.mutation<SalesOrder, string>({
      query: (id) => ({ url: `/sales-orders/${id}/confirm`, method: 'PUT' }),
      transformResponse: normalizeSingle<SalesOrder>,
      invalidatesTags: ['SalesOrder'],
    }),
    shipSalesOrder: builder.mutation<
      SalesOrder,
      { id: string; data?: { trackingNumber?: string; shippingMethod?: string; notes?: string } }
    >({
      query: ({ id, data }) => ({ url: `/sales-orders/${id}/ship`, method: 'PUT', data: data ?? {} }),
      transformResponse: normalizeSingle<SalesOrder>,
      invalidatesTags: ['SalesOrder'],
    }),
    deliverSalesOrder: builder.mutation<SalesOrder, string>({
      query: (id) => ({ url: `/sales-orders/${id}/deliver`, method: 'PUT' }),
      transformResponse: normalizeSingle<SalesOrder>,
      invalidatesTags: ['SalesOrder'],
    }),
    completeSalesOrder: builder.mutation<SalesOrder, string>({
      query: (id) => ({ url: `/sales-orders/${id}/complete`, method: 'PUT' }),
      transformResponse: normalizeSingle<SalesOrder>,
      invalidatesTags: ['SalesOrder'],
    }),
    cancelSalesOrder: builder.mutation<SalesOrder, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({ url: `/sales-orders/${id}/cancel`, method: 'PUT', data: { reason } }),
      transformResponse: normalizeSingle<SalesOrder>,
      invalidatesTags: ['SalesOrder'],
    }),
    duplicateSalesOrder: builder.mutation<SalesOrder, string>({
      query: (id) => ({ url: `/sales-orders/${id}/duplicate`, method: 'POST' }),
      transformResponse: normalizeSingle<SalesOrder>,
      invalidatesTags: ['SalesOrder'],
    }),
    recordOrderPayment: builder.mutation<SalesOrder, { id: string; amount: number; paymentMethodId?: string }>({
      query: ({ id, amount, paymentMethodId }) => ({
        url: `/sales-orders/${id}/record-payment`,
        method: 'POST',
        data: { amount, paymentMethodId },
      }),
      transformResponse: (response: any) => normalizeSingle<SalesOrder>(response?.data ?? response),
      invalidatesTags: ['SalesOrder', 'Invoice', 'Payment'],
    }),
    recordOrderPayments: builder.mutation<
      SalesOrder,
      { id: string; payments: { paymentMethodId: string; amount: number; reference?: string }[] }
    >({
      query: ({ id, payments }) => ({
        url: `/sales-orders/${id}/record-payments`,
        method: 'POST',
        data: { payments },
      }),
      transformResponse: (response: any) => normalizeSingle<SalesOrder>(response?.data ?? response),
      invalidatesTags: ['SalesOrder', 'Invoice', 'Payment'],
    }),
    recordOrderRefunds: builder.mutation<
      SalesOrder,
      { id: string; refunds: { paymentMethodId: string; amount: number; reference?: string }[] }
    >({
      query: ({ id, refunds }) => ({
        url: `/sales-orders/${id}/refunds`,
        method: 'POST',
        data: { refunds },
      }),
      transformResponse: (response: any) => normalizeSingle<SalesOrder>(response?.data ?? response),
      invalidatesTags: ['SalesOrder', 'Invoice', 'Payment'],
    }),
    unpaySalesOrder: builder.mutation<SalesOrder, string>({
      query: (id) => ({ url: `/sales-orders/${id}/unpay`, method: 'POST' }),
      transformResponse: (response: any) => normalizeSingle<SalesOrder>(response?.data ?? response),
      invalidatesTags: ['SalesOrder', 'Invoice', 'Payment'],
    }),
    fulfillSalesOrder: builder.mutation<SalesOrder, string>({
      query: (id) => ({ url: `/sales-orders/${id}/fulfill-order`, method: 'POST' }),
      transformResponse: (response: any) => normalizeSingle<SalesOrder>(response?.data ?? response),
      invalidatesTags: ['SalesOrder', 'Invoice'],
    }),
    unfulfillSalesOrder: builder.mutation<SalesOrder, string>({
      query: (id) => ({ url: `/sales-orders/${id}/unfulfill-order`, method: 'POST' }),
      transformResponse: (response: any) => normalizeSingle<SalesOrder>(response?.data ?? response),
      invalidatesTags: ['SalesOrder', 'Invoice'],
    }),
    getDeletedSalesOrders: builder.query<PaginatedResponse<SalesOrder>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/sales-orders/deleted', params: withNormalizedSortOrder(params) }),
      transformResponse: (response: any) => normalizeNamedCollection<SalesOrder>(response, 'orders'),
      providesTags: ['DeletedSalesOrder'],
    }),
    restoreSalesOrder: builder.mutation<SalesOrder, string>({
      query: (id) => ({ url: `/sales-orders/${id}/restore`, method: 'POST' }),
      transformResponse: normalizeSingle<SalesOrder>,
      invalidatesTags: ['SalesOrder', 'DeletedSalesOrder'],
    }),
    bulkRestoreSalesOrders: builder.mutation<{ restoredCount: number; failedIds: string[] }, string[]>({
      query: (salesOrderIds) => ({ url: '/sales-orders/bulk-restore', method: 'POST', data: { salesOrderIds } }),
      invalidatesTags: ['SalesOrder', 'DeletedSalesOrder'],
    }),
    permanentDeleteSalesOrder: builder.mutation<void, string>({
      query: (id) => ({ url: `/sales-orders/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: ['DeletedSalesOrder'],
    }),
    bulkPermanentDeleteSalesOrders: builder.mutation<{ deletedCount: number; failedIds: string[] }, string[]>({
      query: (salesOrderIds) => ({
        url: '/sales-orders/bulk-permanent-delete',
        method: 'POST',
        data: { salesOrderIds },
      }),
      invalidatesTags: ['DeletedSalesOrder'],
    }),

    getInvoices: builder.query<PaginatedResponse<Invoice>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/invoices', params: params ?? {} }),
      transformResponse: (response: any) => normalizeNamedCollection<Invoice>(response, 'invoices'),
      providesTags: ['Invoice'],
    }),
    getInvoice: builder.query<Invoice, string>({
      query: (id) => ({ url: `/invoices/${id}` }),
      transformResponse: normalizeSingle<Invoice>,
      providesTags: (_result, _error, id) => [{ type: 'Invoice', id }],
    }),
    updateInvoice: builder.mutation<Invoice, { id: string; data: Partial<Invoice> }>({
      query: ({ id, data }) => ({ url: `/invoices/${id}`, method: 'PUT', data }),
      transformResponse: normalizeSingle<Invoice>,
      invalidatesTags: ['Invoice'],
    }),
    deleteInvoice: builder.mutation<void, string>({
      query: (id) => ({ url: `/invoices/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Invoice', 'DeletedInvoice'],
    }),
    getDeletedInvoices: builder.query<PaginatedResponse<Invoice>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/invoices/deleted', params: params ?? {} }),
      transformResponse: (response: any) => normalizeNamedCollection<Invoice>(response, 'invoices'),
      providesTags: ['DeletedInvoice'],
    }),
    restoreInvoice: builder.mutation<Invoice, string>({
      query: (id) => ({ url: `/invoices/${id}/restore`, method: 'POST' }),
      transformResponse: normalizeSingle<Invoice>,
      invalidatesTags: ['Invoice', 'DeletedInvoice'],
    }),
    bulkRestoreInvoices: builder.mutation<{ restoredCount: number; failedIds: string[] }, string[]>({
      query: (invoiceIds) => ({ url: '/invoices/bulk-restore', method: 'POST', data: { invoiceIds } }),
      invalidatesTags: ['Invoice', 'DeletedInvoice'],
    }),
    markInvoiceAsPaid: builder.mutation<
      Invoice,
      { id: string; data?: { amount: number; method: string; reference?: string; paidDate?: Date } }
    >({
      query: ({ id, data }) => ({ url: `/invoices/${id}/mark-paid`, method: 'POST', data }),
      transformResponse: normalizeSingle<Invoice>,
      invalidatesTags: ['Invoice', 'Payment'],
    }),

    getPayments: builder.query<PaginatedResponse<Payment>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/payments', params: params ?? {} }),
      transformResponse: (response: any) => normalizeNamedCollection<Payment>(response, 'payments'),
      providesTags: ['Payment'],
    }),
    getPayment: builder.query<Payment, string>({
      query: (id) => ({ url: `/payments/${id}` }),
      transformResponse: normalizeSingle<Payment>,
      providesTags: (_result, _error, id) => [{ type: 'Payment', id }],
    }),
    createPayment: builder.mutation<Payment, Partial<Payment>>({
      query: (body) => ({ url: '/payments', method: 'POST', data: body }),
      transformResponse: normalizeSingle<Payment>,
      invalidatesTags: ['Payment', 'Invoice', 'SalesOrder'],
    }),
    updatePayment: builder.mutation<Payment, { id: string; data: Partial<Payment> }>({
      query: ({ id, data }) => ({ url: `/payments/${id}`, method: 'PUT', data }),
      transformResponse: normalizeSingle<Payment>,
      invalidatesTags: ['Payment', 'Invoice', 'SalesOrder'],
    }),
    deletePayment: builder.mutation<void, string>({
      query: (id) => ({ url: `/payments/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Payment', 'DeletedPayment', 'Invoice', 'SalesOrder'],
    }),
    voidPayment: builder.mutation<Payment, { id: string; reason?: string }>({
      query: ({ id, reason }) => ({ url: `/payments/${id}/void`, method: 'POST', data: { reason } }),
      transformResponse: normalizeSingle<Payment>,
      invalidatesTags: ['Payment', 'Invoice', 'SalesOrder'],
    }),
    getDeletedPayments: builder.query<PaginatedResponse<Payment>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/payments/deleted', params: params ?? {} }),
      transformResponse: (response: any) => normalizeNamedCollection<Payment>(response, 'payments'),
      providesTags: ['DeletedPayment'],
    }),
    restorePayment: builder.mutation<Payment, string>({
      query: (id) => ({ url: `/payments/${id}/restore`, method: 'POST' }),
      transformResponse: normalizeSingle<Payment>,
      invalidatesTags: ['Payment', 'DeletedPayment', 'Invoice', 'SalesOrder'],
    }),
    bulkRestorePayments: builder.mutation<{ restoredCount: number; failedIds: string[] }, string[]>({
      query: (paymentIds) => ({ url: '/payments/bulk-restore', method: 'POST', data: { paymentIds } }),
      invalidatesTags: ['Payment', 'DeletedPayment', 'Invoice', 'SalesOrder'],
    }),
    getCustomerPayments: builder.query<Payment[], string>({
      query: (id) => ({ url: `/payments/customer/${id}` }),
      transformResponse: (response: any): Payment[] => {
        if (Array.isArray(response)) return response
        return response?.data ?? []
      },
      providesTags: ['Payment'],
    }),
    getCustomerSalesHistory: builder.query<{ orders: SalesOrderItem[] }, string>({
      query: (id) => ({ url: `/customers/${id}/sales-history` }),
      transformResponse: (response: any) => ({
        orders: response?.orders ?? [],
      }),
      providesTags: (_result, _error, id) => [{ type: 'Customer', id }, 'SalesOrder'],
    }),
    getCustomerOutstandingInvoices: builder.query<{ invoices: OutstandingInvoice[]; totalOutstanding: number }, string>({
      query: (id) => ({ url: `/customers/${id}/outstanding-invoices` }),
      transformResponse: (response: any) => {
        const data = response?.data ?? response
        return {
          invoices: data?.invoices ?? [],
          totalOutstanding: data?.totalOutstanding ?? 0,
        }
      },
      providesTags: (_result, _error, id) => [{ type: 'Customer', id }, 'Invoice'],
    }),
  }),
})

export const {
  useGetCustomersQuery,
  useGetCustomerQuery,
  useGetCustomerBySlugQuery,
  useLazyGetCustomerBySlugQuery,
  useLazyGetCustomerQuery,
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
  useDeleteCustomerMutation,
  useGetDeletedCustomersQuery,
  useRestoreCustomerMutation,
  useBulkRestoreCustomersMutation,
  usePermanentDeleteCustomerMutation,
  useBulkPermanentDeleteCustomersMutation,
  useGetSalesOrdersQuery,
  useGetSalesOrderQuery,
  useGetSalesOrderByNumberQuery,
  useGetSalesOrderPaymentsQuery,
  useLazyGetSalesOrderByNumberQuery,
  useLazyGetSalesOrderQuery,
  useCreateSalesOrderMutation,
  useUpdateSalesOrderMutation,
  useDeleteSalesOrderMutation,
  useConfirmSalesOrderMutation,
  useShipSalesOrderMutation,
  useDeliverSalesOrderMutation,
  useCompleteSalesOrderMutation,
  useCancelSalesOrderMutation,
  useDuplicateSalesOrderMutation,
  useRecordOrderPaymentMutation,
  useRecordOrderPaymentsMutation,
  useRecordOrderRefundsMutation,
  useUnpaySalesOrderMutation,
  useFulfillSalesOrderMutation,
  useUnfulfillSalesOrderMutation,
  useGetDeletedSalesOrdersQuery,
  useRestoreSalesOrderMutation,
  useBulkRestoreSalesOrdersMutation,
  usePermanentDeleteSalesOrderMutation,
  useBulkPermanentDeleteSalesOrdersMutation,
  useGetInvoicesQuery,
  useGetInvoiceQuery,
  useLazyGetInvoiceQuery,
  useUpdateInvoiceMutation,
  useDeleteInvoiceMutation,
  useGetDeletedInvoicesQuery,
  useRestoreInvoiceMutation,
  useBulkRestoreInvoicesMutation,
  useMarkInvoiceAsPaidMutation,
  useGetPaymentsQuery,
  useGetPaymentQuery,
  useLazyGetPaymentQuery,
  useCreatePaymentMutation,
  useUpdatePaymentMutation,
  useDeletePaymentMutation,
  useVoidPaymentMutation,
  useGetDeletedPaymentsQuery,
  useRestorePaymentMutation,
  useBulkRestorePaymentsMutation,
  useGetCustomerPaymentsQuery,
  useGetCustomerSalesHistoryQuery,
  useGetCustomerOutstandingInvoicesQuery,
} = salesApiSlice
