import { describe, expect, it } from 'vitest'

import { PAGINATION } from '@/constants/tableStyles'
import priceListReducer, { setPagination } from '@/store/slices/priceListSlice'

describe('priceListSlice UI state', () => {
  it('defaults pagination limit to PAGINATION.defaultPageSize', () => {
    const state = priceListReducer(undefined, { type: '@@INIT' })
    expect(state.pagination.limit).toBe(PAGINATION.defaultPageSize)
    expect(state.pagination.page).toBe(1)
  })

  it('updates pagination', () => {
    const state = priceListReducer(undefined, setPagination({ page: 2, limit: 50 }))
    expect(state.pagination.page).toBe(2)
    expect(state.pagination.limit).toBe(50)
  })
})
