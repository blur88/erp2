import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { Category, StockAdjustment } from '@/types'
import type { RootState } from '@/store'

interface InventoryState {
  selectedCategory: Category | null
  selectedStockAdjustment: StockAdjustment | null
  filters: {
    categories: {
      search: string
    }
  }
}

const initialState: InventoryState = {
  selectedCategory: null,
  selectedStockAdjustment: null,
  filters: {
    categories: {
      search: '',
    },
  },
}

const inventorySlice = createSlice({
  name: 'inventory',
  initialState,
  reducers: {
    setSelectedCategory: (state, action: PayloadAction<Category | null>) => {
      state.selectedCategory = action.payload
    },
    setSelectedStockAdjustment: (state, action: PayloadAction<StockAdjustment | null>) => {
      state.selectedStockAdjustment = action.payload
    },
    setCategoryFilters: (state, action: PayloadAction<Partial<InventoryState['filters']['categories']>>) => {
      state.filters.categories = { ...state.filters.categories, ...action.payload }
    },
  },
})

export const {
  setSelectedCategory,
  setSelectedStockAdjustment,
  setCategoryFilters,
} = inventorySlice.actions

export const selectSelectedCategory = (state: RootState) => state.inventory.selectedCategory
export const selectSelectedStockAdjustment = (state: RootState) => state.inventory.selectedStockAdjustment
export default inventorySlice.reducer
