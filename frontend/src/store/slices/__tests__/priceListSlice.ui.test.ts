import { describe, expect, it } from 'vitest'

import priceListReducer, { setFilters, setPagination } from '@/store/slices/priceListSlice'

describe('priceListSlice UI state', () => {
  it('updates filters', () => {
    const state = priceListReducer(undefined, setFilters({ search: 'wholesale', isActive: true }))
    expect(state.filters.search).toBe('wholesale')
    expect(state.filters.isActive).toBe(true)
  })

  it('updates pagination', () => {
    const state = priceListReducer(undefined, setPagination({ page: 2, limit: 50 }))
    expect(state.pagination.page).toBe(2)
    expect(state.pagination.limit).toBe(50)
  })
})
