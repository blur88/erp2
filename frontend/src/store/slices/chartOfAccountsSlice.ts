import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import { ApiService } from '@/services/api'

// Types
export interface ChartOfAccount {
  id: string
  code: string
  name: string
  type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE'
  parentId?: string
  isActive: boolean
  fullCode: string
  isParent: boolean
  parent?: Partial<ChartOfAccount>
  children?: ChartOfAccount[]
  createdAt: string
  updatedAt: string
  deletedAt?: string
}

interface PaginatedResponse<T> {
  data: T[]
  meta: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

interface BulkRestoreResponse {
  message: string
  restoredCount: number
  failedIds: string[]
}

interface BulkDeleteResponse {
  message: string
  deletedCount: number
  failedIds: string[]
  failedItems?: Array<{ id: string; reason: string }>
}

interface ChartOfAccountsState {
  data: ChartOfAccount[]
  hierarchy: ChartOfAccount[]
  loading: boolean
  error: string | null
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

const initialState: ChartOfAccountsState = {
  data: [],
  hierarchy: [],
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
}
const EMPTY_ACCOUNTS: ChartOfAccount[] = []
const EMPTY_HIERARCHY: ChartOfAccount[] = []

// Async Thunks
export const fetchChartOfAccounts = createAsyncThunk(
  'chartOfAccounts/fetchAll',
  async (
    params: {
      page?: number
      limit?: number
      type?: string
      search?: string
      isActive?: boolean
      sortBy?: string
      sortOrder?: 'asc' | 'desc'
    } = {},
    { rejectWithValue }
  ) => {
    try {
      const queryParams = new URLSearchParams()
      if (params.page) queryParams.append('page', params.page.toString())
      if (params.limit) queryParams.append('limit', params.limit.toString())
      if (params.type) queryParams.append('type', params.type)
      if (params.search) queryParams.append('search', params.search)
      if (params.isActive !== undefined) queryParams.append('isActive', params.isActive.toString())
      if (params.sortBy) queryParams.append('sortBy', params.sortBy)
      if (params.sortOrder) queryParams.append('sortOrder', params.sortOrder)

      const response = await ApiService.get<PaginatedResponse<ChartOfAccount>>(
        `/accounting/chart-of-accounts?${queryParams.toString()}`
      )
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch chart of accounts')
    }
  }
)

export const fetchAccountById = createAsyncThunk(
  'chartOfAccounts/fetchById',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await ApiService.get<ChartOfAccount>(`/accounting/chart-of-accounts/${id}`)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch account')
    }
  }
)

export const fetchAccountHierarchy = createAsyncThunk(
  'chartOfAccounts/fetchHierarchy',
  async (type: string | undefined = undefined, { rejectWithValue }) => {
    try {
      const url = type
        ? `/accounting/chart-of-accounts/hierarchy?type=${type}`
        : '/accounting/chart-of-accounts/hierarchy'
      const response = await ApiService.get<ChartOfAccount[]>(url)
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch account hierarchy')
    }
  }
)

export const createAccount = createAsyncThunk(
  'chartOfAccounts/create',
  async (accountData: Partial<ChartOfAccount>, { rejectWithValue }) => {
    try {
      const response = await ApiService.post<ChartOfAccount>(
        '/accounting/chart-of-accounts',
        accountData
      )
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to create account')
    }
  }
)

export const updateAccount = createAsyncThunk(
  'chartOfAccounts/update',
  async ({ id, data }: { id: string; data: Partial<ChartOfAccount> }, { rejectWithValue }) => {
    try {
      const response = await ApiService.patch<ChartOfAccount>(
        `/accounting/chart-of-accounts/${id}`,
        data
      )
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to update account')
    }
  }
)

export const deleteAccount = createAsyncThunk(
  'chartOfAccounts/delete',
  async (id: string, { rejectWithValue }) => {
    try {
      await ApiService.delete(`/accounting/chart-of-accounts/${id}`)
      return id
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to delete account')
    }
  }
)

export const fetchDeletedAccounts = createAsyncThunk(
  'chartOfAccounts/fetchDeleted',
  async (_, { rejectWithValue }) => {
    try {
      const response = await ApiService.get<ChartOfAccount[]>(
        '/accounting/chart-of-accounts/deleted'
      )
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch deleted accounts')
    }
  }
)

export const restoreAccount = createAsyncThunk(
  'chartOfAccounts/restore',
  async (id: string, { rejectWithValue }) => {
    try {
      const response = await ApiService.post<ChartOfAccount>(
        `/accounting/chart-of-accounts/${id}/restore`,
        {}
      )
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to restore account')
    }
  }
)

export const permanentDeleteAccount = createAsyncThunk(
  'chartOfAccounts/permanentDelete',
  async (id: string, { rejectWithValue }) => {
    try {
      await ApiService.delete(`/accounting/chart-of-accounts/${id}/permanent`)
      return id
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to permanently delete account')
    }
  }
)

export const bulkRestoreAccounts = createAsyncThunk(
  'chartOfAccounts/bulkRestore',
  async (accountIds: string[], { rejectWithValue }) => {
    try {
      const response = await ApiService.post<BulkRestoreResponse>(
        '/accounting/chart-of-accounts/bulk-restore',
        { accountIds }
      )
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to bulk restore accounts')
    }
  }
)

