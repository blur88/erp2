import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { RootState } from '@/store'
import type { Invoice, Payment, SalesOrder } from '@/types'

interface SalesState {
  selectedOrder: SalesOrder | null
  selectedInvoice: Invoice | null
  selectedPayment: Payment | null
  orderFilters: {
    search: string
    sortBy: string
    sortOrder: 'asc' | 'desc'
    dateFilter: string
    customFromDate: string
    customToDate: string
    customerId: string
    paymentStatus: string
    fulfillmentStatus: string
  }
  error: string | null
}

const initialState: SalesState = {
  selectedOrder: null,
  selectedInvoice: null,
  selectedPayment: null,
  orderFilters: {
    search: '',
    sortBy: 'orderNumber',
    sortOrder: 'asc',
    dateFilter: 'all',
    customFromDate: '',
    customToDate: '',
    customerId: 'all',
    paymentStatus: 'all',
    fulfillmentStatus: 'all',
  },
  error: null,
}

const salesSlice = createSlice({
  name: 'sales',
  initialState,
  reducers: {
    setSelectedOrder: (state, action: PayloadAction<SalesOrder | null>) => {
      state.selectedOrder = action.payload
    },
    setSelectedInvoice: (state, action: PayloadAction<Invoice | null>) => {
      state.selectedInvoice = action.payload
    },
    setSelectedPayment: (state, action: PayloadAction<Payment | null>) => {
      state.selectedPayment = action.payload
    },
    setOrderFilters: (state, action: PayloadAction<Partial<SalesState['orderFilters']>>) => {
      state.orderFilters = { ...state.orderFilters, ...action.payload }
    },
    updateOrderInPlace: (state, action: PayloadAction<SalesOrder>) => {
      if (state.selectedOrder?.id === action.payload.id) {
        state.selectedOrder = action.payload
      }
    },
    clearError: (state) => {
      state.error = null
    },
  },
})

export const {
  setSelectedOrder,
  setSelectedInvoice,
  setSelectedPayment,
  setOrderFilters,
  updateOrderInPlace,
  clearError,
} = salesSlice.actions

export const selectSelectedOrder = (state: RootState) => state.sales.selectedOrder
export const selectSelectedInvoice = (state: RootState) => state.sales.selectedInvoice
export const selectSelectedPayment = (state: RootState) => state.sales.selectedPayment
export const selectOrderFilters = (state: RootState) => state.sales.orderFilters
export const selectSalesError = (state: RootState) => state.sales.error

export default salesSlice.reducer
