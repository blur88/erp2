import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { PAGINATION } from '@/constants/tableStyles'

interface PriceListUIState {
  pagination: {
    page: number
    limit: number
  }
}

const initialState: PriceListUIState = {
  pagination: {
    page: 1,
    limit: PAGINATION.defaultPageSize,
  },
}

const priceListSlice = createSlice({
  name: 'priceLists',
  initialState,
  reducers: {
    setPagination: (state, action: PayloadAction<Partial<PriceListUIState['pagination']>>) => {
      state.pagination = { ...state.pagination, ...action.payload }
    },
  },
})

export const { setPagination } = priceListSlice.actions

export default priceListSlice.reducer
