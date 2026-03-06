import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { RootState } from '@/store'
import type { GoodsReceivedNote, PurchaseOrder, SupplierType, VendorPayment } from '@/types'

interface PurchasingState {
  selectedPurchaseOrder: PurchaseOrder | null
  selectedGRN: GoodsReceivedNote | null
  selectedVendorPayment: VendorPayment | null
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
    updatePurchaseOrderInPlace: (state, action: PayloadAction<PurchaseOrder>) => {
      state.selectedPurchaseOrder = action.payload
    },
    setSupplierFilters: (state, action: PayloadAction<Partial<PurchasingState['supplierFilters']>>) => {
      state.supplierFilters = { ...state.supplierFilters, ...action.payload }
    },
    clearSupplierFilters: (state) => {
      state.supplierFilters = initialState.supplierFilters
    },
  },
})

export const {
  setSelectedPurchaseOrder,
  setSelectedGRN,
  setSelectedVendorPayment,
  updatePurchaseOrderInPlace,
  setSupplierFilters,
  clearSupplierFilters,
} = purchasingSlice.actions

export const selectSelectedPurchaseOrder = (state: RootState) => state.purchasing.selectedPurchaseOrder
export const selectSelectedGRN = (state: RootState) => state.purchasing.selectedGRN
export const selectSelectedVendorPayment = (state: RootState) => state.purchasing.selectedVendorPayment
export const selectSupplierFilters = (state: RootState) => state.purchasing.supplierFilters

export default purchasingSlice.reducer
