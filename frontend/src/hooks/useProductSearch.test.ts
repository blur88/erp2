import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.hoisted(() => vi.fn())

vi.mock('@/services/api', () => ({
  ApiService: { get: mockGet },
}))

import { useProductSearch } from './useProductSearch'

const makeProduct = (id: string, name: string) => ({ id, name })

describe('useProductSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with an empty products list', () => {
    const { result } = renderHook(() => useProductSearch())

    expect(result.current.products).toEqual([])
  })

  it('loadProducts replaces the list with API results', async () => {
    mockGet.mockResolvedValue({ data: { data: [makeProduct('1', 'Alpha')] } })
    const { result } = renderHook(() => useProductSearch())

    await act(() => result.current.loadProducts())

    expect(result.current.products).toEqual([makeProduct('1', 'Alpha')])
    expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
      params: { isActive: true },
    })
  })

  it('loadProducts sends search param when searchTerm is provided', async () => {
    mockGet.mockResolvedValue({ data: { data: [] } })
    const { result } = renderHook(() => useProductSearch())

    await act(() => result.current.loadProducts('apple'))

    expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
      params: { isActive: true, search: 'apple' },
    })
  })

  it('loadProducts replaces the list, not merges', async () => {
    mockGet
      .mockResolvedValueOnce({ data: { data: [makeProduct('1', 'Alpha')] } })
      .mockResolvedValueOnce({ data: { data: [makeProduct('2', 'Beta')] } })
    const { result } = renderHook(() => useProductSearch())

    await act(() => result.current.loadProducts())
    await act(() => result.current.loadProducts('B'))

    expect(result.current.products).toEqual([makeProduct('2', 'Beta')])
    expect(result.current.products).not.toContainEqual(makeProduct('1', 'Alpha'))
  })

  it('loadProducts discards stale responses (race condition guard)', async () => {
    let resolveFirst!: (value: { data: { data: Array<{ id: string; name: string }> } }) => void
    let resolveSecond!: (value: { data: { data: Array<{ id: string; name: string }> } }) => void
    const first = new Promise<{ data: { data: Array<{ id: string; name: string }> } }>((res) => {
      resolveFirst = res
    })
    const second = new Promise<{ data: { data: Array<{ id: string; name: string }> } }>((res) => {
      resolveSecond = res
    })

    mockGet.mockReturnValueOnce(first).mockReturnValueOnce(second)

    const { result } = renderHook(() => useProductSearch())

    act(() => {
      void result.current.loadProducts('a')
    })
    act(() => {
      void result.current.loadProducts('b')
    })

    await act(async () => {
      resolveSecond({ data: { data: [makeProduct('2', 'Second')] } })
      await Promise.resolve()
    })

    await act(async () => {
      resolveFirst({ data: { data: [makeProduct('1', 'First')] } })
      await Promise.resolve()
    })

    expect(result.current.products).toEqual([makeProduct('2', 'Second')])
  })

  it('seedProducts merges products without duplicates', () => {
    const { result } = renderHook(() => useProductSearch())

    act(() => {
      result.current.seedProducts([makeProduct('1', 'Alpha'), makeProduct('2', 'Beta')])
    })
    act(() => {
      result.current.seedProducts([makeProduct('2', 'Beta'), makeProduct('3', 'Gamma')])
    })

    expect(result.current.products).toHaveLength(3)
    expect(result.current.products.map((product) => product.id)).toEqual(['1', '2', '3'])
  })

  it('seedProducts invalidates older in-flight loadProducts responses', async () => {
    let resolveRequest!: (value: { data: { data: Array<{ id: string; name: string }> } }) => void
    const request = new Promise<{ data: { data: Array<{ id: string; name: string }> } }>((res) => {
      resolveRequest = res
    })

    mockGet.mockReturnValueOnce(request)

    const { result } = renderHook(() => useProductSearch())

    act(() => {
      void result.current.loadProducts()
    })

    act(() => {
      result.current.seedProducts([makeProduct('9', 'Hydrated Product')])
    })

    await act(async () => {
      resolveRequest({ data: { data: [makeProduct('1', 'Alpha')] } })
      await Promise.resolve()
    })

    expect(result.current.products).toEqual([makeProduct('9', 'Hydrated Product')])
  })
})
