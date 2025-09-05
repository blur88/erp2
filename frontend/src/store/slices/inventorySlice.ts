import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Product, Category, StockMovement, PaginatedResponse } from '@/types'
import { inventoryApi } from '@/services/inventoryApi'

interface InventoryState {
  products: Product[]
  deletedProducts: Product[]
  categories: Category[]
  deletedCategories: Category[]
  stockMovements: StockMovement[]
  selectedProduct: Product | null
  selectedCategory: Category | null
  loading: {
    products: boolean
    deletedProducts: boolean
    categories: boolean
    deletedCategories: boolean
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
  deletedProducts: [],
  categories: [],
  deletedCategories: [],
  stockMovements: [],
  selectedProduct: null,
  selectedCategory: null,
  loading: {
    products: false,
    deletedProducts: false,
    categories: false,
    deletedCategories: false,
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
      // Always fetch only active products (exclude soft-deleted products)
      const response = await inventoryApi.getProducts({ ...params, isActive: true })
      return response.data || { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } }
    } catch (error: any) {
      console.error('Failed to fetch products:', error)
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch products')
    }
  }
)

export const fetchCategories = createAsyncThunk(
  'inventory/fetchCategories',
  async (params: { includeProductCount?: boolean } = {}, { rejectWithValue }) => {
    try {
      const response = await inventoryApi.getCategories({ includeProductCount: true, ...params })
      return response.data || { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } }
    } catch (error: any) {
      console.error('Failed to fetch categories:', error)
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

export const fetchDeletedProducts = createAsyncThunk(
  'inventory/fetchDeletedProducts',
  async (params: { page?: number; limit?: number; search?: string; categoryId?: string }, { rejectWithValue }) => {
    try {
      const response = await inventoryApi.getDeletedProducts(params)
      return response.data || { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } }
    } catch (error: any) {
      console.error('Failed to fetch deleted products:', error)
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch deleted products')
    }
  }
)

export const restoreProduct = createAsyncThunk(
  'inventory/restoreProduct',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await inventoryApi.restoreProduct(id)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to restore product')
    }
  }
)

export const permanentDeleteProduct = createAsyncThunk(
  'inventory/permanentDeleteProduct',
  async (id: string, { rejectWithValue }) => {
    try {
      await inventoryApi.permanentDeleteProduct(id)
      return id
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to permanently delete product')
    }
  }
)

export const bulkPermanentDeleteProducts = createAsyncThunk(
  'inventory/bulkPermanentDeleteProducts',
  async (productIds: string[], { rejectWithValue }) => {
    try {
      const response = await inventoryApi.bulkPermanentDeleteProducts(productIds)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to bulk delete products')
    }
  }
)

export const checkProductDuplicate = createAsyncThunk(
  'inventory/checkProductDuplicate',
  async (params: { name?: string; barcode?: string; excludeId?: string }, { rejectWithValue }) => {
    try {
      const response = await inventoryApi.checkProductDuplicate(params)
      // Handle both direct response and wrapped response structures
      if (response && typeof response === 'object' && 'nameExists' in response) {
        return response as any
      } else if (response && 'data' in response) {
        return (response as any).data
      }
      return response as any
    } catch (error: any) {
      console.error('Redux: API call failed:', error)
      return rejectWithValue(error.response?.data?.message || 'Failed to check for duplicates')
    }
  }
)

// Category CRUD operations
export const createCategory = createAsyncThunk(
  'inventory/createCategory',
  async (categoryData: Partial<Category>, { rejectWithValue, dispatch }) => {
    try {
      const response = await inventoryApi.createCategory(categoryData)
      // Automatically refresh categories to get updated hierarchical data
      dispatch(fetchCategories({ includeProductCount: true }))
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create category')
    }
  }
)

export const updateCategory = createAsyncThunk(
  'inventory/updateCategory',
  async ({ id, data }: { id: string; data: Partial<Category> }, { rejectWithValue, dispatch }) => {
    try {
      const response = await inventoryApi.updateCategory(id, data)
      // Automatically refresh categories to get updated hierarchical data
      dispatch(fetchCategories({ includeProductCount: true }))
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update category')
    }
  }
)

export const deleteCategory = createAsyncThunk(
  'inventory/deleteCategory',
  async (id: string, { rejectWithValue, dispatch }) => {
    try {
      await inventoryApi.deleteCategory(id)
      // Automatically refresh categories to get updated hierarchical data
      dispatch(fetchCategories({ includeProductCount: true }))
      return id
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete category')
    }
  }
)

export const fetchDeletedCategories = createAsyncThunk(
  'inventory/fetchDeletedCategories',
  async (params: { page?: number; limit?: number }, { rejectWithValue }) => {
    try {
      const response = await inventoryApi.getDeletedCategories(params)
      return response.data || { data: [], meta: { page: 1, limit: 10, total: 0, totalPages: 0 } }
    } catch (error: any) {
      console.error('Failed to fetch deleted categories:', error)
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch deleted categories')
    }
  }
)

