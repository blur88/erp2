import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { RootState } from '@/store'
import type { GoodsReceivedNote, PurchaseOrder, Supplier, SupplierType, VendorPayment } from '@/types'

interface PurchasingState {
  selectedPurchaseOrder: PurchaseOrder | null
  selectedGRN: GoodsReceivedNote | null
  selectedVendorPayment: VendorPayment | null
  selectedSupplier: Supplier | null
  supplierFilters: {
    search?: string
    type?: SupplierType
    status?: string
    sortBy?: string
    sortOrder?: 'ASC' | 'DESC'
    isActive?: boolean
  }
}

const initialState: PurchasingState = {
  selectedPurchaseOrder: null,
  selectedGRN: null,
  selectedVendorPayment: null,
  selectedSupplier: null,
  supplierFilters: {
    search: '',
    sortBy: 'companyName',
    sortOrder: 'ASC',
    isActive: true,
  },
}

const purchasingSlice = createSlice({
  name: 'purchasing',
  initialState,
  reducers: {
    setSelectedPurchaseOrder: (state, action: PayloadAction<PurchaseOrder | null>) => {
      state.selectedPurchaseOrder = action.payload
    },
    setSelectedGRN: (state, action: PayloadAction<GoodsReceivedNote | null>) => {
      state.selectedGRN = action.payload
    },
    setSelectedVendorPayment: (state, action: PayloadAction<VendorPayment | null>) => {
      state.selectedVendorPayment = action.payload
    },
    setSelectedSupplier: (state, action: PayloadAction<Supplier | null>) => {
      state.selectedSupplier = action.payload
    },
    updatePurchaseOrderInPlace: (state, action: PayloadAction<PurchaseOrder>) => {
      state.selectedPurchaseOrder = action.payload
    },
    setSupplierFilters: (state, action: PayloadAction<Partial<PurchasingState['supplierFilters']>>) => {
      state.supplierFilters = { ...state.supplierFilters, ...action.payload }
    },
  },
})

export const {
  setSelectedPurchaseOrder,
  setSelectedGRN,
  setSelectedVendorPayment,
  setSelectedSupplier,
  updatePurchaseOrderInPlace,
  setSupplierFilters,
} = purchasingSlice.actions

export const selectSelectedPurchaseOrder = (state: RootState) => state.purchasing.selectedPurchaseOrder
export const selectSelectedGRN = (state: RootState) => state.purchasing.selectedGRN
export const selectSelectedVendorPayment = (state: RootState) => state.purchasing.selectedVendorPayment
export default purchasingSlice.reducer
