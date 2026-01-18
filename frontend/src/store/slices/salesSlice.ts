import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { Customer, SalesOrder, Invoice, Payment } from '@/types'
import { salesApi } from '@/services/salesApi'

interface SalesState {
  customers: Customer[]
  deletedCustomers: Customer[]
  orders: SalesOrder[]
  deletedOrders: SalesOrder[]
  invoices: Invoice[]
  deletedInvoices: Invoice[]
  payments: Payment[]
  deletedPayments: Payment[]
  selectedCustomer: Customer | null
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
  loading: {
    customers: boolean
    deletedCustomers: boolean
    orders: boolean
    deletedOrders: boolean
    invoices: boolean
    deletedInvoices: boolean
    payments: boolean
    deletedPayments: boolean
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
  deletedCustomers: [],
  orders: [],
  deletedOrders: [],
  invoices: [],
  deletedInvoices: [],
  payments: [],
  deletedPayments: [],
  selectedCustomer: null,
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
  loading: {
    customers: false,
    deletedCustomers: false,
    orders: false,
    deletedOrders: false,
    invoices: false,
    deletedInvoices: false,
    payments: false,
    deletedPayments: false,
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
  async (params: { page?: number; limit?: number; customerId?: string; status?: string; priority?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; search?: string; fromDate?: string; toDate?: string; paymentStatus?: string; fulfillmentStatus?: string }, { rejectWithValue }) => {
    try {
      const apiParams = {
        page: params.page,
        limit: params.limit,
        customerId: params.customerId,
        status: params.status,
        priority: params.priority,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder ? params.sortOrder.toUpperCase() as 'ASC' | 'DESC' : undefined,
        search: params.search,
        fromDate: params.fromDate,
        toDate: params.toDate,
        paymentStatus: params.paymentStatus,
        fulfillmentStatus: params.fulfillmentStatus
      }
      const response = await salesApi.getOrders(apiParams as any)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch orders')
    }
  }
)

export const fetchOrderById = createAsyncThunk(
  'sales/fetchOrderById',
  async (orderId: string, { rejectWithValue }) => {
    try {
      const response = await salesApi.getOrder(orderId)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch order details')
    }
  }
)

export const fetchDeletedOrders = createAsyncThunk(
  'sales/fetchDeletedOrders',
  async (params: { page?: number; limit?: number; customerId?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; search?: string }, { rejectWithValue }) => {
    try {
      const apiParams = {
        page: params.page,
        limit: params.limit,
        customerId: params.customerId,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder ? params.sortOrder.toUpperCase() as 'ASC' | 'DESC' : undefined,
        search: params.search
      }
      const response = await salesApi.getDeletedOrders(apiParams as any)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch deleted orders')
    }
  }
)

export const restoreOrder = createAsyncThunk(
  'sales/restoreOrder',
  async (orderId: string, { rejectWithValue }) => {
    try {
      const response = await salesApi.restoreOrder(orderId)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to restore order')
    }
  }
)

export const bulkRestoreOrders = createAsyncThunk(
  'sales/bulkRestoreOrders',
  async (orderIds: string[], { rejectWithValue }) => {
    try {
      const response = await salesApi.bulkRestoreOrders(orderIds)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to bulk restore orders')
    }
  }
)

export const bulkDeleteOrders = createAsyncThunk(
  'sales/bulkDeleteOrders',
  async (orderIds: string[], { rejectWithValue }) => {
    try {
      const response = await salesApi.bulkDeleteOrders(orderIds)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to bulk delete orders')
    }
  }
)

export const deleteOrder = createAsyncThunk(
  'sales/deleteOrder',
  async (orderId: string, { rejectWithValue }) => {
    try {
      const response = await salesApi.deleteOrder(orderId)
      // The API now returns: { data: previousOrder | null, message: string, deletedOrderNumber: string, redirect?: string }
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete order')
    }
  }
)

export const permanentDeleteOrder = createAsyncThunk(
  'sales/permanentDeleteOrder',
  async (orderId: string, { rejectWithValue }) => {
    try {
      const response = await salesApi.permanentDeleteOrder(orderId)
      return { orderId }
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to permanently delete order')
    }
  }
)

export const fetchInvoices = createAsyncThunk(
  'sales/fetchInvoices',
  async (params: { customerId?: string; status?: string; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc'; fromDate?: string; toDate?: string; page?: number; limit?: number }, { rejectWithValue }) => {
    try {
      const response = await salesApi.getInvoices(params)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch invoices')
    }
  }
)

export const fetchDeletedInvoices = createAsyncThunk(
  'sales/fetchDeletedInvoices',
  async (params: { search?: string }, { rejectWithValue }) => {
    try {
      const response = await salesApi.getDeletedInvoices(params)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch deleted invoices')
    }
  }
)

export const restoreInvoice = createAsyncThunk(
  'sales/restoreInvoice',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await salesApi.restoreInvoice(id)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to restore invoice')
    }
  }
)

export const bulkRestoreInvoices = createAsyncThunk(
  'sales/bulkRestoreInvoices',
  async (invoiceIds: string[], { rejectWithValue }) => {
    try {
      const response = await salesApi.bulkRestoreInvoices(invoiceIds)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to restore invoices')
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
      return response
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
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create order')
    }
  }
)

export const updateOrder = createAsyncThunk(
  'sales/updateOrder',
  async ({ id, orderData }: { id: string; orderData: Partial<SalesOrder> }, { rejectWithValue }) => {
    try {
      const response = await salesApi.updateOrder(id, orderData)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update order')
    }
  }
)

export const createInvoice = createAsyncThunk(
  'sales/createInvoice',
  async (invoiceData: Partial<Invoice>, { rejectWithValue }) => {
    try {
      const response = await salesApi.createInvoice(invoiceData)
      return response
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
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to record payment')
    }
  }
)

export const fetchDeletedPayments = createAsyncThunk(
  'sales/fetchDeletedPayments',
  async (params: { page?: number; limit?: number; search?: string }, { rejectWithValue }) => {
    try {
      const response = await salesApi.getDeletedPayments(params)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch deleted payments')
    }
  }
)

export const restorePayment = createAsyncThunk(
  'sales/restorePayment',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await salesApi.restorePayment(id)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to restore payment')
    }
  }
)

