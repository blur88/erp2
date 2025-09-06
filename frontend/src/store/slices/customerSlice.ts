import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { salesApi } from '@/services/salesApi'
import type { Customer, CustomerType, CustomerStatus, PriceLevel, PaginatedResponse } from '@/types'

interface CustomerState {
  customers: Customer[]
  currentCustomer: Customer | null
  loading: boolean
  error: string | null
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  filters: {
    search?: string
    type?: CustomerType
    status?: CustomerStatus
    priceLevel?: PriceLevel
    isActive?: boolean
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }
}

const initialState: CustomerState = {
  customers: [],
  currentCustomer: null,
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
  filters: {
    sortBy: 'name',
    sortOrder: 'asc',
  }
}

// Async thunks
export const fetchCustomers = createAsyncThunk(
  'customers/fetchCustomers',
  async (params?: {
    page?: number
    limit?: number
    search?: string
    type?: CustomerType
    status?: CustomerStatus
    priceLevel?: PriceLevel
    isActive?: boolean
    sortBy?: string
    sortOrder?: 'ASC' | 'DESC'
  }) => {
    const response = await salesApi.getCustomers(params)
    return response.data
  }
)

export const fetchCustomer = createAsyncThunk(
  'customers/fetchCustomer',
  async (id: string) => {
    const response = await salesApi.getCustomer(id)
    return response.data
  }
)

export const createCustomer = createAsyncThunk(
  'customers/createCustomer',
  async (customerData: Partial<Customer>) => {
    const response = await salesApi.createCustomer(customerData)
    return response.data
  }
)

export const updateCustomer = createAsyncThunk(
  'customers/updateCustomer',
  async ({ id, data }: { id: string; data: Partial<Customer> }) => {
    const response = await salesApi.updateCustomer(id, data)
    return response.data
  }
)

export const deleteCustomer = createAsyncThunk(
  'customers/deleteCustomer',
  async (id: string) => {
    await salesApi.deleteCustomer(id)
    return id
  }
)

export const activateCustomer = createAsyncThunk(
  'customers/activateCustomer',
  async (id: string) => {
    const response = await salesApi.activateCustomer(id)
    return response.data
  }
)

export const deactivateCustomer = createAsyncThunk(
  'customers/deactivateCustomer',
  async (id: string) => {
    const response = await salesApi.deactivateCustomer(id)
    return response.data
  }
)

export const suspendCustomer = createAsyncThunk(
  'customers/suspendCustomer',
  async ({ id, reason }: { id: string; reason?: string }) => {
    const response = await salesApi.suspendCustomer(id, reason)
    return response.data
  }
)

export const updateCreditLimit = createAsyncThunk(
  'customers/updateCreditLimit',
  async ({ id, creditLimit }: { id: string; creditLimit: number }) => {
    const response = await salesApi.updateCreditLimit(id, creditLimit)
    return response.data
  }
)

const customerSlice = createSlice({
  name: 'customers',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
    setFilters: (state, action: PayloadAction<Partial<CustomerState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload }
    },
    clearFilters: (state) => {
      state.filters = {
        sortBy: 'name',
        sortOrder: 'asc',
      }
    },
    setCurrentCustomer: (state, action: PayloadAction<Customer | null>) => {
      state.currentCustomer = action.payload
    },
  },
  extraReducers: (builder) => {
    // Fetch customers
    builder
      .addCase(fetchCustomers.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchCustomers.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          state.customers = (action.payload as any).data || []
          state.pagination = (action.payload as any).meta || initialState.pagination
        }
      })
      .addCase(fetchCustomers.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch customers'
      })

    // Fetch single customer
    builder
      .addCase(fetchCustomer.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchCustomer.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          state.currentCustomer = action.payload as Customer
        }
      })
      .addCase(fetchCustomer.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch customer'
      })

    // Create customer
    builder
      .addCase(createCustomer.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createCustomer.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          state.customers.unshift(action.payload as Customer)
          state.pagination.total += 1
        }
      })
      .addCase(createCustomer.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to create customer'
      })

    // Update customer
    builder
      .addCase(updateCustomer.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateCustomer.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          const updatedCustomer = action.payload as Customer
          const index = state.customers.findIndex(c => c.id === updatedCustomer.id)
          if (index !== -1) {
            state.customers[index] = updatedCustomer
          }
          if (state.currentCustomer?.id === updatedCustomer.id) {
            state.currentCustomer = updatedCustomer
          }
        }
      })
      .addCase(updateCustomer.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to update customer'
      })

    // Delete customer
    builder
      .addCase(deleteCustomer.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteCustomer.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          state.customers = state.customers.filter(c => c.id !== action.payload)
          state.pagination.total = Math.max(0, state.pagination.total - 1)
          if (state.currentCustomer?.id === action.payload) {
            state.currentCustomer = null
          }
        }
      })
      .addCase(deleteCustomer.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to delete customer'
      })

    // Activate customer
    builder
      .addCase(activateCustomer.fulfilled, (state, action) => {
        if (action.payload) {
          const updatedCustomer = action.payload as Customer
          const index = state.customers.findIndex(c => c.id === updatedCustomer.id)
          if (index !== -1) {
            state.customers[index] = updatedCustomer
          }
          if (state.currentCustomer?.id === updatedCustomer.id) {
            state.currentCustomer = updatedCustomer
          }
        }
      })

    // Deactivate customer
    builder
      .addCase(deactivateCustomer.fulfilled, (state, action) => {
        if (action.payload) {
          const updatedCustomer = action.payload as Customer
          const index = state.customers.findIndex(c => c.id === updatedCustomer.id)
          if (index !== -1) {
            state.customers[index] = updatedCustomer
          }
          if (state.currentCustomer?.id === updatedCustomer.id) {
            state.currentCustomer = updatedCustomer
          }
        }
      })

    // Suspend customer
    builder
      .addCase(suspendCustomer.fulfilled, (state, action) => {
        if (action.payload) {
          const updatedCustomer = action.payload as Customer
          const index = state.customers.findIndex(c => c.id === updatedCustomer.id)
          if (index !== -1) {
            state.customers[index] = updatedCustomer
          }
          if (state.currentCustomer?.id === updatedCustomer.id) {
            state.currentCustomer = updatedCustomer
          }
        }
      })

    // Update credit limit
    builder
      .addCase(updateCreditLimit.fulfilled, (state, action) => {
        if (action.payload) {
          const updatedCustomer = action.payload as Customer
          const index = state.customers.findIndex(c => c.id === updatedCustomer.id)
          if (index !== -1) {
            state.customers[index] = updatedCustomer
          }
          if (state.currentCustomer?.id === updatedCustomer.id) {
            state.currentCustomer = updatedCustomer
          }
        }
      })
  },
})

export const { clearError, setFilters, clearFilters, setCurrentCustomer } = customerSlice.actions

// Selectors
export const selectCustomers = (state: any) => state.customers?.customers || []
export const selectCurrentCustomer = (state: any) => state.customers?.currentCustomer
export const selectCustomersLoading = (state: any) => state.customers?.loading || false
export const selectCustomersError = (state: any) => state.customers?.error
export const selectCustomersPagination = (state: any) => state.customers?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 }
export const selectCustomersFilters = (state: any) => state.customers?.filters || { sortBy: 'name', sortOrder: 'ASC' }

export default customerSlice.reducer