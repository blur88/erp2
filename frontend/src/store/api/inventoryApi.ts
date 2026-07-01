import { createApi } from '@reduxjs/toolkit/query/react'

import type { Category, PaginatedResponse, Product, StockAdjustment, StockMovement } from '@/types'

import { axiosBaseQuery } from './baseQuery'
import { normalizePaginated, normalizeSingle } from './normalizers'

export interface CategoryProduct {
  id: string
  name: string
  stockQuantity: number
}

export const inventoryApiSlice = createApi({
  reducerPath: 'inventoryApi',
  baseQuery: axiosBaseQuery(),
  tagTypes: ['Product', 'DeletedProduct', 'Category', 'StockAdjustment', 'DeletedStockAdjustment', 'StockMovement'],
  endpoints: (builder) => ({
    getProducts: builder.query<PaginatedResponse<Product>, Record<string, unknown> | undefined>({
      query: (params) => ({
        url: '/inventory/products',
        params: { isActive: true, sortBy: 'name', sortOrder: 'ASC', ...(params ?? {}) },
      }),
      transformResponse: normalizePaginated<Product>,
      providesTags: ['Product'],
    }),
    getProduct: builder.query<Product, string>({
      query: (id) => ({ url: `/inventory/products/${id}` }),
      transformResponse: normalizeSingle<Product>,
      providesTags: (_result, _error, id) => [{ type: 'Product', id }],
    }),
    getProductBySlug: builder.query<Product, string>({
      query: (slug) => ({ url: `/inventory/products/slug/${slug}` }),
      transformResponse: normalizeSingle<Product>,
      providesTags: (result) => result ? [{ type: 'Product', id: result.id }] : [],
    }),
    getDeletedProducts: builder.query<PaginatedResponse<Product>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/inventory/products/deleted', params: params ?? {} }),
      transformResponse: normalizePaginated<Product>,
      providesTags: ['DeletedProduct'],
    }),
    createProduct: builder.mutation<Product, Partial<Product>>({
      query: (body) => ({ url: '/inventory/products', method: 'POST', data: body }),
      transformResponse: normalizeSingle<Product>,
      invalidatesTags: ['Product'],
    }),
    updateProduct: builder.mutation<Product, { id: string; data: Partial<Product> }>({
      query: ({ id, data }) => ({ url: `/inventory/products/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<Product>,
      invalidatesTags: ['Product'],
    }),
    deleteProduct: builder.mutation<void, string>({
      query: (id) => ({ url: `/inventory/products/${id}`, method: 'DELETE' }),
      invalidatesTags: ['Product', 'DeletedProduct'],
    }),
    restoreProduct: builder.mutation<Product, string>({
      query: (id) => ({ url: `/inventory/products/${id}/restore`, method: 'POST' }),
      transformResponse: normalizeSingle<Product>,
      invalidatesTags: ['Product', 'DeletedProduct'],
    }),
    bulkRestoreProducts: builder.mutation<{ restoredCount: number; failedIds: string[] }, string[]>({
      query: (productIds) => ({ url: '/inventory/products/bulk-restore', method: 'POST', data: { productIds } }),
      invalidatesTags: ['Product', 'DeletedProduct'],
    }),
    permanentDeleteProduct: builder.mutation<void, string>({
      query: (id) => ({ url: `/inventory/products/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: ['DeletedProduct'],
    }),
    bulkPermanentDeleteProducts: builder.mutation<{ deletedCount: number; failedIds: string[] }, string[]>({
      query: (productIds) => ({ url: '/inventory/products/bulk-permanent-delete', method: 'POST', data: { productIds } }),
      invalidatesTags: ['DeletedProduct'],
    }),
    checkProductDuplicate: builder.query<{
      nameExists: boolean
      barcodeExists: boolean
      nameConflict?: {
        id: string
        name: string
        isDeleted: boolean
        barcode?: string
      }
      barcodeConflict?: {
        id: string
        name: string
        isDeleted: boolean
        barcode?: string
      }
    }, Record<string, unknown>>({
      query: (params) => ({ url: '/inventory/products/check-duplicate', params }),
    }),

    getCategories: builder.query<Category[], Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/inventory/categories', params: { includeProductCount: true, ...(params ?? {}) } }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['Category'],
    }),
    getCategoryProducts: builder.query<{ data: CategoryProduct[] }, string>({
      query: (categoryId) => ({ url: `/inventory/categories/${categoryId}/products` }),
      providesTags: (_result, _error, categoryId) => [{ type: 'Category', id: categoryId }],
    }),
    createCategory: builder.mutation<Category, Partial<Category>>({
      query: (body) => ({ url: '/inventory/categories', method: 'POST', data: body }),
      transformResponse: normalizeSingle<Category>,
      invalidatesTags: ['Category'],
    }),
    updateCategory: builder.mutation<Category, { id: string; data: Partial<Category> }>({
      query: ({ id, data }) => ({ url: `/inventory/categories/${id}`, method: 'PATCH', data }),
      transformResponse: normalizeSingle<Category>,
      invalidatesTags: ['Category'],
    }),
    checkCategoryDuplicate: builder.query<{
      nameExists: boolean
      nameConflict?: {
        id: string
        name: string
        isDeleted: boolean
        parentId?: string
      }
    }, Record<string, unknown>>({
      query: (params) => ({ url: '/inventory/categories/check-duplicate', params }),
    }),
    getCategoryBySlug: builder.query<Category, string>({
      query: (slug) => ({ url: `/inventory/categories/slug/${slug}` }),
      transformResponse: normalizeSingle<Category>,
      providesTags: (_r, _e, slug) => [{ type: 'Category', id: slug }],
    }),
    setCategoryEnabled: builder.mutation<Category, { id: string; enabled: boolean }>({
      query: ({ id, enabled }) => ({
        url: `/inventory/categories/${id}/enabled`,
        method: 'PATCH',
        data: { enabled },
      }),
      transformResponse: normalizeSingle<Category>,
      invalidatesTags: ['Category'],
    }),

    getDashboardStats: builder.query<{
      totalProducts: number
      totalCategories: number
      inventoryValue: number
      lowStockCount: number
      outOfStockCount: number
      recentMovements: number
      categoryBreakdown: Array<{ category: string; count: number; value: number }>
      stockHealthMetrics: { inStockPercentage: number; outOfStockPercentage: number; averageValue: number }
    }, void>({
      query: () => ({ url: '/inventory/products/dashboard-stats' }),
      providesTags: ['Product'],
    }),
    getStockMovements: builder.query<PaginatedResponse<StockMovement>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/inventory/stock/movements', params: params ?? {} }),
      transformResponse: normalizePaginated<StockMovement>,
      providesTags: ['StockMovement'],
    }),
    getOutOfStockProducts: builder.query<Product[], void>({
      query: () => ({ url: '/inventory/products/out-of-stock' }),
      transformResponse: (response: any) => (Array.isArray(response) ? response : response?.data ?? []),
      providesTags: ['Product'],
    }),

    getStockAdjustments: builder.query<PaginatedResponse<StockAdjustment>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/inventory/stock-adjustments', params: params ?? {} }),
      transformResponse: normalizePaginated<StockAdjustment>,
      providesTags: ['StockAdjustment'],
    }),
    getStockAdjustment: builder.query<StockAdjustment, string>({
      query: (id) => ({ url: `/inventory/stock-adjustments/${id}` }),
      transformResponse: normalizeSingle<StockAdjustment>,
      providesTags: (_result, _error, id) => [{ type: 'StockAdjustment', id }],
    }),
    getStockAdjustmentByNumber: builder.query<StockAdjustment, string>({
      query: (adjustmentNumber) => ({ url: `/inventory/stock-adjustments/by-number/${adjustmentNumber}` }),
      transformResponse: normalizeSingle<StockAdjustment>,
      providesTags: (result) => result ? [{ type: 'StockAdjustment', id: result.id }] : [],
    }),
    createStockAdjustment: builder.mutation<StockAdjustment, Record<string, unknown>>({
      query: (body) => ({ url: '/inventory/stock-adjustments', method: 'POST', data: body }),
      transformResponse: normalizeSingle<StockAdjustment>,
      invalidatesTags: ['StockAdjustment'],
    }),
    updateStockAdjustment: builder.mutation<StockAdjustment, { id: string; data: Record<string, unknown> }>({
      query: ({ id, data }) => ({ url: `/inventory/stock-adjustments/${id}`, method: 'PUT', data }),
      transformResponse: normalizeSingle<StockAdjustment>,
      invalidatesTags: ['StockAdjustment'],
    }),
    deleteStockAdjustment: builder.mutation<void, string>({
      query: (id) => ({ url: `/inventory/stock-adjustments/${id}`, method: 'DELETE' }),
      invalidatesTags: ['StockAdjustment', 'DeletedStockAdjustment'],
    }),
    completeStockAdjustment: builder.mutation<StockAdjustment, string>({
      query: (id) => ({ url: `/inventory/stock-adjustments/${id}/complete`, method: 'POST' }),
      transformResponse: normalizeSingle<StockAdjustment>,
      invalidatesTags: ['StockAdjustment'],
    }),
    updateStockAdjustmentNotes: builder.mutation<StockAdjustment, { id: string; notes?: string }>({
      query: ({ id, notes }) => ({
        url: `/inventory/stock-adjustments/${id}/notes`,
        method: 'PATCH',
        data: { notes },
      }),
      transformResponse: normalizeSingle<StockAdjustment>,
      invalidatesTags: (_result, _error, { id }) => ['StockAdjustment', { type: 'StockAdjustment', id }],
    }),
    getDeletedStockAdjustments: builder.query<PaginatedResponse<StockAdjustment>, Record<string, unknown> | undefined>({
      query: (params) => ({ url: '/inventory/stock-adjustments/deleted', params: params ?? {} }),
      transformResponse: normalizePaginated<StockAdjustment>,
      providesTags: ['DeletedStockAdjustment'],
    }),
    restoreStockAdjustment: builder.mutation<StockAdjustment, string>({
      query: (id) => ({ url: `/inventory/stock-adjustments/${id}/restore`, method: 'POST' }),
      transformResponse: normalizeSingle<StockAdjustment>,
      invalidatesTags: ['StockAdjustment', 'DeletedStockAdjustment'],
    }),
    permanentDeleteStockAdjustment: builder.mutation<void, string>({
      query: (id) => ({ url: `/inventory/stock-adjustments/${id}/permanent`, method: 'DELETE' }),
      invalidatesTags: ['DeletedStockAdjustment'],
    }),
    bulkPermanentDeleteStockAdjustments: builder.mutation<{ successCount: number; failedIds: string[] }, string[]>({
      query: (stockAdjustmentIds) => ({
        url: '/inventory/stock-adjustments/bulk-permanent-delete',
        method: 'POST',
        data: { stockAdjustmentIds },
      }),
      invalidatesTags: ['DeletedStockAdjustment'],
    }),
  }),
})

