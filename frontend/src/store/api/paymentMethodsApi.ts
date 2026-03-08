import { createApi } from '@reduxjs/toolkit/query/react'
import type { PaymentMethodConfig, PaginatedResponse } from '@/types'
import { axiosBaseQuery } from './baseQuery'
import { normalizePaginated, normalizeSingle } from './normalizers'

const BASE_URL = '/settings/payment-methods'

export const paymentMethodsApiSlice = createApi({
  reducerPath: 'paymentMethodsApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['PaymentMethod', 'DeletedPaymentMethod'],
  endpoints: (builder) => ({
    getPaymentMethods: builder.query<PaginatedResponse<PaymentMethodConfig>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: BASE_URL, params: params ?? {} }),
      transformResponse: normalizePaginated<PaymentMethodConfig>,
      providesTags: ['PaymentMethod'],
    }),
    getActivePaymentMethods: builder.query<PaymentMethodConfig[], void>({
      query: () => ({ url: `${BASE_URL}/active` }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['PaymentMethod'],
    }),
    getActivePaymentMethodsForPurchases: builder.query<PaymentMethodConfig[], void>({
      query: () => ({ url: `${BASE_URL}/active`, params: { forPurchases: true } }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['PaymentMethod'],
    }),
    getPaymentMethod: builder.query<PaymentMethodConfig, string>({
      query: (id) => ({ url: `${BASE_URL}/${id}` }),
      transformResponse: normalizeSingle<PaymentMethodConfig>,
      providesTags: (_result, _error, id) => [{ type: 'PaymentMethod', id }],
    }),
    getDeletedPaymentMethods: builder.query<PaymentMethodConfig[], void>({
      query: () => ({ url: `${BASE_URL}/deleted` }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['DeletedPaymentMethod'],
    }),
    createPaymentMethod: builder.mutation<PaymentMethodConfig, Partial<PaymentMethodConfig>>({
      query: (data) => ({ url: BASE_URL, method: 'POST', data }),
      transformResponse: normalizeSingle<PaymentMethodConfig>,
      invalidatesTags: ['PaymentMethod'],
    }),
    updatePaymentMethod: builder.mutation<PaymentMethodConfig, { id: string; data: Partial<PaymentMethodConfig> }>({
      query: ({ id, data }) => ({ url: `${BASE_URL}/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<PaymentMethodConfig>,
      invalidatesTags: ['PaymentMethod'],
    }),
    deletePaymentMethod: builder.mutation<void, string>({
      query: (id) => ({ url: `${BASE_URL}/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PaymentMethod', 'DeletedPaymentMethod'],
    }),
    restorePaymentMethod: builder.mutation<void, string>({
      query: (id) => ({ url: `${BASE_URL}/${id}/restore`, method: 'POST' }),
      invalidatesTags: ['PaymentMethod', 'DeletedPaymentMethod'],
    }),
    permanentDeletePaymentMethod: builder.mutation<void, string>({
      query: (id) => ({ url: `${BASE_URL}/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: ['DeletedPaymentMethod'],
    }),
  }),
})

export const {
  useGetPaymentMethodsQuery,
  useGetActivePaymentMethodsQuery,
  useGetActivePaymentMethodsForPurchasesQuery,
  useGetPaymentMethodQuery,
  useGetDeletedPaymentMethodsQuery,
  useCreatePaymentMethodMutation,
  useUpdatePaymentMethodMutation,
  useDeletePaymentMethodMutation,
  useRestorePaymentMethodMutation,
  usePermanentDeletePaymentMethodMutation,
} = paymentMethodsApiSlice
