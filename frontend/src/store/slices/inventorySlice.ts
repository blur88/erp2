import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { Category, Product, StockAdjustment } from '@/types'

interface InventoryState {
  selectedProduct: Product | null
  selectedCategory: Category | null
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
  selectedCategory: null,
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
    setSelectedCategory: (state, action: PayloadAction<Category | null>) => {
      state.selectedCategory = action.payload
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
  setSelectedCategory,
  setSelectedStockAdjustment,
  setProductFilters,
  setCategoryFilters,
} = inventorySlice.actions

export const selectSelectedProduct = (state: any) => state.inventory?.selectedProduct
export const selectSelectedCategory = (state: any) => state.inventory?.selectedCategory
export const selectSelectedStockAdjustment = (state: any) => state.inventory?.selectedStockAdjustment
export const selectProductFilters = (state: any) => state.inventory?.filters?.products
export const selectCategoryFilters = (state: any) => state.inventory?.filters?.categories

export default inventorySlice.reducer
