import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'
import type { AuditLog, PaginatedResponse, AuditAction } from '@/types'
import { auditLogApi, type AuditLogFilters, type AuditLogStatistics } from '@/services/auditLogApi'

interface AuditLogState {
  auditLogs: AuditLog[]
  selectedAuditLog: AuditLog | null
  statistics: AuditLogStatistics | null
  loading: boolean
  error: string | null
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
  filters: {
    search: string
    action?: AuditAction
    entityType?: string
    entityId?: string
    userId?: string
    username?: string
    ipAddress?: string
    startDate?: string
    endDate?: string
  }
  activeTab: 'logs' | 'analytics'
  sidebarCollapsed: boolean
}

const initialState: AuditLogState = {
  auditLogs: [],
  selectedAuditLog: null,
  statistics: null,
  loading: false,
  error: null,
  pagination: {
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  },
  filters: {
    search: '',
  },
  activeTab: 'logs' as const,
  sidebarCollapsed: false,
}

// Async thunks
export const fetchAuditLogs = createAsyncThunk(
  'auditLogs/fetchAuditLogs',
  async (params: AuditLogFilters = {}, { rejectWithValue }) => {
    try {
      const response = await auditLogApi.getAuditLogs(params)
      return response
    } catch (error: any) {
      console.error('Failed to fetch audit logs:', error)
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch audit logs')
    }
  }
)

export const fetchAuditLogStatistics = createAsyncThunk(
  'auditLogs/fetchStatistics',
  async ({ startDate, endDate }: { startDate?: string; endDate?: string } = {}, { rejectWithValue }) => {
    try {
      const data = await auditLogApi.getStatistics(startDate, endDate)
      return data
    } catch (error: any) {
      console.error('Failed to fetch audit log statistics:', error)
      return rejectWithValue(error.response?.data?.message || 'Failed to fetch statistics')
    }
  }
)

// Slice
const auditLogSlice = createSlice({
  name: 'auditLogs',
  initialState,
  reducers: {
    setSelectedAuditLog: (state, action: PayloadAction<AuditLog | null>) => {
      state.selectedAuditLog = action.payload
    },
    setFilters: (state, action: PayloadAction<Partial<AuditLogState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload }
    },
    clearFilters: (state) => {
      state.filters = initialState.filters
    },
    setPage: (state, action: PayloadAction<number>) => {
      state.pagination.page = action.payload
    },
    setLimit: (state, action: PayloadAction<number>) => {
      state.pagination.limit = action.payload
    },
    setActiveTab: (state, action: PayloadAction<'logs' | 'analytics'>) => {
      state.activeTab = action.payload
    },
    setSidebarCollapsed: (state, action: PayloadAction<boolean>) => {
      state.sidebarCollapsed = action.payload
    },
  },
  extraReducers: (builder) => {
    // Fetch audit logs
    builder.addCase(fetchAuditLogs.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(fetchAuditLogs.fulfilled, (state, action) => {
      state.loading = false
      if (action.payload) {
        state.auditLogs = action.payload.data || []
        state.pagination = action.payload.meta || initialState.pagination
      }
    })
    builder.addCase(fetchAuditLogs.rejected, (state, action) => {
      state.loading = false
      state.error = action.payload as string
    })

    // Fetch statistics
    builder.addCase(fetchAuditLogStatistics.pending, (state) => {
      state.loading = true
      state.error = null
    })
    builder.addCase(fetchAuditLogStatistics.fulfilled, (state, action) => {
      state.loading = false
      state.statistics = action.payload
    })
    builder.addCase(fetchAuditLogStatistics.rejected, (state, action) => {
      state.loading = false
      state.error = action.payload as string
    })
  },
})

export const {
  setSelectedAuditLog,
  setFilters,
  clearFilters,
  setPage,
  setLimit,
  setActiveTab,
  setSidebarCollapsed,
} = auditLogSlice.actions

export default auditLogSlice.reducer
