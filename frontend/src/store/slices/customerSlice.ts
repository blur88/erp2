import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { salesApi } from '@/services/salesApi'
import type { Customer, CustomerType, CustomerStatus, PriceLevel, PaginatedResponse } from '@/types'

interface CustomerState {
  customers: Customer[]
  deletedCustomers: Customer[]
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
    sortOrder?: 'ASC' | 'DESC'
  }
}

const initialState: CustomerState = {
  customers: [],
  deletedCustomers: [],
  currentCustomer: null,
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
  filters: {}
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
    // Clean params to avoid sending empty strings
    const cleanParams = params ? Object.fromEntries(
      Object.entries(params).filter(([_, value]) => value !== '' && value !== undefined && value !== null)
    ) : undefined
    
    const response = await salesApi.getCustomers(cleanParams)
    return response  // Return the full response, not just response.data
  }
)

export const fetchCustomer = createAsyncThunk(
  'customers/fetchCustomer',
  async (id: string) => {
    const response = await salesApi.getCustomer(id)
    return response  // Return the full response
  }
)

export const createCustomer = createAsyncThunk(
  'customers/createCustomer',
  async (customerData: Partial<Customer>) => {
    const response = await salesApi.createCustomer(customerData)
    return response  // Return the full response
  }
)

export const updateCustomer = createAsyncThunk(
  'customers/updateCustomer',
  async ({ id, data }: { id: string; data: Partial<Customer> }) => {
    const response = await salesApi.updateCustomer(id, data)
    return response  // Return the full response
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
    return response  // Return the full response
  }
)

export const deactivateCustomer = createAsyncThunk(
  'customers/deactivateCustomer',
  async (id: string) => {
    const response = await salesApi.deactivateCustomer(id)
    return response  // Return the full response
  }
)

export const suspendCustomer = createAsyncThunk(
  'customers/suspendCustomer',
  async ({ id, reason }: { id: string; reason?: string }) => {
    const response = await salesApi.suspendCustomer(id, reason)
    return response  // Return the full response
  }
)

export const updateCreditLimit = createAsyncThunk(
  'customers/updateCreditLimit',
  async ({ id, creditLimit }: { id: string; creditLimit: number }) => {
    const response = await salesApi.updateCreditLimit(id, creditLimit)
    return response  // Return the full response
  }
)

export const fetchDeletedCustomers = createAsyncThunk(
  'customers/fetchDeletedCustomers',
  async (params?: {
    page?: number
    limit?: number
    search?: string
    sortBy?: string
    sortOrder?: 'ASC' | 'DESC'
  }) => {
    // Clean params to avoid sending empty strings
    const cleanParams = params ? Object.fromEntries(
      Object.entries(params).filter(([_, value]) => value !== '' && value !== undefined && value !== null)
    ) : undefined
    
    const response = await salesApi.getDeletedCustomers(cleanParams)
    return response  // Return the full response
  }
)

export const restoreCustomer = createAsyncThunk(
  'customers/restoreCustomer',
  async (id: string) => {
    const response = await salesApi.restoreCustomer(id)
    return response  // Return the full response
  }
)

export const bulkRestoreCustomers = createAsyncThunk(
  'customers/bulkRestoreCustomers',
  async (customerIds: string[]) => {
    const response = await salesApi.bulkRestoreCustomers(customerIds)
    return response  // Return the full response
  }
)

export const permanentDeleteCustomer = createAsyncThunk(
  'customers/permanentDeleteCustomer',
  async (id: string) => {
    const response = await salesApi.permanentDeleteCustomer(id)
    return response  // Return the full response
  }
)

