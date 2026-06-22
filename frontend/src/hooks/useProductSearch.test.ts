// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mockGet = vi.hoisted(() => vi.fn())

vi.mock('@/services/api', () => ({
  ApiService: { get: mockGet },
}))

import { useProductSearch } from './useProductSearch'

const makeProduct = (id: string, name: string) => ({ id, name })

// ApiService.get strips the Axios wrapper and returns response.data directly.
// So the mock returns { data: Product[] } — the backend body shape — not the
// raw Axios response shape { data: { data: Product[] } }.
const makeResponse = (products: ReturnType<typeof makeProduct>[]) => ({ data: products })

describe('useProductSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with an empty products list', () => {
    const { result } = renderHook(() => useProductSearch())

    expect(result.current.products).toEqual([])
  })

  it('loadProducts replaces the list with API results', async () => {
    mockGet.mockResolvedValue(makeResponse([makeProduct('1', 'Alpha')]))
    const { result } = renderHook(() => useProductSearch())

    await act(() => result.current.loadProducts())

    expect(result.current.products).toEqual([makeProduct('1', 'Alpha')])
    expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
      params: { sortBy: 'name', sortOrder: 'ASC' },
    })
  })

  it('loadProducts sends search param when searchTerm is provided', async () => {
    mockGet.mockResolvedValue(makeResponse([]))
    const { result } = renderHook(() => useProductSearch())

    await act(() => result.current.loadProducts('apple'))

    expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
      params: { sortBy: 'name', sortOrder: 'ASC', search: 'apple' },
    })
  })

  // Default (no option) intentionally omits isActive so callers like the stock
  // adjustment page can still see inactive products. Opt-in is tested below.
  it('does not send an isActive filter by default so callers can include inactive products', async () => {
    mockGet.mockResolvedValue(makeResponse([]))
    const { result } = renderHook(() => useProductSearch())

    await act(() => result.current.loadProducts())

    const callConfig = mockGet.mock.calls[0][1] as { params: Record<string, unknown> }
    expect(callConfig.params).not.toHaveProperty('isActive')
  })

  it('sends isActive=true when onlyActive option is set (issue #808)', async () => {
    mockGet.mockResolvedValue(makeResponse([]))
    const { result } = renderHook(() => useProductSearch({ onlyActive: true }))

    await act(() => result.current.loadProducts('bolt'))

    expect(mockGet).toHaveBeenCalledWith('/inventory/products', {
      params: { sortBy: 'name', sortOrder: 'ASC', search: 'bolt', isActive: 'true' },
    })
  })

  it('loadProducts replaces the list, not merges', async () => {
    mockGet
      .mockResolvedValueOnce(makeResponse([makeProduct('1', 'Alpha')]))
      .mockResolvedValueOnce(makeResponse([makeProduct('2', 'Beta')]))
    const { result } = renderHook(() => useProductSearch())

    await act(() => result.current.loadProducts())
    await act(() => result.current.loadProducts('B'))

    expect(result.current.products).toEqual([makeProduct('2', 'Beta')])
    expect(result.current.products).not.toContainEqual(makeProduct('1', 'Alpha'))
  })

  it('loadProducts discards stale responses (race condition guard)', async () => {
    type Response = ReturnType<typeof makeResponse>
    let resolveFirst!: (value: Response) => void
    let resolveSecond!: (value: Response) => void
    const first = new Promise<Response>((res) => { resolveFirst = res })
    const second = new Promise<Response>((res) => { resolveSecond = res })

    mockGet.mockReturnValueOnce(first).mockReturnValueOnce(second)

    const { result } = renderHook(() => useProductSearch())

    act(() => { void result.current.loadProducts('a') })
    act(() => { void result.current.loadProducts('b') })

    await act(async () => {
      resolveSecond(makeResponse([makeProduct('2', 'Second')]))
      await Promise.resolve()
    })

    await act(async () => {
      resolveFirst(makeResponse([makeProduct('1', 'First')]))
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
    type Response = ReturnType<typeof makeResponse>
    let resolveRequest!: (value: Response) => void
    const request = new Promise<Response>((res) => { resolveRequest = res })

    mockGet.mockReturnValueOnce(request)

    const { result } = renderHook(() => useProductSearch())

    act(() => { void result.current.loadProducts() })
    act(() => { result.current.seedProducts([makeProduct('9', 'Hydrated Product')]) })

    await act(async () => {
      resolveRequest(makeResponse([makeProduct('1', 'Alpha')]))
      await Promise.resolve()
    })

    expect(result.current.products).toEqual([makeProduct('9', 'Hydrated Product')])
  })
})
