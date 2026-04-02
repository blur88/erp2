import { describe, expect, it } from 'vitest'

import priceListReducer, { setPagination } from '@/store/slices/priceListSlice'

describe('priceListSlice UI state', () => {
  it('updates pagination', () => {
    const state = priceListReducer(undefined, setPagination({ page: 2, limit: 50 }))
    expect(state.pagination.page).toBe(2)
    expect(state.pagination.limit).toBe(50)
  })
})
