import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { Category } from '@/types'
import type { RootState } from '@/store'

interface InventoryState {
  selectedCategory: Category | null
  filters: {
    categories: {
      search: string
    }
  }
}

const initialState: InventoryState = {
  selectedCategory: null,
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
    setCategoryFilters: (state, action: PayloadAction<Partial<InventoryState['filters']['categories']>>) => {
      state.filters.categories = { ...state.filters.categories, ...action.payload }
    },
  },
})

export const {
  setSelectedCategory,
  setCategoryFilters,
} = inventorySlice.actions

export const selectSelectedCategory = (state: RootState) => state.inventory.selectedCategory
export default inventorySlice.reducer
