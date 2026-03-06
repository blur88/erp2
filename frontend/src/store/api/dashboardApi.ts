import { createApi } from '@reduxjs/toolkit/query/react'

import { axiosBaseQuery } from './baseQuery'

export const dashboardApiSlice = createApi({
  reducerPath: 'dashboardApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Dashboard'],
  endpoints: (builder) => ({
    getSalesOrders: builder.query<any[], void>({
      query: () => ({ url: '/sales-orders', params: { sortBy: 'orderDate', sortOrder: 'desc' } }),
      transformResponse: (response: any) => response?.data ?? [],
      providesTags: ['Dashboard'],
    }),
    getPurchaseOrders: builder.query<any[], void>({
      query: () => ({ url: '/purchasing/orders', params: { sortBy: 'orderDate', sortOrder: 'DESC' } }),
      transformResponse: (response: any) => response?.orders ?? response?.data ?? [],
      providesTags: ['Dashboard'],
    }),
    getSuppliers: builder.query<any[], void>({
      query: () => ({ url: '/purchasing/suppliers' }),
      transformResponse: (response: any) => response?.suppliers ?? response?.data ?? [],
      providesTags: ['Dashboard'],
    }),
    getInventoryStats: builder.query<any, void>({
      query: () => ({ url: '/inventory/products/dashboard-stats' }),
      providesTags: ['Dashboard'],
    }),
    getOutOfStockProducts: builder.query<any[], void>({
      query: () => ({ url: '/inventory/products/out-of-stock' }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['Dashboard'],
    }),
    getPayments: builder.query<any[], void>({
      query: () => ({ url: '/payments' }),
      transformResponse: (response: any) => response?.data ?? [],
      providesTags: ['Dashboard'],
    }),
  }),
})

export const {
  useGetSalesOrdersQuery,
  useGetPurchaseOrdersQuery,
  useGetSuppliersQuery,
  useGetInventoryStatsQuery,
  useGetOutOfStockProductsQuery,
  useGetPaymentsQuery,
} = dashboardApiSlice
