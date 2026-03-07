import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { RootState } from '@/store'

interface PriceListUIState {
  pagination: {
    page: number
    limit: number
  }
  filters: {
    search: string
    isActive?: boolean
  }
}

const initialState: PriceListUIState = {
  pagination: {
    page: 1,
    limit: 20,
  },
  filters: {
    search: '',
    isActive: true,
  },
}

const priceListSlice = createSlice({
  name: 'priceLists',
  initialState,
  reducers: {
    setFilters: (state, action: PayloadAction<Partial<PriceListUIState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload }
    },
    setPagination: (state, action: PayloadAction<Partial<PriceListUIState['pagination']>>) => {
      state.pagination = { ...state.pagination, ...action.payload }
    },
  },
})

export const { setFilters, setPagination } = priceListSlice.actions

export default priceListSlice.reducer
