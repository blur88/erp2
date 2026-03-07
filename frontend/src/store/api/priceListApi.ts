import { createApi } from '@reduxjs/toolkit/query/react'

import type { PaginatedResponse, PriceList, PriceListItem, QueryParams } from '@/types'
import type { BulkUpdatePriceDto, CopyPriceListDto, PercentageAdjustmentDto } from '@/services/priceListApi'

import { axiosBaseQuery } from './baseQuery'
import { normalizePaginated, normalizeSingle } from './normalizers'

export const priceListApiSlice = createApi({
  reducerPath: 'priceListApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['PriceList', 'PriceListItem'],
  endpoints: (builder) => ({
    getPriceLists: builder.query<PaginatedResponse<PriceList>, QueryParams | undefined>({
      query: (params) => ({ url: '/price-lists', params: (params ?? {}) as Record<string, unknown> }),
      transformResponse: normalizePaginated<PriceList>,
      providesTags: ['PriceList'],
    }),
    getPriceList: builder.query<PriceList, string>({
      query: (id) => ({ url: `/price-lists/${id}` }),
      transformResponse: normalizeSingle<PriceList>,
      providesTags: (_result, _error, id) => [{ type: 'PriceList', id }],
    }),
    createPriceList: builder.mutation<PriceList, Partial<PriceList>>({
      query: (body) => ({ url: '/price-lists', method: 'POST', data: body }),
      transformResponse: normalizeSingle<PriceList>,
      invalidatesTags: ['PriceList'],
    }),
    updatePriceList: builder.mutation<PriceList, { id: string; data: Partial<PriceList> }>({
      query: ({ id, data }) => ({ url: `/price-lists/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<PriceList>,
      invalidatesTags: ['PriceList'],
    }),
    deletePriceList: builder.mutation<void, string>({
      query: (id) => ({ url: `/price-lists/${id}`, method: 'DELETE' }),
      invalidatesTags: ['PriceList'],
    }),
    setDefaultPriceList: builder.mutation<PriceList, string>({
      query: (id) => ({ url: `/price-lists/${id}/set-default`, method: 'POST' }),
      transformResponse: normalizeSingle<PriceList>,
      invalidatesTags: ['PriceList'],
    }),
    getEffectivePriceLists: builder.query<PriceList[], void>({
      query: () => ({ url: '/price-lists/effective' }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['PriceList'],
    }),
    getPriceListItems: builder.query<PriceListItem[], string>({
      query: (priceListId) => ({ url: `/price-lists/${priceListId}/items` }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: (_result, _error, priceListId) => [{ type: 'PriceListItem', id: priceListId }],
    }),
    getProductPriceListItems: builder.query<PriceListItem[], string>({
      query: (productId) => ({ url: `/price-lists/product/${productId}/items` }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: (_result, _error, productId) => [{ type: 'PriceListItem', id: `product-${productId}` }],
    }),
    bulkUpdatePrices: builder.mutation<
      { updated: number; created: number; failed: number; items: PriceListItem[] },
      { priceListId: string; items: BulkUpdatePriceDto[] }
    >({
      query: ({ priceListId, items }) => ({ url: `/price-lists/${priceListId}/items/bulk`, method: 'POST', data: { items } }),
      invalidatesTags: (_result, _error, { priceListId }) => [{ type: 'PriceListItem', id: priceListId }],
    }),
    copyPriceList: builder.mutation<PriceList, { priceListId: string; data: CopyPriceListDto }>({
      query: ({ priceListId, data }) => ({ url: `/price-lists/${priceListId}/copy`, method: 'POST', data }),
      transformResponse: normalizeSingle<PriceList>,
      invalidatesTags: ['PriceList'],
    }),
    applyPercentageAdjustment: builder.mutation<
      { updated: number; items: PriceListItem[] },
      { priceListId: string; data: PercentageAdjustmentDto }
    >({
      query: ({ priceListId, data }) => ({ url: `/price-lists/${priceListId}/adjust`, method: 'POST', data }),
      invalidatesTags: (_result, _error, { priceListId }) => [{ type: 'PriceListItem', id: priceListId }],
    }),
  }),
})

export const {
  useGetPriceListsQuery,
  useGetPriceListQuery,
  useCreatePriceListMutation,
  useUpdatePriceListMutation,
  useDeletePriceListMutation,
  useSetDefaultPriceListMutation,
  useGetEffectivePriceListsQuery,
  useGetPriceListItemsQuery,
  useGetProductPriceListItemsQuery,
  useBulkUpdatePricesMutation,
  useCopyPriceListMutation,
  useApplyPercentageAdjustmentMutation,
} = priceListApiSlice