export const bulkRestorePayments = createAsyncThunk(
  'sales/bulkRestorePayments',
  async (paymentIds: string[], { rejectWithValue }) => {
    try {
      const response = await salesApi.bulkRestorePayments(paymentIds)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to restore payments')
    }
  }
)

export const fetchDeletedCustomers = createAsyncThunk(
  'sales/fetchDeletedCustomers',
  async (params: { page?: number; limit?: number; search?: string }, { rejectWithValue }) => {
    try {
      const response = await salesApi.getDeletedCustomers(params)
      return response.data
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch deleted customers')
    }
  }
)

export const restoreCustomer = createAsyncThunk(
  'sales/restoreCustomer',
  async (customerId: string, { rejectWithValue }) => {
    try {
      const response = await salesApi.restoreCustomer(customerId)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to restore customer')
    }
  }
)

export const bulkRestoreCustomers = createAsyncThunk(
  'sales/bulkRestoreCustomers',
  async (customerIds: string[], { rejectWithValue }) => {
    try {
      const response = await salesApi.bulkRestoreCustomers(customerIds)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to bulk restore customers')
    }
  }
)

export const permanentDeleteCustomer = createAsyncThunk(
  'sales/permanentDeleteCustomer',
  async (customerId: string, { rejectWithValue }) => {
    try {
      const response = await salesApi.permanentDeleteCustomer(customerId)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to permanently delete customer')
    }
  }
)

