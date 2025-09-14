import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { inventoryApi } from '@/services/inventoryApi'
import { StockAdjustment, StockAdjustmentType, StockAdjustmentStatus, PaginatedResponse } from '@/types'

interface StockAdjustmentState {
  adjustments: StockAdjustment[]
  loading: boolean
  error: string | null
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  pendingCount: number
  filters: {
    search: string
    status: StockAdjustmentStatus | 'all'
    type: StockAdjustmentType | 'all'
    productId?: string
  }
}

const initialState: StockAdjustmentState = {
  adjustments: [],
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 0,
  },
  pendingCount: 0,
  filters: {
    search: '',
    status: 'all',
    type: 'all',
  },
}

// Async thunks
export const fetchStockAdjustments = createAsyncThunk(
  'stockAdjustments/fetchStockAdjustments',
  async (params?: {
    page?: number
    limit?: number
    search?: string
    status?: StockAdjustmentStatus
    type?: StockAdjustmentType
    productId?: string
  }) => {
    const response = await inventoryApi.getStockAdjustments({
      page: params?.page || 1,
      limit: params?.limit || 25,
      search: params?.search,
      status: params?.status,
      type: params?.type,
      productId: params?.productId,
      sortBy: 'createdAt',
      sortOrder: 'desc',
    })
    return response.data
  }
)

export const fetchPendingCount = createAsyncThunk(
  'stockAdjustments/fetchPendingCount',
  async () => {
    const response = await inventoryApi.getPendingAdjustmentsCount()
    return response.data.count
  }
)

export const createStockAdjustment = createAsyncThunk(
  'stockAdjustments/createStockAdjustment',
  async (data: {
    productId: string
    type: StockAdjustmentType
    adjustmentQuantity: number
    systemQuantity: number
    actualQuantity: number
    reason: string
    notes?: string
    unitCost?: number
    locationCode?: string
    binLocation?: string
    batchNumber?: string
    expiryDate?: Date
  }) => {
    const response = await inventoryApi.createStockAdjustmentAdvanced(data)
    return response.data
  }
)

export const approveStockAdjustment = createAsyncThunk(
  'stockAdjustments/approveStockAdjustment',
  async ({ id, data }: { id: string; data: { reason?: string; notes?: string } }) => {
    const response = await inventoryApi.approveStockAdjustment(id, data)
    return response.data
  }
)

export const rejectStockAdjustment = createAsyncThunk(
  'stockAdjustments/rejectStockAdjustment',
  async ({ id, data }: { id: string; data: { reason: string; notes?: string } }) => {
    const response = await inventoryApi.rejectStockAdjustment(id, data)
    return response.data
  }
)

export const cancelStockAdjustment = createAsyncThunk(
  'stockAdjustments/cancelStockAdjustment',
  async ({ id, reason }: { id: string; reason: string }) => {
    const response = await inventoryApi.cancelStockAdjustment(id, { reason })
    return response.data
  }
)

export const createBulkStockAdjustments = createAsyncThunk(
  'stockAdjustments/createBulkStockAdjustments',
  async (data: {
    adjustments: Array<{
      productId: string
      type: StockAdjustmentType
      adjustmentQuantity: number
      systemQuantity: number
      actualQuantity: number
      reason: string
      notes?: string
      unitCost?: number
      locationCode?: string
      binLocation?: string
      batchNumber?: string
      expiryDate?: Date
    }>
    globalReason?: string
    globalNotes?: string
    requiresApproval?: boolean
  }) => {
    const response = await inventoryApi.createBulkStockAdjustments(data)
    return response.data
  }
)

