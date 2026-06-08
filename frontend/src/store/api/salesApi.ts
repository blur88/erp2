import { createApi } from '@reduxjs/toolkit/query/react';

import type { Customer, PaginatedResponse, Payment, SalesOrder, SalesOrderPayment } from '@/types';

import { axiosBaseQuery } from './baseQuery';
import { normalizeSingle } from './normalizers';

export interface SalesOrderItem {
  id: string;
  orderNumber: string;
  orderDate: string;
  isFulfilled: boolean;
  isPaid: boolean;
  totalAmount: number;
  itemsCount: number;
}

const defaultMeta = {
  total: 0,
  page: undefined as number | undefined,
  limit: undefined as number | undefined,
};

function normalizeNamedCollection<T>(
  response: any,
  key: 'customers' | 'orders' | 'payments' | 'data',
): PaginatedResponse<T> {
  if (!response) {
    return { data: [], meta: defaultMeta };
  }

  if (Array.isArray(response)) {
    return {
      data: response,
      meta: { total: response.length },
    };
  }

  const data = response[key] ?? response.data ?? [];
  const meta = {
    total: response.meta?.total ?? response.total ?? (Array.isArray(data) ? data.length : 0),
    page: response.meta?.page as number | undefined,
    limit: response.meta?.limit as number | undefined,
  };

  return {
    data: Array.isArray(data) ? data : [],
    meta,
  };
}

function withNormalizedSortOrder(params?: Record<string, unknown>) {
  if (!params) {
    return {};
  }

  if (typeof params.sortOrder !== 'string') {
    return params;
  }

  return {
    ...params,
    sortOrder: params.sortOrder.toUpperCase(),
  };
}

