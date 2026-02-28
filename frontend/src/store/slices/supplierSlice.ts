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
    isActive: true, // Default to showing only active suppliers
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
      return response as any
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
      return response as any
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
  },
  extraReducers: (builder) => {
    // Fetch suppliers
    builder
      .addCase(fetchSuppliers.pending, (state) => {
        console.log('🔄 fetchSuppliers.pending - loading=true')
        state.loading = true
        state.error = null
      })
      .addCase(fetchSuppliers.fulfilled, (state, action) => {
        console.log('✅ fetchSuppliers.fulfilled - payload:', action.payload)
        state.loading = false
        if (action.payload) {
          // Handle response structure: { suppliers, total, page, limit, totalPages, hasNext, hasPrev }
          const response = action.payload as any
          const newSuppliers = response.suppliers || response.data || []
          console.log('📦 Setting suppliers array, length:', newSuppliers.length)
          state.suppliers = newSuppliers
          state.pagination = {
            page: response.page || response.meta?.page || initialState.pagination.page,
            limit: response.limit || response.meta?.limit || initialState.pagination.limit,
            total: response.total || response.meta?.total || initialState.pagination.total,
            totalPages: response.totalPages || response.meta?.totalPages || initialState.pagination.totalPages,
          }
          console.log('📦 New state - suppliers:', state.suppliers.length, 'pagination:', state.pagination)
        } else {
          console.warn('⚠️ fetchSuppliers.fulfilled but no payload!')
        }
      })
      .addCase(fetchSuppliers.rejected, (state, action) => {
        console.error('❌ fetchSuppliers.rejected - error:', action.payload)
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
          const updatedSupplier = action.payload as any
          const index = state.suppliers.findIndex((s) => s.id === updatedSupplier.id)
          if (index !== -1) {
            state.suppliers[index] = updatedSupplier
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
        console.log('🔄 deleteSupplier.pending - loading=true, suppliers count:', state.suppliers.length)
        state.loading = true
        state.error = null
      })
      .addCase(deleteSupplier.fulfilled, (state) => {
        console.log('✅ deleteSupplier.fulfilled - loading=false, suppliers count:', state.suppliers.length)
        state.loading = false
        // Don't remove from state here - let the refetch handle it
        // This prevents blank page if refetch fails
      })
      .addCase(deleteSupplier.rejected, (state, action) => {
        console.error('❌ deleteSupplier.rejected - error:', action.payload)
        state.loading = false
        state.error = action.payload as string
      })

  },
})

export const { setFilters, clearError } = supplierSlice.actions

// Selectors
export const selectSuppliers = (state: any) => state.suppliers?.suppliers || []
export const selectSuppliersLoading = (state: any) => state.suppliers?.loading || false
export const selectSuppliersError = (state: any) => state.suppliers?.error
export const selectSuppliersPagination = (state: any) => state.suppliers?.pagination || initialState.pagination
export const selectSuppliersFilters = (state: any) => state.suppliers?.filters || initialState.filters

export default supplierSlice.reducer