export const {
  useGetProductsQuery,
  useGetProductQuery,
  useGetProductBySlugQuery,
  useLazyGetProductBySlugQuery,
  useLazyGetProductQuery,
  useGetDeletedProductsQuery,
  useCreateProductMutation,
  useUpdateProductMutation,
  useDeleteProductMutation,
  useRestoreProductMutation,
  useBulkRestoreProductsMutation,
  usePermanentDeleteProductMutation,
  useBulkPermanentDeleteProductsMutation,
  useLazyCheckProductDuplicateQuery,
  useGetCategoriesQuery,
  useGetCategoryProductsQuery,
  useCreateCategoryMutation,
  useUpdateCategoryMutation,
  useLazyCheckCategoryDuplicateQuery,
  useGetCategoryBySlugQuery,
  useSetCategoryEnabledMutation,
  useGetDashboardStatsQuery,
  useGetStockMovementsQuery,
  useGetOutOfStockProductsQuery,
  useGetStockAdjustmentsQuery,
  useGetStockAdjustmentQuery,
  useGetStockAdjustmentByNumberQuery,
  useLazyGetStockAdjustmentByNumberQuery,
  useLazyGetStockAdjustmentQuery,
  useCreateStockAdjustmentMutation,
  useUpdateStockAdjustmentMutation,
  useDeleteStockAdjustmentMutation,
  useCompleteStockAdjustmentMutation,
  useUpdateStockAdjustmentNotesMutation,
  useGetDeletedStockAdjustmentsQuery,
  useRestoreStockAdjustmentMutation,
  usePermanentDeleteStockAdjustmentMutation,
  useBulkPermanentDeleteStockAdjustmentsMutation,
} = inventoryApiSlice
