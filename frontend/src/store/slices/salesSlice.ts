import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Customer, SalesOrder, Invoice, Payment } from '@/types'
import { salesApi } from '@/services/salesApi'

interface SalesState {
  customers: Customer[]
  orders: SalesOrder[]
  invoices: Invoice[]
  payments: Payment[]
  selectedCustomer: Customer | null
  selectedOrder: SalesOrder | null
  selectedInvoice: Invoice | null
  loading: {
    customers: boolean
    orders: boolean
    invoices: boolean
    payments: boolean
  }
  error: string | null
  pagination: {
    customers: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
    orders: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
    invoices: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
    payments: {
      page: number
      limit: number
      total: number
      totalPages: number
    }
  }
}

const initialState: SalesState = {
  customers: [],
  orders: [],
  invoices: [],
  payments: [],
  selectedCustomer: null,
  selectedOrder: null,
  selectedInvoice: null,
  loading: {
    customers: false,
    orders: false,
    invoices: false,
    payments: false,
  },
  error: null,
  pagination: {
    customers: { page: 1, limit: 20, total: 0, totalPages: 0 },
    orders: { page: 1, limit: 20, total: 0, totalPages: 0 },
    invoices: { page: 1, limit: 20, total: 0, totalPages: 0 },
    payments: { page: 1, limit: 20, total: 0, totalPages: 0 },
  },
}

// Async thunks
export const fetchCustomers = createAsyncThunk(
  'sales/fetchCustomers',
  async (params: { page?: number; limit?: number; search?: string }, { rejectWithValue }) => {
    try {
      const response = await salesApi.getCustomers(params)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch customers')
    }
  }
)

export const fetchOrders = createAsyncThunk(
  'sales/fetchOrders',
  async (params: { page?: number; limit?: number; customerId?: string; status?: string }, { rejectWithValue }) => {
    try {
      const response = await salesApi.getOrders(params)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch orders')
    }
  }
)

export const fetchInvoices = createAsyncThunk(
  'sales/fetchInvoices',
  async (params: { page?: number; limit?: number; customerId?: string; status?: string }, { rejectWithValue }) => {
    try {
      const response = await salesApi.getInvoices(params)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch invoices')
    }
  }
)

export const fetchPayments = createAsyncThunk(
  'sales/fetchPayments',
  async (params: { page?: number; limit?: number; customerId?: string }, { rejectWithValue }) => {
    try {
      const response = await salesApi.getPayments(params)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch payments')
    }
  }
)

export const createCustomer = createAsyncThunk(
  'sales/createCustomer',
  async (customerData: Partial<Customer>, { rejectWithValue }) => {
    try {
      const response = await salesApi.createCustomer(customerData)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create customer')
    }
  }
)

export const createOrder = createAsyncThunk(
  'sales/createOrder',
  async (orderData: Partial<SalesOrder>, { rejectWithValue }) => {
    try {
      const response = await salesApi.createOrder(orderData)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create order')
    }
  }
)

export const createInvoice = createAsyncThunk(
  'sales/createInvoice',
  async (invoiceData: Partial<Invoice>, { rejectWithValue }) => {
    try {
      const response = await salesApi.createInvoice(invoiceData)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create invoice')
    }
  }
)

export const recordPayment = createAsyncThunk(
  'sales/recordPayment',
  async (paymentData: Partial<Payment>, { rejectWithValue }) => {
    try {
      const response = await salesApi.recordPayment(paymentData)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to record payment')
    }
  }
)

const salesSlice = createSlice({
  name: 'sales',
  initialState,
  reducers: {
    setSelectedCustomer: (state, action: PayloadAction<Customer | null>) => {
      state.selectedCustomer = action.payload
    },
    setSelectedOrder: (state, action: PayloadAction<SalesOrder | null>) => {
      state.selectedOrder = action.payload
    },
    setSelectedInvoice: (state, action: PayloadAction<Invoice | null>) => {
      state.selectedInvoice = action.payload
    },
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    // Fetch Customers
    builder
      .addCase(fetchCustomers.pending, (state) => {
        state.loading.customers = true
        state.error = null
      })
      .addCase(fetchCustomers.fulfilled, (state, action) => {
        state.loading.customers = false
        if (action.payload) {
          state.customers = action.payload.data
          state.pagination.customers = action.payload.meta
        }
      })
      .addCase(fetchCustomers.rejected, (state, action) => {
        state.loading.customers = false
        state.error = action.payload as string
      })

    // Fetch Orders
    builder
      .addCase(fetchOrders.pending, (state) => {
        state.loading.orders = true
        state.error = null
      })
      .addCase(fetchOrders.fulfilled, (state, action) => {
        state.loading.orders = false
        if (action.payload) {
          state.orders = action.payload.data
          state.pagination.orders = action.payload.meta
        }
      })
      .addCase(fetchOrders.rejected, (state, action) => {
        state.loading.orders = false
        state.error = action.payload as string
      })

    // Fetch Invoices
    builder
      .addCase(fetchInvoices.pending, (state) => {
        state.loading.invoices = true
        state.error = null
      })
      .addCase(fetchInvoices.fulfilled, (state, action) => {
        state.loading.invoices = false
        if (action.payload) {
          state.invoices = action.payload.data
          state.pagination.invoices = action.payload.meta
        }
      })
      .addCase(fetchInvoices.rejected, (state, action) => {
        state.loading.invoices = false
        state.error = action.payload as string
      })

    // Fetch Payments
    builder
      .addCase(fetchPayments.pending, (state) => {
        state.loading.payments = true
        state.error = null
      })
      .addCase(fetchPayments.fulfilled, (state, action) => {
        state.loading.payments = false
        if (action.payload) {
          state.payments = action.payload.data
          state.pagination.payments = action.payload.meta
        }
      })
      .addCase(fetchPayments.rejected, (state, action) => {
        state.loading.payments = false
        state.error = action.payload as string
      })

    // Create Customer
    builder
      .addCase(createCustomer.fulfilled, (state, action) => {
        if (action.payload) {
          state.customers.unshift(action.payload)
        }
      })

    // Create Order
    builder
      .addCase(createOrder.fulfilled, (state, action) => {
        if (action.payload) {
          state.orders.unshift(action.payload)
        }
      })

    // Create Invoice
    builder
      .addCase(createInvoice.fulfilled, (state, action) => {
        if (action.payload) {
          state.invoices.unshift(action.payload)
        }
      })

    // Record Payment
    builder
      .addCase(recordPayment.fulfilled, (state, action) => {
        if (action.payload) {
          state.payments.unshift(action.payload)
        }
      })
  },
})

export const {
  setSelectedCustomer,
  setSelectedOrder,
  setSelectedInvoice,
  clearError,
} = salesSlice.actions

// Selectors
export const selectCustomers = (state: { sales: SalesState }) => state.sales.customers
export const selectOrders = (state: { sales: SalesState }) => state.sales.orders
export const selectInvoices = (state: { sales: SalesState }) => state.sales.invoices
export const selectPayments = (state: { sales: SalesState }) => state.sales.payments
export const selectSelectedCustomer = (state: { sales: SalesState }) => state.sales.selectedCustomer
export const selectSelectedOrder = (state: { sales: SalesState }) => state.sales.selectedOrder
export const selectSelectedInvoice = (state: { sales: SalesState }) => state.sales.selectedInvoice
export const selectSalesLoading = (state: { sales: SalesState }) => state.sales.loading
export const selectSalesError = (state: { sales: SalesState }) => state.sales.error
export const selectSalesPagination = (state: { sales: SalesState }) => state.sales.pagination

export default salesSlice.reducer