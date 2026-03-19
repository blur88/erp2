import { createApi } from '@reduxjs/toolkit/query/react'
import type { GlobalSearchResponse } from '@/types/search'

import { axiosBaseQuery } from './baseQuery'

export const searchApiSlice = createApi({
  reducerPath: 'searchApi',
  baseQuery: axiosBaseQuery(),
  endpoints: (builder) => ({
    searchGlobal: builder.query<GlobalSearchResponse, { q: string }>({
      query: ({ q }) => ({
        url: '/search/global',
        params: { q },
      }),
      transformResponse: (response: unknown) => response as GlobalSearchResponse,
      keepUnusedDataFor: 0,
    }),
  }),
})

export const { useSearchGlobalQuery } = searchApiSlice