export const bulkPermanentDeleteCustomers = createAsyncThunk(
  'customers/bulkPermanentDeleteCustomers',
  async (customerIds: string[]) => {
    const response = await salesApi.bulkPermanentDeleteCustomers(customerIds)
    return response  // Return the full response
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
      state.filters = {}
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
          // API response structure: { data: Customer[], total, page, limit, totalPages }
          const payload = action.payload as any
          // The API returns the data directly, not wrapped in another data property
          state.customers = Array.isArray(payload.data) ? payload.data : []
          state.pagination = {
            page: payload.page || 1,
            limit: payload.limit || 20,
            total: payload.total || 0,
            totalPages: payload.totalPages || 0,
          }
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
          state.currentCustomer = ((action.payload as any).data || action.payload) as Customer
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
          const customer = ((action.payload as any).data || action.payload) as Customer
          state.customers.unshift(customer)
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
          const updatedCustomer = ((action.payload as any).data || action.payload) as Customer
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
          const updatedCustomer = ((action.payload as any).data || action.payload) as Customer
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
          const updatedCustomer = ((action.payload as any).data || action.payload) as Customer
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
          const updatedCustomer = ((action.payload as any).data || action.payload) as Customer
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
          const updatedCustomer = ((action.payload as any).data || action.payload) as Customer
          const index = state.customers.findIndex(c => c.id === updatedCustomer.id)
          if (index !== -1) {
            state.customers[index] = updatedCustomer
          }
          if (state.currentCustomer?.id === updatedCustomer.id) {
            state.currentCustomer = updatedCustomer
          }
        }
      })

    // Fetch deleted customers
    builder
      .addCase(fetchDeletedCustomers.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchDeletedCustomers.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          // API response structure: { data: Customer[], total, page, limit, totalPages }
          const payload = action.payload as any
          state.deletedCustomers = payload.data || []
        }
      })
      .addCase(fetchDeletedCustomers.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to fetch deleted customers'
      })

    // Restore customer
    builder
      .addCase(restoreCustomer.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(restoreCustomer.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          const restoredCustomer = ((action.payload as any).data || action.payload) as Customer
          // Remove from deleted customers
          state.deletedCustomers = state.deletedCustomers.filter(c => c.id !== restoredCustomer.id)
          // Add to regular customers if not already there
          const exists = state.customers.find(c => c.id === restoredCustomer.id)
          if (!exists) {
            state.customers.unshift(restoredCustomer)
            state.pagination.total += 1
          }
        }
      })
      .addCase(restoreCustomer.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to restore customer'
      })

    // Bulk restore customers
    builder
      .addCase(bulkRestoreCustomers.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(bulkRestoreCustomers.fulfilled, (state, action) => {
        state.loading = false
        // This will be handled by refreshing the lists, similar to products implementation
      })
      .addCase(bulkRestoreCustomers.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to bulk restore customers'
      })

    // Permanent delete customer
    builder
      .addCase(permanentDeleteCustomer.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(permanentDeleteCustomer.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          const deletedId = (action.payload as any).id || (action.payload as any).data?.id
          if (deletedId) {
            // Remove from deleted customers
            state.deletedCustomers = state.deletedCustomers.filter(c => c.id !== deletedId)
          }
        }
      })
      .addCase(permanentDeleteCustomer.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to permanently delete customer'
      })

    // Bulk permanent delete customers
    builder
      .addCase(bulkPermanentDeleteCustomers.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(bulkPermanentDeleteCustomers.fulfilled, (state, action) => {
        state.loading = false
        // This will be handled by refreshing the lists
      })
      .addCase(bulkPermanentDeleteCustomers.rejected, (state, action) => {
        state.loading = false
        state.error = action.error.message || 'Failed to bulk permanently delete customers'
      })
  },
})

export const { clearError, setFilters, clearFilters, setCurrentCustomer } = customerSlice.actions

// Selectors
export const selectCustomers = (state: any) => state.customers?.customers || []
export const selectDeletedCustomers = (state: any) => state.customers?.deletedCustomers || []
export const selectCurrentCustomer = (state: any) => state.customers?.currentCustomer
export const selectCustomersLoading = (state: any) => state.customers?.loading || false
export const selectCustomersError = (state: any) => state.customers?.error
export const selectCustomersPagination = (state: any) => state.customers?.pagination || { page: 1, limit: 20, total: 0, totalPages: 0 }
export const selectCustomersFilters = (state: any) => state.customers?.filters || {}

export default customerSlice.reducer