export const restoreCategory = createAsyncThunk(
  'inventory/restoreCategory',
  async (id: string, { rejectWithValue, dispatch }) => {
    try {
      const response = await inventoryApi.restoreCategory(id)
      // Automatically refresh both active and deleted categories
      dispatch(fetchCategories({ includeProductCount: true }))
      dispatch(fetchDeletedCategories({}))
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to restore category')
    }
  }
)

export const permanentDeleteCategory = createAsyncThunk(
  'inventory/permanentDeleteCategory',
  async (id: string, { rejectWithValue, dispatch }) => {
    try {
      await inventoryApi.permanentDeleteCategory(id)
      // Automatically refresh deleted categories
      dispatch(fetchDeletedCategories({}))
      return id
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to permanently delete category')
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
          state.products = action.payload.data || []
          state.pagination.products = action.payload.meta || {
            page: 1, limit: 20, total: 0, totalPages: 0
          }
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
          state.categories = action.payload.data || []
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
      .addCase(createProduct.rejected, (state, action) => {
        state.error = action.payload as string
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
      .addCase(updateProduct.rejected, (state, action) => {
        state.error = action.payload as string
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

    // Fetch Deleted Products
    builder
      .addCase(fetchDeletedProducts.pending, (state) => {
        state.loading.deletedProducts = true
        state.error = null
      })
      .addCase(fetchDeletedProducts.fulfilled, (state, action) => {
        state.loading.deletedProducts = false
        if (action.payload) {
          state.deletedProducts = action.payload.data || []
        }
      })
      .addCase(fetchDeletedProducts.rejected, (state, action) => {
        state.loading.deletedProducts = false
        state.error = action.payload as string
      })

    // Restore Product
    builder
      .addCase(restoreProduct.fulfilled, (state, action) => {
        if (action.payload) {
          // Remove from deleted products and add to active products
          state.deletedProducts = state.deletedProducts.filter(p => p.id !== action.payload.id)
          state.products.unshift(action.payload)
        }
      })

    // Permanent Delete Product
    builder
      .addCase(permanentDeleteProduct.fulfilled, (state, action) => {
        if (action.payload) {
          // Remove from deleted products list
          state.deletedProducts = state.deletedProducts.filter(p => p.id !== action.payload)
        }
      })
      .addCase(bulkPermanentDeleteProducts.fulfilled, (state, action) => {
        if (action.payload) {
          const { deletedCount, failedIds } = action.payload
          // Remove successfully deleted products from deleted products list
          const successfulIds = state.deletedProducts
            .map(p => p.id)
            .filter(id => !failedIds.includes(id))
          state.deletedProducts = state.deletedProducts.filter(
            p => !successfulIds.includes(p.id)
          )
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

    // Create Category (data refreshed automatically via dispatch)
    builder
      .addCase(createCategory.fulfilled, (state, action) => {
        // Categories will be refreshed automatically via fetchCategories dispatch
      })

    // Update Category (data refreshed automatically via dispatch)  
    builder
      .addCase(updateCategory.fulfilled, (state, action) => {
        // Categories will be refreshed automatically via fetchCategories dispatch
      })

    // Delete Category (data refreshed automatically via dispatch)
    builder
      .addCase(deleteCategory.fulfilled, (state, action) => {
        // Categories will be refreshed automatically via fetchCategories dispatch
      })

    // Fetch Deleted Categories
    builder
      .addCase(fetchDeletedCategories.pending, (state) => {
        state.loading.deletedCategories = true
        state.error = null
      })
      .addCase(fetchDeletedCategories.fulfilled, (state, action) => {
        state.loading.deletedCategories = false
        if (action.payload) {
          state.deletedCategories = action.payload.data || []
        }
      })
      .addCase(fetchDeletedCategories.rejected, (state, action) => {
        state.loading.deletedCategories = false
        state.error = action.payload as string
      })

    // Restore Category (data refreshed automatically via dispatch)
    builder
      .addCase(restoreCategory.fulfilled, (state, action) => {
        // Categories will be refreshed automatically via fetchCategories dispatch
      })

    // Permanent Delete Category (data refreshed automatically via dispatch)
    builder
      .addCase(permanentDeleteCategory.fulfilled, (state, action) => {
        // Deleted categories will be refreshed automatically via fetchDeletedCategories dispatch
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
export const selectDeletedProducts = (state: any) => state.inventory?.deletedProducts
export const selectCategories = (state: any) => state.inventory?.categories
export const selectDeletedCategories = (state: any) => state.inventory?.deletedCategories
export const selectStockMovements = (state: any) => state.inventory?.stockMovements
export const selectSelectedProduct = (state: any) => state.inventory?.selectedProduct
export const selectSelectedCategory = (state: any) => state.inventory?.selectedCategory
export const selectInventoryLoading = (state: any) => state.inventory?.loading
export const selectInventoryError = (state: any) => state.inventory?.error
export const selectInventoryPagination = (state: any) => state.inventory?.pagination
export const selectInventoryFilters = (state: any) => state.inventory?.filters

export default inventorySlice.reducer