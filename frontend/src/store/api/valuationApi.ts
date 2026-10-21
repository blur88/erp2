import { createApi } from '@reduxjs/toolkit/query/react'
import { axiosBaseQuery } from './baseQuery'

export interface ValuationStatus {
  active: boolean
  method: 'AVERAGE' | 'FIFO'
}

export interface ProductValuation {
  quantityOnHand: string
  valueOnHand: string
  unitValue: string | null
}

export const valuationApiSlice = createApi({
  reducerPath: 'valuationApi',
  baseQuery: axiosBaseQuery(),
  endpoints: (builder) => ({
    getValuationStatus: builder.query<ValuationStatus, void>({
      query: () => ({ url: '/inventory/valuation/status' }),
    }),
    getProductValuation: builder.query<ProductValuation | null, string>({
      query: (id) => ({ url: `/inventory/valuation/products/${id}` }),
    }),
  }),
})

export const {
  useGetValuationStatusQuery,
  useGetProductValuationQuery,
  useLazyGetProductValuationQuery,
} = valuationApiSlice
