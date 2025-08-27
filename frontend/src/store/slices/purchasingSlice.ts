import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Supplier, PurchaseOrder, GoodsReceivedNote } from '@/types'
import { purchasingApi } from '@/services/purchasingApi'

interface PurchasingState {
  suppliers: Supplier[]
  purchaseOrders: PurchaseOrder[]
  goodsReceivedNotes: GoodsReceivedNote[]
  selectedSupplier: Supplier | null
  selectedPurchaseOrder: PurchaseOrder | null
  selectedGRN: GoodsReceivedNote | null
  loading: {
    suppliers: boolean
    purchaseOrders: boolean
    goodsReceivedNotes: boolean
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
  selectedSupplier: null,
  selectedPurchaseOrder: null,
  selectedGRN: null,
  loading: {
    suppliers: false,
    purchaseOrders: false,
    goodsReceivedNotes: false,
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
  async (params: { page?: number; limit?: number; search?: string }, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.getSuppliers(params)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch suppliers')
    }
  }
)

export const fetchPurchaseOrders = createAsyncThunk(
  'purchasing/fetchPurchaseOrders',
  async (params: { page?: number; limit?: number; supplierId?: string; status?: string }, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.getPurchaseOrders(params)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch purchase orders')
    }
  }
)

export const fetchGoodsReceivedNotes = createAsyncThunk(
  'purchasing/fetchGoodsReceivedNotes',
  async (params: { page?: number; limit?: number; supplierId?: string }, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.getGoodsReceivedNotes(params)
      return response.data
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
        state.suppliers = action.payload.data
        state.pagination.suppliers = action.payload.meta
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
        state.purchaseOrders = action.payload.data
        state.pagination.purchaseOrders = action.payload.meta
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
        state.goodsReceivedNotes = action.payload.data
        state.pagination.goodsReceivedNotes = action.payload.meta
      })
      .addCase(fetchGoodsReceivedNotes.rejected, (state, action) => {
        state.loading.goodsReceivedNotes = false
        state.error = action.payload as string
      })

    // Create Supplier
    builder
      .addCase(createSupplier.fulfilled, (state, action) => {
        state.suppliers.unshift(action.payload)
      })

    // Create Purchase Order
    builder
      .addCase(createPurchaseOrder.fulfilled, (state, action) => {
        state.purchaseOrders.unshift(action.payload)
      })

    // Create GRN
    builder
      .addCase(createGoodsReceivedNote.fulfilled, (state, action) => {
        state.goodsReceivedNotes.unshift(action.payload)
      })
  },
})

export const {
  setSelectedSupplier,
  setSelectedPurchaseOrder,
  setSelectedGRN,
  clearError,
} = purchasingSlice.actions

// Selectors
export const selectSuppliers = (state: { purchasing: PurchasingState }) => state.purchasing.suppliers
export const selectPurchaseOrders = (state: { purchasing: PurchasingState }) => state.purchasing.purchaseOrders
export const selectGoodsReceivedNotes = (state: { purchasing: PurchasingState }) => state.purchasing.goodsReceivedNotes
export const selectSelectedSupplier = (state: { purchasing: PurchasingState }) => state.purchasing.selectedSupplier
export const selectSelectedPurchaseOrder = (state: { purchasing: PurchasingState }) => state.purchasing.selectedPurchaseOrder
export const selectSelectedGRN = (state: { purchasing: PurchasingState }) => state.purchasing.selectedGRN
export const selectPurchasingLoading = (state: { purchasing: PurchasingState }) => state.purchasing.loading
export const selectPurchasingError = (state: { purchasing: PurchasingState }) => state.purchasing.error
export const selectPurchasingPagination = (state: { purchasing: PurchasingState }) => state.purchasing.pagination

export default purchasingSlice.reducer