const stockAdjustmentSlice = createSlice({
  name: 'stockAdjustments',
  initialState,
  reducers: {
    setFilters: (state, action: PayloadAction<Partial<StockAdjustmentState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload }
    },
    setPagination: (state, action: PayloadAction<Partial<StockAdjustmentState['pagination']>>) => {
      state.pagination = { ...state.pagination, ...action.payload }
    },
    clearError: (state) => {
      state.error = null
    },
    resetState: () => initialState,
  },
  extraReducers: (builder) => {
    builder
      // Fetch stock adjustments
      .addCase(fetchStockAdjustments.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchStockAdjustments.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          state.adjustments = action.payload.data || []
          state.pagination = {
            page: action.payload.meta?.page || 1,
            limit: action.payload.meta?.limit || 25,
            total: action.payload.meta?.total || 0,
            totalPages: action.payload.meta?.totalPages || 0,
          }
        }
      })
      .addCase(fetchStockAdjustments.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch stock adjustments'
      })

      // Fetch pending count
      .addCase(fetchPendingCount.fulfilled, (state, action) => {
        state.pendingCount = action.payload
      })

      // Create stock adjustment
      .addCase(createStockAdjustment.fulfilled, (state, action) => {
        if (action.payload) {
          state.adjustments.unshift(action.payload)
          if (action.payload.status === StockAdjustmentStatus.PENDING_APPROVAL) {
            state.pendingCount += 1
          }
        }
      })

      // Approve stock adjustment
      .addCase(approveStockAdjustment.fulfilled, (state, action) => {
        if (action.payload) {
          const index = state.adjustments.findIndex(adj => adj.id === action.payload.id)
          if (index !== -1) {
            state.adjustments[index] = action.payload
            if (action.payload.status === StockAdjustmentStatus.APPROVED) {
              state.pendingCount = Math.max(0, state.pendingCount - 1)
            }
          }
        }
      })

      // Reject stock adjustment
      .addCase(rejectStockAdjustment.fulfilled, (state, action) => {
        if (action.payload) {
          const index = state.adjustments.findIndex(adj => adj.id === action.payload.id)
          if (index !== -1) {
            state.adjustments[index] = action.payload
            if (action.payload.status === StockAdjustmentStatus.REJECTED) {
              state.pendingCount = Math.max(0, state.pendingCount - 1)
            }
          }
        }
      })

      // Cancel stock adjustment
      .addCase(cancelStockAdjustment.fulfilled, (state, action) => {
        if (action.payload) {
          const index = state.adjustments.findIndex(adj => adj.id === action.payload.id)
          if (index !== -1) {
            state.adjustments[index] = action.payload
            if (action.payload.status === StockAdjustmentStatus.CANCELLED) {
              state.pendingCount = Math.max(0, state.pendingCount - 1)
            }
          }
        }
      })

      // Create bulk stock adjustments
      .addCase(createBulkStockAdjustments.fulfilled, (state, action) => {
        if (action.payload && Array.isArray(action.payload)) {
          state.adjustments.unshift(...action.payload)
          const pendingAdjustments = action.payload.filter(
            adj => adj.status === StockAdjustmentStatus.PENDING_APPROVAL
          )
          state.pendingCount += pendingAdjustments.length
        }
      })
  },
})

export const { setFilters, setPagination, clearError, resetState } = stockAdjustmentSlice.actions

// Selectors
export const selectStockAdjustments = (state: { stockAdjustments: StockAdjustmentState }) => 
  state.stockAdjustments.adjustments
export const selectStockAdjustmentsLoading = (state: { stockAdjustments: StockAdjustmentState }) => 
  state.stockAdjustments.loading
export const selectStockAdjustmentsError = (state: { stockAdjustments: StockAdjustmentState }) => 
  state.stockAdjustments.error
export const selectStockAdjustmentsPagination = (state: { stockAdjustments: StockAdjustmentState }) => 
  state.stockAdjustments.pagination
export const selectStockAdjustmentsPendingCount = (state: { stockAdjustments: StockAdjustmentState }) => 
  state.stockAdjustments.pendingCount
export const selectStockAdjustmentsFilters = (state: { stockAdjustments: StockAdjustmentState }) => 
  state.stockAdjustments.filters

export default stockAdjustmentSlice.reducer