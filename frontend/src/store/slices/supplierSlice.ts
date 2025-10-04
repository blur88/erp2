import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Supplier } from '@/types'
import { purchasingApi } from '@/services/purchasingApi'

interface SupplierState {
  suppliers: Supplier[]
  loading: boolean
  error: string | null
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  filters: {
    search?: string
    type?: string
    status?: string
    rating?: string
    sortBy?: string
    sortOrder?: 'ASC' | 'DESC'
    isActive?: boolean
  }
}

const initialState: SupplierState = {
  suppliers: [],
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  },
  filters: {
    search: '',
    sortBy: 'companyName',
    sortOrder: 'ASC',
  },
}

// Async thunks
export const fetchSuppliers = createAsyncThunk(
  'suppliers/fetchSuppliers',
  async (params: any, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.getSuppliers(params)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch suppliers')
    }
  }
)

export const createSupplier = createAsyncThunk(
  'suppliers/createSupplier',
  async (data: any, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.createSupplier(data)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create supplier')
    }
  }
)

export const updateSupplier = createAsyncThunk(
  'suppliers/updateSupplier',
  async ({ id, data }: { id: string; data: any }, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.updateSupplier(id, data)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update supplier')
    }
  }
)

export const deleteSupplier = createAsyncThunk(
  'suppliers/deleteSupplier',
  async (id: string, { rejectWithValue }) => {
    try {
      await purchasingApi.deleteSupplier(id)
      return id
    } catch (error: any) {
      return rejectWithValue(error)
    }
  }
)

export const restoreSupplier = createAsyncThunk(
  'suppliers/restoreSupplier',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.restoreSupplier(id)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to restore supplier')
    }
  }
)

const supplierSlice = createSlice({
  name: 'suppliers',
  initialState,
  reducers: {
    setFilters: (state, action: PayloadAction<Partial<SupplierState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload }
    },
    clearError: (state) => {
      state.error = null
    },
    resetSuppliers: () => initialState,
  },
  extraReducers: (builder) => {
    // Fetch suppliers
    builder
      .addCase(fetchSuppliers.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchSuppliers.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          // Handle response structure: { suppliers, total, page, limit, totalPages, hasNext, hasPrev }
          const response = action.payload as any
          state.suppliers = response.suppliers || response.data || []
          state.pagination = {
            page: response.page || response.meta?.page || initialState.pagination.page,
            limit: response.limit || response.meta?.limit || initialState.pagination.limit,
            total: response.total || response.meta?.total || initialState.pagination.total,
            totalPages: response.totalPages || response.meta?.totalPages || initialState.pagination.totalPages,
          }
        }
      })
      .addCase(fetchSuppliers.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Create supplier
    builder
      .addCase(createSupplier.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createSupplier.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          state.suppliers.unshift(action.payload)
        }
      })
      .addCase(createSupplier.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Update supplier
    builder
      .addCase(updateSupplier.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateSupplier.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          const index = state.suppliers.findIndex((s) => s.id === action.payload.id)
          if (index !== -1) {
            state.suppliers[index] = action.payload
          }
        }
      })
      .addCase(updateSupplier.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Delete supplier
    builder
      .addCase(deleteSupplier.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteSupplier.fulfilled, (state, action) => {
        state.loading = false
        state.suppliers = state.suppliers.filter((s) => s.id !== action.payload)
      })
      .addCase(deleteSupplier.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Restore supplier
    builder
      .addCase(restoreSupplier.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(restoreSupplier.fulfilled, (state) => {
        state.loading = false
      })
      .addCase(restoreSupplier.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })
  },
})

export const { setFilters, clearError, resetSuppliers } = supplierSlice.actions

// Selectors
export const selectSuppliers = (state: any) => state.suppliers?.suppliers || []
export const selectSuppliersLoading = (state: any) => state.suppliers?.loading || false
export const selectSuppliersError = (state: any) => state.suppliers?.error
export const selectSuppliersPagination = (state: any) => state.suppliers?.pagination || initialState.pagination
export const selectSuppliersFilters = (state: any) => state.suppliers?.filters || initialState.filters

export default supplierSlice.reducer
