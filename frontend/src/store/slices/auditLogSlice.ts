import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import { PAGINATION } from '@/constants/tableStyles'
import type { AuditAction } from '@/types'
import type { RootState } from '@/store'

interface AuditLogUIState {
  pagination: {
    page: number
    limit: number
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

const initialState: AuditLogUIState = {
  pagination: {
    page: 1,
    limit: PAGINATION.defaultPageSize,
  },
  filters: {
    search: '',
  },
  activeTab: 'logs',
  sidebarCollapsed: false,
}

const auditLogSlice = createSlice({
  name: 'auditLogs',
  initialState,
  reducers: {
    setFilters: (state, action: PayloadAction<Partial<AuditLogUIState['filters']>>) => {
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
})

export const { setFilters, clearFilters, setPage, setLimit, setActiveTab, setSidebarCollapsed } =
  auditLogSlice.actions

export default auditLogSlice.reducer
