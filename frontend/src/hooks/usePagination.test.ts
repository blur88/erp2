import { renderHook, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { usePagination } from './usePagination'
import { PAGINATION } from '@/constants/tableStyles'

describe('usePagination', () => {
  it('starts on page 1 with the default limit', () => {
    const { result } = renderHook(() => usePagination())
    expect(result.current.page).toBe(1)
    expect(result.current.limit).toBe(PAGINATION.defaultPageSize)
  })

  it('honors an explicit initial limit', () => {
    const { result } = renderHook(() => usePagination(50))
    expect(result.current.limit).toBe(50)
  })

  it('setLimit changes limit and resets page to 1', () => {
    const { result } = renderHook(() => usePagination())
    act(() => result.current.setPage(4))
    expect(result.current.page).toBe(4)
    act(() => result.current.setLimit(100))
    expect(result.current.limit).toBe(100)
    expect(result.current.page).toBe(1)
  })

  it('reset returns to page 1', () => {
    const { result } = renderHook(() => usePagination())
    act(() => result.current.setPage(7))
    act(() => result.current.reset())
    expect(result.current.page).toBe(1)
  })

  it('paginationProps.onLimitChange also resets the page', () => {
    const { result } = renderHook(() => usePagination())
    act(() => result.current.setPage(3))
    act(() => result.current.paginationProps.onLimitChange(25))
    expect(result.current.page).toBe(1)
    expect(result.current.limit).toBe(25)
  })
})
