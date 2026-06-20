import { describe, expect, it } from 'vitest'

import { PAGINATION } from '@/constants/tableStyles'
import auditLogReducer, {
  clearFilters,
  setActiveTab,
  setFilters,
  setLimit,
  setPage,
  setSidebarCollapsed,
} from '@/store/slices/auditLogSlice'

describe('auditLogSlice UI state', () => {
  it('defaults pagination limit to PAGINATION.defaultPageSize', () => {
    const state = auditLogReducer(undefined, { type: '@@INIT' })
    expect(state.pagination.limit).toBe(PAGINATION.defaultPageSize)
    expect(state.pagination.page).toBe(1)
  })

  it('updates filters', () => {
    const state = auditLogReducer(undefined, setFilters({ search: 'john' }))
    expect(state.filters.search).toBe('john')
  })

  it('clears filters', () => {
    const withFilters = auditLogReducer(undefined, setFilters({ username: 'admin' }))
    const cleared = auditLogReducer(withFilters, clearFilters())
    expect(cleared.filters.search).toBe('')
    expect(cleared.filters.username).toBeUndefined()
  })

  it('updates pagination and tab state', () => {
    let state = auditLogReducer(undefined, setPage(4))
    state = auditLogReducer(state, setLimit(50))
    state = auditLogReducer(state, setActiveTab('analytics'))

    expect(state.pagination.page).toBe(4)
    expect(state.pagination.limit).toBe(50)
    expect(state.activeTab).toBe('analytics')
  })

  it('updates sidebar collapse state', () => {
    const state = auditLogReducer(undefined, setSidebarCollapsed(true))
    expect(state.sidebarCollapsed).toBe(true)
  })
})
