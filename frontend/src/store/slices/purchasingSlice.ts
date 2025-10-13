import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Supplier, PurchaseOrder, GoodsReceivedNote } from '@/types'
import { purchasingApi } from '@/services/purchasingApi'

interface PurchasingState {
  suppliers: Supplier[]
  purchaseOrders: PurchaseOrder[]
  goodsReceivedNotes: GoodsReceivedNote[]
  deletedGRNs: GoodsReceivedNote[]
  selectedSupplier: Supplier | null
  selectedPurchaseOrder: PurchaseOrder | null
  selectedGRN: GoodsReceivedNote | null
  loading: {
    suppliers: boolean
    purchaseOrders: boolean
    goodsReceivedNotes: boolean
    deletedGRNs: boolean
  }
  error: string | null
  pagination: {
    suppliers: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
    purchaseOrders: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
    goodsReceivedNotes: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  }
}

const initialState: PurchasingState = {
  suppliers: [],
  purchaseOrders: [],
  goodsReceivedNotes: [],
  deletedGRNs: [],
  selectedSupplier: null,
  selectedPurchaseOrder: null,
  selectedGRN: null,
  loading: {
    suppliers: false,
    purchaseOrders: false,
    goodsReceivedNotes: false,
    deletedGRNs: false,
  },
  error: null,
  pagination: {
    suppliers: { page: 1, limit: 20, total: 0, totalPages: 0 },
    purchaseOrders: { page: 1, limit: 20, total: 0, totalPages: 0 },
    goodsReceivedNotes: { page: 1, limit: 20, total: 0, totalPages: 0 },
  },
}

// Async thunks
export const fetchSuppliers = createAsyncThunk(
  'purchasing/fetchSuppliers',
  async (params: any, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.getSuppliers(params)
      return response // response is already the data from ApiService.get
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch suppliers')
    }
  }
)

export const fetchPurchaseOrders = createAsyncThunk(
  'purchasing/fetchPurchaseOrders',
  async (params: any, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.getPurchaseOrders(params)
      return response // response is already the data from ApiService.get
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch purchase orders')
    }
  }
)

export const fetchGoodsReceivedNotes = createAsyncThunk(
  'purchasing/fetchGoodsReceivedNotes',
  async (params: { page?: number; limit?: number; supplierId?: string; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc' }, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.getGoodsReceivedNotes(params)
      return response // response is already the data from ApiService.get
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch GRNs')
    }
  }
)

export const createSupplier = createAsyncThunk(
  'purchasing/createSupplier',
  async (supplierData: Partial<Supplier>, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.createSupplier(supplierData)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create supplier')
    }
  }
)

export const createPurchaseOrder = createAsyncThunk(
  'purchasing/createPurchaseOrder',
  async (orderData: Partial<PurchaseOrder>, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.createPurchaseOrder(orderData)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create purchase order')
    }
  }
)

export const createGoodsReceivedNote = createAsyncThunk(
  'purchasing/createGoodsReceivedNote',
  async (grnData: Partial<GoodsReceivedNote>, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.createGoodsReceivedNote(grnData)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create GRN')
    }
  }
)

export const fetchDeletedGRNs = createAsyncThunk(
  'purchasing/fetchDeletedGRNs',
  async (params: { page?: number; limit?: number; search?: string }, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.getDeletedGRNs(params)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch deleted GRNs')
    }
  }
)

export const restoreGRN = createAsyncThunk(
  'purchasing/restoreGRN',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.restoreGRN(id)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to restore GRN')
    }
  }
)

export const bulkRestoreGRNs = createAsyncThunk(
  'purchasing/bulkRestoreGRNs',
  async (grnIds: string[], { rejectWithValue }) => {
    try {
      const response = await purchasingApi.bulkRestoreGRNs(grnIds)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to restore GRNs')
    }
  }
)

