import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { RootState } from '@/store'
import type { Customer, Invoice, Payment, SalesOrder } from '@/types'

interface SalesState {
  selectedOrder: SalesOrder | null
  selectedInvoice: Invoice | null
  selectedPayment: Payment | null
  selectedCustomer: Customer | null
  error: string | null
}

const initialState: SalesState = {
  selectedOrder: null,
  selectedInvoice: null,
  selectedPayment: null,
  selectedCustomer: null,
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
    setSelectedCustomer: (state, action: PayloadAction<Customer | null>) => {
      state.selectedCustomer = action.payload
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
  setSelectedCustomer,
  clearError,
} = salesSlice.actions

export const selectSelectedInvoice = (state: RootState) => state.sales.selectedInvoice
export const selectSelectedPayment = (state: RootState) => state.sales.selectedPayment

export default salesSlice.reducer