export const bulkPermanentDeleteCustomers = createAsyncThunk(
  'sales/bulkPermanentDeleteCustomers',
  async (customerIds: string[], { rejectWithValue }) => {
    try {
      const response = await salesApi.bulkPermanentDeleteCustomers(customerIds)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to bulk permanently delete customers')
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
    setSelectedPayment: (state, action: PayloadAction<Payment | null>) => {
      state.selectedPayment = action.payload
    },
    setOrderFilters: (state, action: PayloadAction<Partial<SalesState['orderFilters']>>) => {
      state.orderFilters = { ...state.orderFilters, ...action.payload }
    },
    updateOrderInPlace: (state, action: PayloadAction<SalesOrder>) => {
      const updatedOrder = action.payload
      // Find and update the order in the list
      const index = state.orders.findIndex(order => order.id === updatedOrder.id)
      if (index !== -1) {
        state.orders[index] = updatedOrder
      }
      // Update selected order if it's the same one
      if (state.selectedOrder?.id === updatedOrder.id) {
        state.selectedOrder = updatedOrder
      }
    },
    setCustomers: (state, action: PayloadAction<Customer[]>) => {
      state.customers = action.payload
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
          // Handle both flat structure and nested meta structure
          const payload = action.payload as any
          state.customers = payload.data || []
          
          // Check if pagination is in meta or at root level
          const paginationData = payload.meta || payload
          state.pagination.customers = {
            page: paginationData.page || 1,
            limit: paginationData.limit || 20,
            total: paginationData.total || 0,
            totalPages: paginationData.totalPages || 0
          }
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
          // Handle both flat structure (current API) and nested meta structure
          const payload = action.payload as any
          state.orders = payload.data || []
          
          // Check if pagination is in meta or at root level
          const paginationData = payload.meta || payload
          state.pagination.orders = {
            page: paginationData.page || 1,
            limit: paginationData.limit || 20,
            total: paginationData.total || 0,
            totalPages: paginationData.totalPages || 0
          }
        }
      })
      .addCase(fetchOrders.rejected, (state, action) => {
        state.loading.orders = false
        state.error = action.payload as string
      })

    // Fetch Order By ID
    builder
      .addCase(fetchOrderById.pending, (state) => {
        state.loading.orders = true
        state.error = null
      })
      .addCase(fetchOrderById.fulfilled, (state, action) => {
        state.loading.orders = false
        if (action.payload) {
          const order = (action.payload as any).data || action.payload
          // Update the order in the orders array if it exists
          const index = state.orders.findIndex(o => o.id === order.id)
          if (index >= 0) {
            state.orders[index] = order
          }
          // Update selected order if it's the same
          if (state.selectedOrder?.id === order.id) {
            state.selectedOrder = order
          }
        }
      })
      .addCase(fetchOrderById.rejected, (state, action) => {
        state.loading.orders = false
        state.error = action.payload as string
      })

    // Fetch Deleted Orders
    builder
      .addCase(fetchDeletedOrders.pending, (state) => {
        state.loading.deletedOrders = true
        state.error = null
      })
      .addCase(fetchDeletedOrders.fulfilled, (state, action) => {
        state.loading.deletedOrders = false
        if (action.payload) {
          const payload = action.payload as any
          state.deletedOrders = payload.data || []
        }
      })
      .addCase(fetchDeletedOrders.rejected, (state, action) => {
        state.loading.deletedOrders = false
        state.error = action.payload as string
      })

    // Restore Order
    builder
      .addCase(restoreOrder.pending, (state) => {
        state.error = null
      })
      .addCase(restoreOrder.fulfilled, (state, action) => {
        // Order will be removed from deletedOrders when refetched
      })
      .addCase(restoreOrder.rejected, (state, action) => {
        state.error = action.payload as string
      })

    // Bulk Restore Orders
    builder
      .addCase(bulkRestoreOrders.pending, (state) => {
        state.error = null
      })
      .addCase(bulkRestoreOrders.fulfilled, (state, action) => {
        // Orders will be removed from deletedOrders when refetched
      })
      .addCase(bulkRestoreOrders.rejected, (state, action) => {
        state.error = action.payload as string
      })

    // Delete Order (Soft Delete)
    builder
      .addCase(deleteOrder.pending, (state) => {
        state.error = null
      })
      .addCase(deleteOrder.fulfilled, (state, action) => {
        if (action.payload) {
          const payload = action.payload as any

          // Remove the deleted order from the orders list
          const deletedOrderNumber = payload.deletedOrderNumber
          state.orders = state.orders.filter(order => order.orderNumber !== deletedOrderNumber)

          // If there's a previous order, set it as the selected order
          if (payload.data) {
            state.selectedOrder = payload.data
          } else {
            // No previous order available, clear selection
            state.selectedOrder = null
          }
        }
      })
      .addCase(deleteOrder.rejected, (state, action) => {
        state.error = action.payload as string
      })

    // Bulk Delete Orders
    builder
      .addCase(bulkDeleteOrders.pending, (state) => {
        state.error = null
      })
      .addCase(bulkDeleteOrders.fulfilled, (state, action) => {
        // Orders will be removed from deletedOrders when refetched
      })
      .addCase(bulkDeleteOrders.rejected, (state, action) => {
        state.error = action.payload as string
      })
      .addCase(permanentDeleteOrder.pending, (state) => {
        state.error = null
      })
      .addCase(permanentDeleteOrder.fulfilled, (state, action) => {
        // Remove the permanently deleted order from deletedOrders
        if (action.payload && state.deletedOrders) {
          state.deletedOrders = state.deletedOrders.filter(order => order.id !== action.payload.orderId)
        }
      })
      .addCase(permanentDeleteOrder.rejected, (state, action) => {
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
          // Handle both flat structure and nested meta structure
          const payload = action.payload as any
          state.invoices = payload.data || []

          // Check if pagination is in meta or at root level
          const paginationData = payload.meta || payload
          state.pagination.invoices = {
            page: paginationData.page || 1,
            limit: paginationData.limit || 20,
            total: paginationData.total || 0,
            totalPages: paginationData.totalPages || 0
          }
        }
      })
      .addCase(fetchInvoices.rejected, (state, action) => {
        state.loading.invoices = false
        state.error = action.payload as string
      })

    // Fetch Deleted Invoices
    builder
      .addCase(fetchDeletedInvoices.pending, (state) => {
        state.loading.deletedInvoices = true
        state.error = null
      })
      .addCase(fetchDeletedInvoices.fulfilled, (state, action) => {
        state.loading.deletedInvoices = false
        if (action.payload) {
          const payload = action.payload as any
          state.deletedInvoices = payload.data || []
        }
      })
      .addCase(fetchDeletedInvoices.rejected, (state, action) => {
        state.loading.deletedInvoices = false
        state.error = action.payload as string
      })

    // Restore Invoice
    builder
      .addCase(restoreInvoice.pending, (state) => {
        state.error = null
      })
      .addCase(restoreInvoice.fulfilled, (state, action) => {
        // Invoice will be removed from deletedInvoices when refetched
      })
      .addCase(restoreInvoice.rejected, (state, action) => {
        state.error = action.payload as string
      })

    // Bulk Restore Invoices
    builder
      .addCase(bulkRestoreInvoices.pending, (state) => {
        state.error = null
      })
      .addCase(bulkRestoreInvoices.fulfilled, (state, action) => {
        // Invoices will be removed from deletedInvoices when refetched
      })
      .addCase(bulkRestoreInvoices.rejected, (state, action) => {
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
          // Handle both flat structure and nested meta structure
          const payload = action.payload as any
          state.payments = payload.data || []
          
          // Check if pagination is in meta or at root level
          const paginationData = payload.meta || payload
          state.pagination.payments = {
            page: paginationData.page || 1,
            limit: paginationData.limit || 20,
            total: paginationData.total || 0,
            totalPages: paginationData.totalPages || 0
          }
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
          const customer = (action.payload as any).data || action.payload
          state.customers.unshift(customer)
        }
      })

    // Create Order
    builder
      .addCase(createOrder.fulfilled, (state, action) => {
        if (action.payload) {
          const order = (action.payload as any).data || action.payload
          state.orders.unshift(order)
        }
      })

    // Update Order
    builder
      .addCase(updateOrder.fulfilled, (state, action) => {
        if (action.payload) {
          const order = (action.payload as any).data || action.payload
          // Find and update the order in the list
          const index = state.orders.findIndex(o => o.id === order.id)
          if (index !== -1) {
            state.orders[index] = order
          }
          // Update selected order if it's the same one
          if (state.selectedOrder?.id === order.id) {
            state.selectedOrder = order
          }
        }
      })

    // Create Invoice
    builder
      .addCase(createInvoice.fulfilled, (state, action) => {
        if (action.payload) {
          const invoice = (action.payload as any).data || action.payload
          state.invoices.unshift(invoice)
        }
      })

    // Record Payment
    builder
      .addCase(recordPayment.fulfilled, (state, action) => {
        if (action.payload) {
          const payment = (action.payload as any).data || action.payload
          state.payments.unshift(payment)
        }
      })

    // Fetch Deleted Payments
    builder
      .addCase(fetchDeletedPayments.pending, (state) => {
        state.loading.deletedPayments = true
        state.error = null
      })
      .addCase(fetchDeletedPayments.fulfilled, (state, action) => {
        state.loading.deletedPayments = false
        if (action.payload) {
          const payload = action.payload as any
          state.deletedPayments = payload.data || []
        }
      })
      .addCase(fetchDeletedPayments.rejected, (state, action) => {
        state.loading.deletedPayments = false
        state.error = action.payload as string
      })

    // Restore Payment
    builder
      .addCase(restorePayment.pending, (state) => {
        state.error = null
      })
      .addCase(restorePayment.fulfilled, (state, action) => {
        // Payment will be removed from deletedPayments when refetched
      })
      .addCase(restorePayment.rejected, (state, action) => {
        state.error = action.payload as string
      })

    // Bulk Restore Payments
    builder
      .addCase(bulkRestorePayments.pending, (state) => {
        state.error = null
      })
      .addCase(bulkRestorePayments.fulfilled, (state, action) => {
        // Payments will be removed from deletedPayments when refetched
      })
      .addCase(bulkRestorePayments.rejected, (state, action) => {
        state.error = action.payload as string
      })

    // Fetch Deleted Customers
    builder
      .addCase(fetchDeletedCustomers.pending, (state) => {
        state.loading.deletedCustomers = true
        state.error = null
      })
      .addCase(fetchDeletedCustomers.fulfilled, (state, action) => {
        state.loading.deletedCustomers = false
        if (action.payload) {
          // Handle both paginated response and direct array response
          const payload = action.payload as any
          state.deletedCustomers = payload.data || payload
        }
      })
      .addCase(fetchDeletedCustomers.rejected, (state, action) => {
        state.loading.deletedCustomers = false
        state.error = action.payload as string
      })

    // Restore Customer
    builder
      .addCase(restoreCustomer.fulfilled, (state, action) => {
        if (action.payload) {
          const customer = (action.payload as any).data || action.payload
          // Remove from deleted customers list
          state.deletedCustomers = state.deletedCustomers.filter(c => c.id !== customer.id)
          // Add to active customers list
          state.customers.unshift(customer)
        }
      })

    // Bulk Restore Customers
    builder
      .addCase(bulkRestoreCustomers.fulfilled, (_state, _action) => {
        // This will be handled by refreshing the lists
      })

    // Permanent Delete Customer
    builder
      .addCase(permanentDeleteCustomer.fulfilled, (_state, _action) => {
        // Remove from deleted customers list (action.payload should contain the deleted customer ID)
        // For permanent delete, we'll refresh the deleted customers list instead
      })

    // Bulk Permanent Delete Customers
    builder
      .addCase(bulkPermanentDeleteCustomers.fulfilled, (_state, _action) => {
        // This will be handled by refreshing the lists
      })
  },
})

