import { createApi } from '@reduxjs/toolkit/query/react'

import type {
  PaginatedResponse,
  PurchaseOrder,
  Supplier,
  VendorPayment,
} from '@/types'

import { axiosBaseQuery } from './baseQuery'
import { normalizeSingle } from './normalizers'

const defaultMeta = {
  total: 0,
}

function normalizeNamedCollection<T>(
  response: any,
  key: 'suppliers' | 'orders' | 'grns' | 'payments' | 'data',
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
  const meta = { total: response.meta?.total ?? response.total ?? (Array.isArray(data) ? data.length : 0) }

  return {
    data: Array.isArray(data) ? data : [],
    meta,
  }
}

export const purchasingApiSlice = createApi({
  reducerPath: 'purchasingApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: [
    'Supplier',
    'DeletedSupplier',
    'PurchaseOrder',
    'DeletedPurchaseOrder',
    'VendorPayment',
    'DeletedVendorPayment',
  ],
  endpoints: (builder) => ({
    getSuppliers: builder.query<PaginatedResponse<Supplier>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/purchasing/suppliers', params: params ?? {} }),
      transformResponse: (response: any) => normalizeNamedCollection<Supplier>(response, 'data'),
      providesTags: ['Supplier'],
    }),
    getSupplier: builder.query<Supplier, string>({
      query: (id) => ({ url: `/purchasing/suppliers/${id}` }),
      transformResponse: normalizeSingle<Supplier>,
      providesTags: (_result, _error, id) => [{ type: 'Supplier', id }],
    }),
    getSupplierBySlug: builder.query<Supplier, string>({
      query: (slug) => ({ url: `/purchasing/suppliers/slug/${slug}` }),
      transformResponse: normalizeSingle<Supplier>,
      providesTags: (result) => result ? [{ type: 'Supplier', id: result.id }] : [],
    }),
    createSupplier: builder.mutation<Supplier, Partial<Supplier>>({
      query: (body) => ({ url: '/purchasing/suppliers', method: 'POST', data: body }),
      transformResponse: normalizeSingle<Supplier>,
      invalidatesTags: ['Supplier', 'PurchaseOrder', 'VendorPayment'],
    }),
    updateSupplier: builder.mutation<Supplier, { id: string; data: Partial<Supplier> }>({
      query: ({ id, data }) => ({ url: `/purchasing/suppliers/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<Supplier>,
      invalidatesTags: ['Supplier', 'PurchaseOrder', 'VendorPayment'],
    }),
    deleteSupplier: builder.mutation<void, string>({
      query: (id) => ({ url: `/purchasing/suppliers/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Supplier', 'DeletedSupplier', 'PurchaseOrder', 'VendorPayment'],
    }),
    getSupplierPurchaseOrders: builder.query<
      PaginatedResponse<PurchaseOrder>,
      { supplierId: string; page: number; limit: number }
    >({
      query: ({ supplierId, page, limit }) => ({
        url: `/purchasing/suppliers/${supplierId}/purchase-orders`,
        params: { page, limit },
      }),
      providesTags: (_result, _error, { supplierId }) => [{ type: 'Supplier', id: supplierId }],
    }),
    getSupplierPayments: builder.query<
      PaginatedResponse<VendorPayment>,
      { supplierId: string; page: number; limit: number }
    >({
      query: ({ supplierId, page, limit }) => ({
        url: `/purchasing/suppliers/${supplierId}/payments`,
        params: { page, limit },
      }),
      providesTags: (_result, _error, { supplierId }) => [{ type: 'Supplier', id: supplierId }],
    }),
    restoreSupplier: builder.mutation<Supplier, string>({
      query: (id) => ({ url: `/purchasing/suppliers/${id}/restore`, method: 'POST' }),
      transformResponse: normalizeSingle<Supplier>,
      invalidatesTags: ['Supplier', 'DeletedSupplier', 'PurchaseOrder', 'VendorPayment'],
    }),
    permanentDeleteSupplier: builder.mutation<void, string>({
      query: (id) => ({ url: `/purchasing/suppliers/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: ['DeletedSupplier'],
    }),
    bulkRestoreSuppliers: builder.mutation<{ restoredCount: number; failedIds: string[] }, string[]>({
      query: (supplierIds) => ({ url: '/purchasing/suppliers/bulk-restore', method: 'POST', data: { supplierIds } }),
      invalidatesTags: ['Supplier', 'DeletedSupplier', 'PurchaseOrder', 'VendorPayment'],
    }),
    bulkPermanentDeleteSuppliers: builder.mutation<{ deletedCount: number; failedIds: string[] }, string[]>({
      query: (supplierIds) => ({
        url: '/purchasing/suppliers/bulk-permanent-delete',
        method: 'POST',
        data: { supplierIds },
      }),
      invalidatesTags: ['DeletedSupplier'],
    }),
    checkDuplicateCompanyName: builder.query<{ exists: boolean; message?: string }, { companyName: string; excludeId?: string }>({
      query: ({ companyName, excludeId }) => ({
        url: '/purchasing/suppliers/check-duplicate',
        params: { companyName, excludeId },
      }),
    }),

    getPurchaseOrders: builder.query<PaginatedResponse<PurchaseOrder>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/purchasing/orders', params: params ?? {} }),
      transformResponse: (response: any) => normalizeNamedCollection<PurchaseOrder>(response, 'orders'),
      providesTags: ['PurchaseOrder'],
    }),
    getPurchaseOrder: builder.query<PurchaseOrder, string>({
      query: (id) => ({ url: `/purchasing/orders/${id}` }),
      transformResponse: normalizeSingle<PurchaseOrder>,
      providesTags: (_result, _error, id) => [{ type: 'PurchaseOrder', id }],
    }),
    getPurchaseOrderByNumber: builder.query<PurchaseOrder, string>({
      query: (orderNumber) => ({ url: `/purchasing/orders/by-number/${orderNumber}` }),
      transformResponse: normalizeSingle<PurchaseOrder>,
      providesTags: (result) => result ? [{ type: 'PurchaseOrder', id: result.id }] : [],
    }),
    getPurchaseOrderPayments: builder.query<VendorPayment[], string>({
      query: (id) => ({ url: `/purchasing/orders/${id}/payments` }),
      transformResponse: (response: any) => response?.data ?? response ?? [],
      providesTags: (_result, _error, id) => [{ type: 'PurchaseOrder', id }],
    }),
    // Single vendor payment by id — used by the accounting journal-entry UI to
    // resolve/navigate `vendor_payment`-sourced entries.
    getVendorPayment: builder.query<VendorPayment, string>({
      query: (id) => ({ url: `/purchasing/vendor-payments/${id}` }),
      transformResponse: normalizeSingle<VendorPayment>,
      providesTags: (_result, _error, id) => [{ type: 'VendorPayment' as const, id }],
    }),
    createPurchaseOrder: builder.mutation<PurchaseOrder, Partial<PurchaseOrder>>({
      query: (body) => ({ url: '/purchasing/orders', method: 'POST', data: body }),
      transformResponse: normalizeSingle<PurchaseOrder>,
      invalidatesTags: ['PurchaseOrder'],
    }),
    updatePurchaseOrder: builder.mutation<PurchaseOrder, { id: string; data: Partial<PurchaseOrder> }>({
      query: ({ id, data }) => ({ url: `/purchasing/orders/${id}`, method: 'PUT', data }),
      transformResponse: normalizeSingle<PurchaseOrder>,
      invalidatesTags: ['PurchaseOrder', 'VendorPayment'],
    }),
    cancelPurchaseOrder: builder.mutation<PurchaseOrder, string>({
      query: (id) => ({ url: `/purchasing/orders/${id}/cancel`, method: 'POST' }),
      transformResponse: normalizeSingle<PurchaseOrder>,
      invalidatesTags: ['PurchaseOrder'],
    }),
    uncancelPurchaseOrder: builder.mutation<PurchaseOrder, string>({
      query: (id) => ({ url: `/purchasing/orders/${id}/uncancel`, method: 'POST' }),
      transformResponse: normalizeSingle<PurchaseOrder>,
      invalidatesTags: ['PurchaseOrder'],
    }),
    deletePurchaseOrder: builder.mutation<void, string>({
      query: (id) => ({ url: `/purchasing/orders/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PurchaseOrder', 'DeletedPurchaseOrder', 'VendorPayment'],
    }),
    restorePurchaseOrder: builder.mutation<PurchaseOrder, string>({
      query: (id) => ({ url: `/purchasing/orders/${id}/restore`, method: 'POST' }),
      transformResponse: normalizeSingle<PurchaseOrder>,
      invalidatesTags: ['PurchaseOrder', 'DeletedPurchaseOrder'],
    }),
    permanentDeletePurchaseOrder: builder.mutation<void, string>({
      query: (id) => ({ url: `/purchasing/orders/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: ['DeletedPurchaseOrder'],
    }),
    bulkRestorePurchaseOrders: builder.mutation<{ restoredCount: number; failedIds: string[] }, string[]>({
      query: (orderIds) => ({ url: '/purchasing/orders/bulk-restore', method: 'POST', data: { orderIds } }),
      invalidatesTags: ['PurchaseOrder', 'DeletedPurchaseOrder'],
    }),
    bulkPermanentDeletePurchaseOrders: builder.mutation<{ deletedCount: number; failedIds: string[] }, string[]>({
      query: (orderIds) => ({
        url: '/purchasing/orders/bulk-permanent-delete',
        method: 'POST',
        data: { orderIds },
      }),
      invalidatesTags: ['DeletedPurchaseOrder'],
    }),
    receiveGoods: builder.mutation<PurchaseOrder, string>({
      query: (purchaseOrderId) => ({ url: `/purchasing/orders/${purchaseOrderId}/receive`, method: 'POST' }),
      transformResponse: normalizeSingle<PurchaseOrder>,
      invalidatesTags: ['PurchaseOrder'],
    }),
    returnGoods: builder.mutation<PurchaseOrder, string>({
      query: (purchaseOrderId) => ({ url: `/purchasing/orders/${purchaseOrderId}/return`, method: 'POST' }),
      transformResponse: normalizeSingle<PurchaseOrder>,
      invalidatesTags: ['PurchaseOrder'],
    }),
    recordVendorPayments: builder.mutation<
      PurchaseOrder,
      { purchaseOrderId: string; payments: { paymentMethodId: string; amount: number; reference?: string }[] }
    >({
      query: ({ purchaseOrderId, payments }) => ({
        url: `/purchasing/orders/${purchaseOrderId}/payments`,
        method: 'POST',
        data: { payments },
      }),
      transformResponse: normalizeSingle<PurchaseOrder>,
      invalidatesTags: ['PurchaseOrder', 'VendorPayment'],
    }),
    markPurchaseOrderAsUnpaid: builder.mutation<PurchaseOrder, string>({
      query: (purchaseOrderId) => ({ url: `/purchasing/orders/${purchaseOrderId}/unpay`, method: 'POST' }),
      transformResponse: (response: any) => normalizeSingle<PurchaseOrder>(response?.data ?? response),
      invalidatesTags: ['PurchaseOrder', 'VendorPayment'],
    }),
    duplicatePurchaseOrder: builder.mutation<PurchaseOrder, string>({
      query: (id) => ({ url: `/purchasing/orders/${id}/duplicate`, method: 'POST' }),
      transformResponse: normalizeSingle<PurchaseOrder>,
      invalidatesTags: ['PurchaseOrder'],
    }),
    recordPurchaseOrderRefunds: builder.mutation<
      PurchaseOrder,
      { id: string; refunds: { paymentMethodId: string; amount: number; reference?: string }[] }
    >({
      query: ({ id, refunds }) => ({
        url: `/purchasing/orders/${id}/refunds`,
        method: 'POST',
        data: { refunds },
      }),
      transformResponse: normalizeSingle<PurchaseOrder>,
      invalidatesTags: ['PurchaseOrder', 'VendorPayment'],
    }),

  }),
})

export const {
  useGetSuppliersQuery,
  useGetSupplierQuery,
  useGetSupplierBySlugQuery,
  useLazyGetSupplierBySlugQuery,
  useCreateSupplierMutation,
  useUpdateSupplierMutation,
  useDeleteSupplierMutation,
  useGetSupplierPurchaseOrdersQuery,
  useGetSupplierPaymentsQuery,
  useRestoreSupplierMutation,
  usePermanentDeleteSupplierMutation,
  useBulkRestoreSuppliersMutation,
  useBulkPermanentDeleteSuppliersMutation,
  useLazyCheckDuplicateCompanyNameQuery,
  useGetPurchaseOrdersQuery,
  useGetPurchaseOrderQuery,
  useGetPurchaseOrderByNumberQuery,
  useGetPurchaseOrderPaymentsQuery,
  useLazyGetPurchaseOrderByNumberQuery,
  useLazyGetPurchaseOrderQuery,
  useCreatePurchaseOrderMutation,
  useUpdatePurchaseOrderMutation,
  useCancelPurchaseOrderMutation,
  useUncancelPurchaseOrderMutation,
  useDeletePurchaseOrderMutation,
  useRestorePurchaseOrderMutation,
  usePermanentDeletePurchaseOrderMutation,
  useBulkRestorePurchaseOrdersMutation,
  useBulkPermanentDeletePurchaseOrdersMutation,
  useReceiveGoodsMutation,
  useReturnGoodsMutation,
  useRecordVendorPaymentsMutation,
  useMarkPurchaseOrderAsUnpaidMutation,
  useDuplicatePurchaseOrderMutation,
  useRecordPurchaseOrderRefundsMutation,
  useLazyGetVendorPaymentQuery,
} = purchasingApiSlice
