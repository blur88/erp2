import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Supplier, PurchaseOrder, GoodsReceivedNote, VendorPayment } from '@/types'
import { purchasingApi } from '@/services/purchasingApi'
import { updateSupplier } from './supplierSlice'

interface PurchasingState {
  suppliers: Supplier[]
  purchaseOrders: PurchaseOrder[]
  goodsReceivedNotes: GoodsReceivedNote[]
  deletedGRNs: GoodsReceivedNote[]
  vendorPayments: VendorPayment[]
  deletedVendorPayments: VendorPayment[]
  selectedSupplier: Supplier | null
  selectedPurchaseOrder: PurchaseOrder | null
  selectedGRN: GoodsReceivedNote | null
  selectedVendorPayment: VendorPayment | null
  supplierUpdateTimestamp: number | null
  loading: {
    suppliers: boolean
    purchaseOrders: boolean
    goodsReceivedNotes: boolean
    deletedGRNs: boolean
    vendorPayments: boolean
    deletedVendorPayments: boolean
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
    vendorPayments: {
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
  vendorPayments: [],
  deletedVendorPayments: [],
  selectedSupplier: null,
  selectedPurchaseOrder: null,
  selectedGRN: null,
  selectedVendorPayment: null,
  supplierUpdateTimestamp: null,
  loading: {
    suppliers: false,
    purchaseOrders: false,
    goodsReceivedNotes: false,
    deletedGRNs: false,
    vendorPayments: false,
    deletedVendorPayments: false,
  },
  error: null,
  pagination: {
    suppliers: { page: 1, limit: 20, total: 0, totalPages: 0 },
    purchaseOrders: { page: 1, limit: 20, total: 0, totalPages: 0 },
    goodsReceivedNotes: { page: 1, limit: 20, total: 0, totalPages: 0 },
    vendorPayments: { page: 1, limit: 20, total: 0, totalPages: 0 },
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
      return response // response is already the data from ApiService.post
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
      return response // response is already the data from ApiService.post
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create purchase order')
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

// Vendor Payments thunks
export const fetchVendorPayments = createAsyncThunk(
  'purchasing/fetchVendorPayments',
  async (params: any, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.getVendorPayments(params)
      return response
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || error.message || 'Failed to fetch vendor payments'
      return rejectWithValue(errorMessage)
    }
  }
)

export const fetchDeletedVendorPayments = createAsyncThunk(
  'purchasing/fetchDeletedVendorPayments',
  async (params: { page?: number; limit?: number; search?: string }, { rejectWithValue }) => {
    try {
      const response = await purchasingApi.getDeletedVendorPayments(params)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch deleted vendor payments')
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
    setSelectedVendorPayment: (state, action: PayloadAction<VendorPayment | null>) => {
      state.selectedVendorPayment = action.payload
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

      // Mark GRNs for refetch by setting a flag
      // The GRN page should check this flag and refetch if needed
      // Note: We can't fully update the GRN here because the PO response
      // only includes a summary without full item details
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

    // Fetch Vendor Payments
    builder
      .addCase(fetchVendorPayments.pending, (state) => {
        state.loading.vendorPayments = true
        state.error = null
      })
      .addCase(fetchVendorPayments.fulfilled, (state, action) => {
        state.loading.vendorPayments = false
        if (action.payload) {
          const response = action.payload as any
          state.vendorPayments = response.data || response.payments || []
          state.pagination.vendorPayments = {
            page: response.page || 1,
            limit: response.limit || 20,
            total: response.total || 0,
            totalPages: response.totalPages || Math.ceil((response.total || 0) / (response.limit || 20))
          }
        }
      })
      .addCase(fetchVendorPayments.rejected, (state, action) => {
        state.loading.vendorPayments = false
        state.error = action.payload as string
      })

    // Fetch Deleted Vendor Payments
    builder
      .addCase(fetchDeletedVendorPayments.pending, (state) => {
        state.loading.deletedVendorPayments = true
        state.error = null
      })
      .addCase(fetchDeletedVendorPayments.fulfilled, (state, action) => {
        state.loading.deletedVendorPayments = false
        if (action.payload) {
          const payload = action.payload as any
          state.deletedVendorPayments = payload.data || payload.payments || []
        }
      })
      .addCase(fetchDeletedVendorPayments.rejected, (state, action) => {
        state.loading.deletedVendorPayments = false
        state.error = action.payload as string
      })

    // Listen to supplier updates from supplierSlice to update purchase orders
    builder.addCase(updateSupplier.fulfilled, (state, action) => {
      if (!action.payload) return

      const updatedSupplier = action.payload

      // Set timestamp to trigger refetch on pages
      state.supplierUpdateTimestamp = Date.now()

      // Update supplier in purchase orders list
      state.purchaseOrders = state.purchaseOrders.map(po => {
        if (po.supplier?.id === (updatedSupplier as any).id) {
          return {
            ...po,
            supplier: {
              ...po.supplier,
              companyName: (updatedSupplier as any).companyName || po.supplier.companyName,
              contactPerson: (updatedSupplier as any).contactPerson,
              phone: (updatedSupplier as any).phone,
            }
          }
        }
        return po
      })

      // Update supplier in selected purchase order
      if (state.selectedPurchaseOrder?.supplier?.id === (updatedSupplier as any).id) {
        state.selectedPurchaseOrder = {
          ...state.selectedPurchaseOrder,
          supplier: {
            ...state.selectedPurchaseOrder.supplier,
            companyName: (updatedSupplier as any).companyName || state.selectedPurchaseOrder.supplier.companyName,
            contactPerson: (updatedSupplier as any).contactPerson,
            phone: (updatedSupplier as any).phone,
          }
        }
      }

      // Update supplier in GRNs list
      state.goodsReceivedNotes = state.goodsReceivedNotes.map(grn => {
        if (grn.supplier?.id === (updatedSupplier as any).id) {
          return {
            ...grn,
            supplier: {
              ...grn.supplier,
              companyName: (updatedSupplier as any).companyName || grn.supplier.companyName,
              contactPerson: (updatedSupplier as any).contactPerson,
              phone: (updatedSupplier as any).phone,
            }
          }
        }
        return grn
      })

      // Update supplier in selected GRN
      if (state.selectedGRN?.supplier?.id === (updatedSupplier as any).id) {
        state.selectedGRN = {
          ...state.selectedGRN,
          supplier: {
            ...state.selectedGRN.supplier,
            companyName: (updatedSupplier as any).companyName || state.selectedGRN.supplier.companyName,
            contactPerson: (updatedSupplier as any).contactPerson,
            phone: (updatedSupplier as any).phone,
          }
        }
      }

      // Update supplier in vendor payments list
      state.vendorPayments = state.vendorPayments.map(vp => {
        if (vp.supplier?.id === (updatedSupplier as any).id) {
          return {
            ...vp,
            supplier: {
              ...vp.supplier,
              companyName: (updatedSupplier as any).companyName || vp.supplier.companyName,
              contactPerson: (updatedSupplier as any).contactPerson,
              phone: (updatedSupplier as any).phone,
            }
          }
        }
        return vp
      })

      // Update supplier in selected vendor payment
      if (state.selectedVendorPayment?.supplier?.id === (updatedSupplier as any).id) {
        state.selectedVendorPayment = {
          ...state.selectedVendorPayment,
          supplier: {
            ...state.selectedVendorPayment.supplier,
            companyName: (updatedSupplier as any).companyName || state.selectedVendorPayment.supplier.companyName,
            contactPerson: (updatedSupplier as any).contactPerson,
            phone: (updatedSupplier as any).phone,
          }
        }
      }
    })
  },
})

export const {
  setSelectedSupplier,
  setSelectedPurchaseOrder,
  setSelectedGRN,
  setSelectedVendorPayment,
  updatePurchaseOrderInPlace,
  clearError,
} = purchasingSlice.actions

// Selectors
export const selectSuppliers = (state: any) => state.purchasing?.suppliers
export const selectPurchaseOrders = (state: any) => state.purchasing?.purchaseOrders
export const selectDeletedGRNs = (state: any) => state.purchasing?.deletedGRNs
export const selectDeletedVendorPayments = (state: any) => state.purchasing?.deletedVendorPayments
export const selectGRNsState = (state: any) => ({
  goodsReceivedNotes: state.purchasing?.goodsReceivedNotes || [],
  loading: state.purchasing?.loading?.goodsReceivedNotes || false,
  error: state.purchasing?.error || null,
  pagination: state.purchasing?.pagination?.goodsReceivedNotes || { page: 1, limit: 20, total: 0, totalPages: 0 }
})
export const selectVendorPaymentsState = (state: any) => ({
  vendorPayments: state.purchasing?.vendorPayments || [],
  loading: state.purchasing?.loading?.vendorPayments || false,
  error: state.purchasing?.error || null,
  pagination: state.purchasing?.pagination?.vendorPayments || { page: 1, limit: 20, total: 0, totalPages: 0 }
})
export const selectSelectedPurchaseOrder = (state: any) => state.purchasing?.selectedPurchaseOrder
export const selectSelectedGRN = (state: any) => state.purchasing?.selectedGRN
export const selectSelectedVendorPayment = (state: any) => state.purchasing?.selectedVendorPayment
export const selectPurchasingLoading = (state: any) => state.purchasing?.loading
export const selectPurchasingError = (state: any) => state.purchasing?.error
export const selectPurchasingPagination = (state: any) => state.purchasing?.pagination
export const selectSupplierUpdateTimestamp = (state: any) => state.purchasing?.supplierUpdateTimestamp

export default purchasingSlice.reducer
