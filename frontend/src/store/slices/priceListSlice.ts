import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

interface PriceListUIState {
  pagination: {
    page: number
    limit: number
  }
}

const initialState: PriceListUIState = {
  pagination: {
    page: 1,
    limit: 20,
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
