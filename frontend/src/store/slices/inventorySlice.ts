import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Product, Category, StockMovement, PaginatedResponse } from '@/types'
import { inventoryApi } from '@/services/inventoryApi'

interface InventoryState {
  products: Product[]
  categories: Category[]
  stockMovements: StockMovement[]
  selectedProduct: Product | null
  selectedCategory: Category | null
  loading: {
    products: boolean
    categories: boolean
    stockMovements: boolean
  }
  error: string | null
  pagination: {
    products: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
    stockMovements: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  }
  filters: {
    search: string
    categoryId?: string
    lowStock: boolean
    inStock: boolean
  }
}

const initialState: InventoryState = {
  products: [],
  categories: [],
  stockMovements: [],
  selectedProduct: null,
  selectedCategory: null,
  loading: {
    products: false,
    categories: false,
    stockMovements: false,
  },
  error: null,
  pagination: {
    products: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    },
    stockMovements: {
      page: 1,
      limit: 20,
      total: 0,
      totalPages: 0,
    },
  },
  filters: {
    search: '',
    lowStock: false,
    inStock: true,
  },
}

// Async thunks
export const fetchProducts = createAsyncThunk(
  'inventory/fetchProducts',
  async (params: { page?: number; limit?: number; search?: string; categoryId?: string }, { rejectWithValue }) => {
    try {
      const response = await inventoryApi.getProducts(params)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch products')
    }
  }
)

export const fetchCategories = createAsyncThunk(
  'inventory/fetchCategories',
  async (_, { rejectWithValue }) => {
    try {
      const response = await inventoryApi.getCategories()
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch categories')
    }
  }
)

export const createProduct = createAsyncThunk(
  'inventory/createProduct',
  async (productData: Partial<Product>, { rejectWithValue }) => {
    try {
      const response = await inventoryApi.createProduct(productData)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create product')
    }
  }
)

export const updateProduct = createAsyncThunk(
  'inventory/updateProduct',
  async ({ id, data }: { id: string; data: Partial<Product> }, { rejectWithValue }) => {
    try {
      const response = await inventoryApi.updateProduct(id, data)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update product')
    }
  }
)

export const deleteProduct = createAsyncThunk(
  'inventory/deleteProduct',
  async (id: string, { rejectWithValue }) => {
    try {
      await inventoryApi.deleteProduct(id)
      return id
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete product')
    }
  }
)

export const fetchStockMovements = createAsyncThunk(
  'inventory/fetchStockMovements',
  async (params: { page?: number; limit?: number; productId?: string }, { rejectWithValue }) => {
    try {
      const response = await inventoryApi.getStockMovements(params)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch stock movements')
    }
  }
)

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
    setFilters: (state, action: PayloadAction<Partial<typeof initialState.filters>>) => {
      state.filters = { ...state.filters, ...action.payload }
    },
    clearError: (state) => {
      state.error = null
    },
    resetProducts: (state) => {
      state.products = []
      state.pagination.products = initialState.pagination.products
    },
  },
  extraReducers: (builder) => {
    // Fetch Products
    builder
      .addCase(fetchProducts.pending, (state) => {
        state.loading.products = true
        state.error = null
      })
      .addCase(fetchProducts.fulfilled, (state, action) => {
        state.loading.products = false
        if (action.payload) {
          state.products = action.payload.data
          state.pagination.products = action.payload.meta
        }
      })
      .addCase(fetchProducts.rejected, (state, action) => {
        state.loading.products = false
        state.error = action.payload as string
      })

    // Fetch Categories
    builder
      .addCase(fetchCategories.pending, (state) => {
        state.loading.categories = true
        state.error = null
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.loading.categories = false
        if (action.payload) {
          state.categories = action.payload
        }
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.loading.categories = false
        state.error = action.payload as string
      })

    // Create Product
    builder
      .addCase(createProduct.fulfilled, (state, action) => {
        if (action.payload) {
          state.products.unshift(action.payload)
        }
      })

    // Update Product
    builder
      .addCase(updateProduct.fulfilled, (state, action) => {
        if (action.payload) {
          const index = state.products.findIndex(p => p.id === action.payload.id)
          if (index >= 0) {
            state.products[index] = action.payload
          }
          if (state.selectedProduct?.id === action.payload.id) {
            state.selectedProduct = action.payload
          }
        }
      })

    // Delete Product
    builder
      .addCase(deleteProduct.fulfilled, (state, action) => {
        if (action.payload) {
          state.products = state.products.filter(p => p.id !== action.payload)
          if (state.selectedProduct?.id === action.payload) {
            state.selectedProduct = null
          }
        }
      })

    // Fetch Stock Movements
    builder
      .addCase(fetchStockMovements.pending, (state) => {
        state.loading.stockMovements = true
        state.error = null
      })
      .addCase(fetchStockMovements.fulfilled, (state, action) => {
        state.loading.stockMovements = false
        if (action.payload) {
          state.stockMovements = action.payload.data
          state.pagination.stockMovements = action.payload.meta
        }
      })
      .addCase(fetchStockMovements.rejected, (state, action) => {
        state.loading.stockMovements = false
        state.error = action.payload as string
      })
  },
})

export const {
  setSelectedProduct,
  setSelectedCategory,
  setFilters,
  clearError,
  resetProducts,
} = inventorySlice.actions

// Selectors
export const selectProducts = (state: any) => state.inventory?.products
export const selectCategories = (state: any) => state.inventory?.categories
export const selectStockMovements = (state: any) => state.inventory?.stockMovements
export const selectSelectedProduct = (state: any) => state.inventory?.selectedProduct
export const selectSelectedCategory = (state: any) => state.inventory?.selectedCategory
export const selectInventoryLoading = (state: any) => state.inventory?.loading
export const selectInventoryError = (state: any) => state.inventory?.error
export const selectInventoryPagination = (state: any) => state.inventory?.pagination
export const selectInventoryFilters = (state: any) => state.inventory?.filters

export default inventorySlice.reducer