export const salesApiSlice = createApi({
  reducerPath: 'salesApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: [
    'Customer',
    'DeletedCustomer',
    'SalesOrder',
    'DeletedSalesOrder',
    'Payment',
  ],
  endpoints: (builder) => ({
    getCustomers: builder.query<PaginatedResponse<Customer>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/customers', params: params ?? {} }),
      transformResponse: (response: any) =>
        normalizeNamedCollection<Customer>(response, 'customers'),
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
      providesTags: (result) => (result ? [{ type: 'Customer', id: result.id }] : []),
    }),
    createCustomer: builder.mutation<Customer, Partial<Customer>>({
      query: (body) => ({ url: '/customers', method: 'POST', data: body }),
      transformResponse: normalizeSingle<Customer>,
      invalidatesTags: ['Customer', 'SalesOrder', 'Payment'],
    }),
    updateCustomer: builder.mutation<Customer, { id: string; data: Partial<Customer> }>({
      query: ({ id, data }) => ({ url: `/customers/${id}`, method: 'PUT', data }),
      transformResponse: normalizeSingle<Customer>,
      invalidatesTags: ['Customer', 'SalesOrder', 'Payment'],
    }),
    deleteCustomer: builder.mutation<void, string>({
      query: (id) => ({ url: `/customers/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Customer', 'DeletedCustomer', 'SalesOrder', 'Payment'],
    }),
    getDeletedCustomers: builder.query<
      PaginatedResponse<Customer>,
      Record<string, unknown> | undefined
    >({
      query: (params) => ({ url: '/customers/deleted', params: params ?? {} }),
      transformResponse: (response: any) =>
        normalizeNamedCollection<Customer>(response, 'customers'),
      providesTags: ['DeletedCustomer'],
    }),
    restoreCustomer: builder.mutation<Customer, string>({
      query: (id) => ({ url: `/customers/${id}/restore`, method: 'POST' }),
      transformResponse: normalizeSingle<Customer>,
      invalidatesTags: ['Customer', 'DeletedCustomer', 'SalesOrder', 'Payment'],
    }),
    bulkRestoreCustomers: builder.mutation<
      { restoredCount: number; failedIds: string[] },
      string[]
    >({
      query: (customerIds) => ({
        url: '/customers/bulk-restore',
        method: 'POST',
        data: { customerIds },
      }),
      invalidatesTags: ['Customer', 'DeletedCustomer', 'SalesOrder', 'Payment'],
    }),
    permanentDeleteCustomer: builder.mutation<void, string>({
      query: (id) => ({ url: `/customers/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: ['DeletedCustomer'],
    }),
    bulkPermanentDeleteCustomers: builder.mutation<
      { deletedCount: number; failedIds: string[] },
      string[]
    >({
      query: (customerIds) => ({
        url: '/customers/bulk-permanent-delete',
        method: 'POST',
        data: { customerIds },
      }),
      invalidatesTags: ['DeletedCustomer'],
    }),

    getSalesOrders: builder.query<
      PaginatedResponse<SalesOrder>,
      Record<string, unknown> | undefined
    >({
      query: (params) => ({ url: '/sales-orders', params: withNormalizedSortOrder(params) }),
      transformResponse: (response: any) =>
        normalizeNamedCollection<SalesOrder>(response, 'orders'),
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
      providesTags: (result) => (result ? [{ type: 'SalesOrder', id: result.id }] : []),
    }),
    getSalesOrderPayments: builder.query<SalesOrderPayment[], string>({
      query: (id) => ({ url: `/sales-orders/${id}/payments` }),
      transformResponse: (response: any) => response.data ?? [],
      providesTags: (_result, _error, id) => ['SalesOrder', 'Payment', { type: 'SalesOrder', id }],
    }),
    createSalesOrder: builder.mutation<SalesOrder, Partial<SalesOrder>>({
      query: (body) => ({ url: '/sales-orders', method: 'POST', data: body }),
      transformResponse: normalizeSingle<SalesOrder>,
      invalidatesTags: ['SalesOrder', 'Payment'],
    }),
    updateSalesOrder: builder.mutation<SalesOrder, { id: string; data: Partial<SalesOrder> }>({
      query: ({ id, data }) => ({ url: `/sales-orders/${id}`, method: 'PUT', data }),
      transformResponse: normalizeSingle<SalesOrder>,
      invalidatesTags: ['SalesOrder', 'Payment'],
    }),
    deleteSalesOrder: builder.mutation<
      {
        data?: SalesOrder | null;
        message?: string;
        deletedOrderNumber?: string;
        redirect?: string;
      },
      string
    >({
      query: (id) => ({ url: `/sales-orders/${id}`, method: 'DELETE' }),
      invalidatesTags: ['SalesOrder', 'DeletedSalesOrder', 'Payment'],
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
      query: ({ id, data }) => ({
        url: `/sales-orders/${id}/ship`,
        method: 'PUT',
        data: data ?? {},
      }),
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
    cancelSalesOrder: builder.mutation<SalesOrder, { id: string }>({
      query: ({ id }) => ({ url: `/sales-orders/${id}/cancel`, method: 'POST' }),
      transformResponse: normalizeSingle<SalesOrder>,
      invalidatesTags: ['SalesOrder'],
    }),
    uncancelSalesOrder: builder.mutation<SalesOrder, string>({
      query: (id) => ({ url: `/sales-orders/${id}/uncancel`, method: 'POST' }),
      transformResponse: normalizeSingle<SalesOrder>,
      invalidatesTags: ['SalesOrder'],
    }),
    duplicateSalesOrder: builder.mutation<SalesOrder, string>({
      query: (id) => ({ url: `/sales-orders/${id}/duplicate`, method: 'POST' }),
      transformResponse: normalizeSingle<SalesOrder>,
      invalidatesTags: ['SalesOrder'],
    }),
    recordOrderPayments: builder.mutation<
      SalesOrder,
      {
        id: string;
        payments: {
          paymentMethodId: string;
          amount: number;
          paymentDate: string;
          reference?: string;
        }[];
      }
    >({
      query: ({ id, payments }) => ({
        url: `/sales-orders/${id}/payments/batch`,
        method: 'POST',
        data: { payments },
      }),
      transformResponse: (response: any) => normalizeSingle<SalesOrder>(response?.data ?? response),
      invalidatesTags: ['SalesOrder', 'Payment'],
    }),
    recordOrderRefunds: builder.mutation<
      SalesOrder,
      {
        id: string;
        refunds: {
          paymentMethodId: string;
          amount: number;
          paymentDate: string;
          reference?: string;
        }[];
      }
    >({
      query: ({ id, refunds }) => ({
        url: `/sales-orders/${id}/refunds`,
        method: 'POST',
        data: { refunds },
      }),
      transformResponse: (response: any) => normalizeSingle<SalesOrder>(response?.data ?? response),
      invalidatesTags: ['SalesOrder', 'Payment'],
    }),
    unpaySalesOrder: builder.mutation<SalesOrder, string>({
      query: (id) => ({ url: `/sales-orders/${id}/unpay`, method: 'POST' }),
      transformResponse: (response: any) => normalizeSingle<SalesOrder>(response?.data ?? response),
      invalidatesTags: ['SalesOrder', 'Payment'],
    }),
    fulfillSalesOrder: builder.mutation<SalesOrder, string>({
      query: (id) => ({ url: `/sales-orders/${id}/fulfill`, method: 'POST' }),
      transformResponse: (response: any) => normalizeSingle<SalesOrder>(response?.data ?? response),
      invalidatesTags: ['SalesOrder'],
    }),
    unfulfillSalesOrder: builder.mutation<SalesOrder, string>({
      query: (id) => ({ url: `/sales-orders/${id}/unfulfill`, method: 'POST' }),
      transformResponse: (response: any) => normalizeSingle<SalesOrder>(response?.data ?? response),
      invalidatesTags: ['SalesOrder'],
    }),
    getDeletedSalesOrders: builder.query<
      PaginatedResponse<SalesOrder>,
      Record<string, unknown> | undefined
    >({
      query: (params) => ({
        url: '/sales-orders/deleted',
        params: withNormalizedSortOrder(params),
      }),
      transformResponse: (response: any) =>
        normalizeNamedCollection<SalesOrder>(response, 'orders'),
      providesTags: ['DeletedSalesOrder'],
    }),
    restoreSalesOrder: builder.mutation<SalesOrder, string>({
      query: (id) => ({ url: `/sales-orders/${id}/restore`, method: 'POST' }),
      transformResponse: normalizeSingle<SalesOrder>,
      invalidatesTags: ['SalesOrder', 'DeletedSalesOrder'],
    }),
    bulkRestoreSalesOrders: builder.mutation<
      { restoredCount: number; failedIds: string[] },
      string[]
    >({
      query: (salesOrderIds) => ({
        url: '/sales-orders/bulk-restore',
        method: 'POST',
        data: { salesOrderIds },
      }),
      invalidatesTags: ['SalesOrder', 'DeletedSalesOrder'],
    }),
    permanentDeleteSalesOrder: builder.mutation<void, string>({
      query: (id) => ({ url: `/sales-orders/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: ['DeletedSalesOrder'],
    }),
    bulkPermanentDeleteSalesOrders: builder.mutation<
      { deletedCount: number; failedIds: string[] },
      string[]
    >({
      query: (salesOrderIds) => ({
        url: '/sales-orders/bulk-permanent-delete',
        method: 'POST',
        data: { salesOrderIds },
      }),
      invalidatesTags: ['DeletedSalesOrder'],
    }),

    getPayments: builder.query<PaginatedResponse<Payment>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/payments', params: params ?? {} }),
      transformResponse: (response: any) => normalizeNamedCollection<Payment>(response, 'payments'),
      providesTags: ['Payment'],
    }),
    getCustomerPayments: builder.query<Payment[], string>({
      query: (id) => ({ url: `/payments/customer/${id}` }),
      transformResponse: (response: any): Payment[] => {
        if (Array.isArray(response)) return response;
        return response?.data ?? [];
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
  }),
});

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
  useUncancelSalesOrderMutation,
  useDuplicateSalesOrderMutation,
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
  useGetPaymentsQuery,
  useGetCustomerPaymentsQuery,
  useGetCustomerSalesHistoryQuery,
} = salesApiSlice;