export const bulkPermanentDeleteAccounts = createAsyncThunk(
  'chartOfAccounts/bulkPermanentDelete',
  async (accountIds: string[], { rejectWithValue }) => {
    try {
      const response = await ApiService.delete<BulkDeleteResponse>(
        '/accounting/chart-of-accounts/bulk-permanent',
        { data: { accountIds } }
      )
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to bulk permanently delete accounts')
    }
  }
)

export const seedDefaultAccounts = createAsyncThunk(
  'chartOfAccounts/seed',
  async (_, { rejectWithValue }) => {
    try {
      const response = await ApiService.post<{ message: string; count: number }>(
        '/accounting/chart-of-accounts/seed',
        {}
      )
      return response
    } catch (error: any) {
      return rejectWithValue(error.response?.data?.message || 'Failed to seed default accounts')
    }
  }
)

// Slice
const chartOfAccountsSlice = createSlice({
  name: 'chartOfAccounts',
  initialState,
  reducers: {
    clearError: (state) => {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    // Fetch All Accounts
    builder
      .addCase(fetchChartOfAccounts.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchChartOfAccounts.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          state.data = action.payload.data || []
          state.pagination = action.payload.meta || {
            page: 1,
            limit: 20,
            total: 0,
            totalPages: 0,
          }
        }
      })
      .addCase(fetchChartOfAccounts.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Fetch Account By ID
    builder
      .addCase(fetchAccountById.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchAccountById.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          // Update account in data array if it exists
          const index = state.data.findIndex((acc) => acc.id === action.payload.id)
          if (index !== -1) {
            state.data[index] = action.payload
          }
        }
      })
      .addCase(fetchAccountById.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Fetch Account Hierarchy
    builder
      .addCase(fetchAccountHierarchy.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchAccountHierarchy.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          state.hierarchy = action.payload
        }
      })
      .addCase(fetchAccountHierarchy.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Create Account
    builder
      .addCase(createAccount.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(createAccount.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          state.data.unshift(action.payload)
        }
      })
      .addCase(createAccount.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Update Account
    builder
      .addCase(updateAccount.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(updateAccount.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          const index = state.data.findIndex((acc) => acc.id === action.payload.id)
          if (index !== -1) {
            state.data[index] = action.payload
          }
        }
      })
      .addCase(updateAccount.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Delete Account
    builder
      .addCase(deleteAccount.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(deleteAccount.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          state.data = state.data.filter((acc) => acc.id !== action.payload)
        }
      })
      .addCase(deleteAccount.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Fetch Deleted Accounts
    builder
      .addCase(fetchDeletedAccounts.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(fetchDeletedAccounts.fulfilled, (state, action) => {
        state.loading = false
        // Deleted accounts are handled separately, not stored in main data
      })
      .addCase(fetchDeletedAccounts.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Restore Account
    builder
      .addCase(restoreAccount.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(restoreAccount.fulfilled, (state, action) => {
        state.loading = false
        if (action.payload) {
          // Add restored account back to data array
          state.data.unshift(action.payload)
        }
      })
      .addCase(restoreAccount.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Permanent Delete Account
    builder
      .addCase(permanentDeleteAccount.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(permanentDeleteAccount.fulfilled, (state, action) => {
        state.loading = false
        // Account is permanently deleted, no need to update state
      })
      .addCase(permanentDeleteAccount.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Bulk Restore Accounts
    builder
      .addCase(bulkRestoreAccounts.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(bulkRestoreAccounts.fulfilled, (state) => {
        state.loading = false
      })
      .addCase(bulkRestoreAccounts.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Bulk Permanent Delete Accounts
    builder
      .addCase(bulkPermanentDeleteAccounts.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(bulkPermanentDeleteAccounts.fulfilled, (state) => {
        state.loading = false
      })
      .addCase(bulkPermanentDeleteAccounts.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })

    // Seed Default Accounts
    builder
      .addCase(seedDefaultAccounts.pending, (state) => {
        state.loading = true
        state.error = null
      })
      .addCase(seedDefaultAccounts.fulfilled, (state) => {
        state.loading = false
        // Note: After seeding, the component should refresh the list
      })
      .addCase(seedDefaultAccounts.rejected, (state, action) => {
        state.loading = false
        state.error = action.payload as string
      })
  },
})

export const { clearError } = chartOfAccountsSlice.actions

// Selectors
export const selectChartOfAccounts = (state: any) => state.chartOfAccounts?.data || EMPTY_ACCOUNTS
export const selectAccountHierarchy = (state: any) => state.chartOfAccounts?.hierarchy || EMPTY_HIERARCHY
export const selectChartOfAccountsLoading = (state: any) => state.chartOfAccounts?.loading || false
export const selectChartOfAccountsError = (state: any) => state.chartOfAccounts?.error || null
export const selectChartOfAccountsPagination = (state: any) =>
  state.chartOfAccounts?.pagination || {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  }

export default chartOfAccountsSlice.reducer