export const {
  setSelectedCustomer,
  setSelectedOrder,
  setSelectedInvoice,
  setSelectedPayment,
  setOrderFilters,
  setCustomers,
  updateOrderInPlace,
  clearError,
} = salesSlice.actions

// Selectors
export const selectCustomers = (state: any) => state.sales?.customers
export const selectDeletedCustomers = (state: any) => state.sales?.deletedCustomers
export const selectOrders = (state: any) => state.sales?.orders
export const selectDeletedOrders = (state: any) => state.sales?.deletedOrders
export const selectInvoices = (state: any) => state.sales?.invoices
export const selectDeletedInvoices = (state: any) => state.sales?.deletedInvoices
export const selectInvoicesState = (state: any) => ({
  invoices: state.sales?.invoices || [],
  loading: state.sales?.loading?.invoices || false,
  error: state.sales?.error || null,
  pagination: state.sales?.pagination?.invoices || { page: 1, limit: 20, total: 0, totalPages: 0 }
})
export const selectPayments = (state: any) => state.sales?.payments
export const selectDeletedPayments = (state: any) => state.sales?.deletedPayments
export const selectSelectedCustomer = (state: any) => state.sales?.selectedCustomer
export const selectSelectedOrder = (state: any) => state.sales?.selectedOrder
export const selectSelectedInvoice = (state: any) => state.sales?.selectedInvoice
export const selectSelectedPayment = (state: any) => state.sales?.selectedPayment
export const selectOrderFilters = (state: any) => state.sales?.orderFilters
export const selectSalesLoading = (state: any) => state.sales?.loading
export const selectSalesError = (state: any) => state.sales?.error
export const selectSalesPagination = (state: any) => state.sales?.pagination

export default salesSlice.reducer