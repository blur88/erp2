import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { Product, StockAdjustment } from '@/types'
import type { RootState } from '@/store'

interface InventoryState {
  selectedProduct: Product | null
  selectedStockAdjustment: StockAdjustment | null
  filters: {
    products: {
      search: string
      categoryId?: string
      lowStock: boolean
      inStock: boolean
    }
    categories: {
      search: string
    }
  }
}

const initialState: InventoryState = {
  selectedProduct: null,
  selectedStockAdjustment: null,
  filters: {
    products: {
      search: '',
      lowStock: false,
      inStock: true,
    },
    categories: {
      search: '',
    },
  },
}

const inventorySlice = createSlice({
  name: 'inventory',
  initialState,
  reducers: {
    setSelectedProduct: (state, action: PayloadAction<Product | null>) => {
      state.selectedProduct = action.payload
    },
    setSelectedStockAdjustment: (state, action: PayloadAction<StockAdjustment | null>) => {
      state.selectedStockAdjustment = action.payload
    },
    setProductFilters: (state, action: PayloadAction<Partial<InventoryState['filters']['products']>>) => {
      state.filters.products = { ...state.filters.products, ...action.payload }
    },
    setCategoryFilters: (state, action: PayloadAction<Partial<InventoryState['filters']['categories']>>) => {
      state.filters.categories = { ...state.filters.categories, ...action.payload }
    },
  },
})

export const {
  setSelectedProduct,
  setSelectedStockAdjustment,
  setProductFilters,
  setCategoryFilters,
} = inventorySlice.actions

export const selectSelectedProduct = (state: RootState) => state.inventory.selectedProduct
export const selectSelectedStockAdjustment = (state: RootState) => state.inventory.selectedStockAdjustment
export const selectProductFilters = (state: RootState) => state.inventory.filters.products
export const selectCategoryFilters = (state: RootState) => state.inventory.filters.categories

export default inventorySlice.reducer