const purchasingSlice = createSlice({
  name: 'purchasing',
  initialState,
  reducers: {
    setSelectedSupplier: (state, action: PayloadAction<Supplier | null>) => {
      state.selectedSupplier = action.payload
    },
    setSelectedPurchaseOrder: (state, action: PayloadAction<PurchaseOrder | null>) => {
      state.selectedPurchaseOrder = action.payload
    },
    setSelectedGRN: (state, action: PayloadAction<GoodsReceivedNote | null>) => {
      state.selectedGRN = action.payload
    },
    updatePurchaseOrderInPlace: (state, action: PayloadAction<PurchaseOrder>) => {
      const updatedOrder = action.payload
      // Find and update the order in the list
      const index = state.purchaseOrders.findIndex(order => order.id === updatedOrder.id)
      if (index !== -1) {
        state.purchaseOrders[index] = updatedOrder
      }
      // Update selected order if it's the same one
      if (state.selectedPurchaseOrder?.id === updatedOrder.id) {
        state.selectedPurchaseOrder = updatedOrder
      }
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    // Fetch Suppliers
    builder
      .addCase(fetchSuppliers.pending, (state) => {
        state.loading.suppliers = true
        state.error = null
      })
      .addCase(fetchSuppliers.fulfilled, (state, action) => {
        state.loading.suppliers = false
        if (action.payload) {
          // API returns { suppliers: [], total: 3, page: 1, limit: 10, ... }
          const response = action.payload as any
          state.suppliers = response.suppliers || response.data || []
          state.pagination.suppliers = response.meta || {
            page: response.page || 1,
            limit: response.limit || 20,
            total: response.total || 0,
            totalPages: response.totalPages || Math.ceil((response.total || 0) / (response.limit || 20))
          }
        }
      })
      .addCase(fetchSuppliers.rejected, (state, action) => {
        state.loading.suppliers = false
        state.error = action.payload as string
      })

    // Fetch Purchase Orders
    builder
      .addCase(fetchPurchaseOrders.pending, (state) => {
        state.loading.purchaseOrders = true
        state.error = null
      })
      .addCase(fetchPurchaseOrders.fulfilled, (state, action) => {
        state.loading.purchaseOrders = false
        if (action.payload) {
          // API returns { orders: [], total: 3, page: 1, limit: 10, ... }
          const response = action.payload as any
          state.purchaseOrders = response.orders || []
          state.pagination.purchaseOrders = {
            page: response.page || 1,
            limit: response.limit || 20,
            total: response.total || 0,
            totalPages: response.totalPages || Math.ceil((response.total || 0) / (response.limit || 20))
          }
        }
      })
      .addCase(fetchPurchaseOrders.rejected, (state, action) => {
        state.loading.purchaseOrders = false
        state.error = action.payload as string
      })

    // Fetch GRNs
    builder
      .addCase(fetchGoodsReceivedNotes.pending, (state) => {
        state.loading.goodsReceivedNotes = true
        state.error = null
      })
      .addCase(fetchGoodsReceivedNotes.fulfilled, (state, action) => {
        state.loading.goodsReceivedNotes = false
        if (action.payload) {
          // API returns { grns: [], total: 3, page: 1, limit: 10, ... }
          const response = action.payload as any
          state.goodsReceivedNotes = response.grns || []
          state.pagination.goodsReceivedNotes = {
            page: response.page || 1,
            limit: response.limit || 20,
            total: response.total || 0,
            totalPages: response.totalPages || Math.ceil((response.total || 0) / (response.limit || 20))
          }
        }
      })
      .addCase(fetchGoodsReceivedNotes.rejected, (state, action) => {
        state.loading.goodsReceivedNotes = false
        state.error = action.payload as string
      })

    // Create Supplier
    builder
      .addCase(createSupplier.fulfilled, (state, action) => {
        if (action.payload) {
          state.suppliers.unshift(action.payload)
        }
      })

    // Create Purchase Order
    builder
      .addCase(createPurchaseOrder.fulfilled, (state, action) => {
        if (action.payload) {
          state.purchaseOrders.unshift(action.payload)
          // Auto-select the newly created purchase order
          state.selectedPurchaseOrder = action.payload
        }
      })

    // Create GRN
    builder
      .addCase(createGoodsReceivedNote.fulfilled, (state, action) => {
        if (action.payload) {
          state.goodsReceivedNotes.unshift(action.payload)
        }
      })

    // Fetch Deleted GRNs
    builder
      .addCase(fetchDeletedGRNs.pending, (state) => {
        state.loading.deletedGRNs = true
        state.error = null
      })
      .addCase(fetchDeletedGRNs.fulfilled, (state, action) => {
        state.loading.deletedGRNs = false
        if (action.payload) {
          const payload = action.payload as any
          state.deletedGRNs = payload.data || payload.grns || []
        }
      })
      .addCase(fetchDeletedGRNs.rejected, (state, action) => {
        state.loading.deletedGRNs = false
        state.error = action.payload as string
      })

    // Restore GRN
    builder
      .addCase(restoreGRN.pending, (state) => {
        state.error = null
      })
      .addCase(restoreGRN.fulfilled, (state, action) => {
        // GRN will be removed from deletedGRNs when refetched
      })
      .addCase(restoreGRN.rejected, (state, action) => {
        state.error = action.payload as string
      })

    // Bulk Restore GRNs
    builder
      .addCase(bulkRestoreGRNs.pending, (state) => {
        state.error = null
      })
      .addCase(bulkRestoreGRNs.fulfilled, (state, action) => {
        // GRNs will be removed from deletedGRNs when refetched
      })
      .addCase(bulkRestoreGRNs.rejected, (state, action) => {
        state.error = action.payload as string
      })
  },
})

export const {
  setSelectedSupplier,
  setSelectedPurchaseOrder,
  setSelectedGRN,
  updatePurchaseOrderInPlace,
  clearError,
} = purchasingSlice.actions

// Selectors
export const selectSuppliers = (state: any) => state.purchasing?.suppliers
export const selectPurchaseOrders = (state: any) => state.purchasing?.purchaseOrders
export const selectGoodsReceivedNotes = (state: any) => state.purchasing?.goodsReceivedNotes
export const selectDeletedGRNs = (state: any) => state.purchasing?.deletedGRNs
export const selectGRNsState = (state: any) => ({
  goodsReceivedNotes: state.purchasing?.goodsReceivedNotes || [],
  loading: state.purchasing?.loading?.goodsReceivedNotes || false,
  error: state.purchasing?.error || null,
  pagination: state.purchasing?.pagination?.goodsReceivedNotes || { page: 1, limit: 20, total: 0, totalPages: 0 }
})
export const selectSelectedSupplier = (state: any) => state.purchasing?.selectedSupplier
export const selectSelectedPurchaseOrder = (state: any) => state.purchasing?.selectedPurchaseOrder
export const selectSelectedGRN = (state: any) => state.purchasing?.selectedGRN
export const selectPurchasingLoading = (state: any) => state.purchasing?.loading
export const selectPurchasingError = (state: any) => state.purchasing?.error
export const selectPurchasingPagination = (state: any) => state.purchasing?.pagination

export default purchasingSlice.reducer