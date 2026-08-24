import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { BrowserRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

import { useListUrlState } from '@/hooks/useListUrlState'

const SORT = { fields: ['referenceNumber'] as const, defaultField: 'referenceNumber' as const, defaultOrder: 'desc' as const }

// BrowserRouter, not MemoryRouter: the hook reads live window.location.search,
// which MemoryRouter never populates (verified).
function makeWrapper() {
  return ({ children }: { children: React.ReactNode }) => <BrowserRouter>{children}</BrowserRouter>
}

function setUrl(url: string) {
  window.history.replaceState(null, '', url)
}

beforeEach(() => {
  setUrl('/')
})

describe('useListUrlState — hydration', () => {
  it('uses defaults when the URL is empty', () => {
    const { result } = renderHook(() => useListUrlState({ sort: SORT }), { wrapper: makeWrapper() })
    expect(result.current.page).toBe(1)
    expect(result.current.limit).toBe(25)
    expect(result.current.sortBy).toBe('referenceNumber')
    expect(result.current.sortOrder).toBe('desc')
  })

  it('hydrates page, limit and sortOrder from the URL', () => {
    setUrl('/?page=3&limit=50&sortOrder=asc')
    const { result } = renderHook(() => useListUrlState({ sort: SORT }), { wrapper: makeWrapper() })
    expect(result.current.page).toBe(3)
    expect(result.current.limit).toBe(50)
    expect(result.current.sortOrder).toBe('asc')
  })

  it.each([
    ['page=0', 'page', 1],
    ['page=abc', 'page', 1],
    ['page=-2', 'page', 1],
  ])('falls back for invalid %s', (query, _key, expected) => {
    setUrl(`/?${query}`)
    const { result } = renderHook(() => useListUrlState({ sort: SORT }), { wrapper: makeWrapper() })
    expect(result.current.page).toBe(expected)
  })

  it('falls back when limit is not an allowed page size', () => {
    setUrl('/?limit=999')
    const { result } = renderHook(() => useListUrlState({ sort: SORT }), { wrapper: makeWrapper() })
    expect(result.current.limit).toBe(25)
  })

  it('falls back for an unknown sortBy and a bad sortOrder', () => {
    setUrl('/?sortBy=garbage&sortOrder=sideways')
    const { result } = renderHook(() => useListUrlState({ sort: SORT }), { wrapper: makeWrapper() })
    expect(result.current.sortBy).toBe('referenceNumber')
    expect(result.current.sortOrder).toBe('desc')
  })

  it('canonicalizes by REMOVING invalid params from the URL', () => {
    setUrl('/?page=0&limit=999&sortBy=garbage&sortOrder=sideways&type=X')
    renderHook(() => useListUrlState({ sort: SORT }), { wrapper: makeWrapper() })

    const params = new URLSearchParams(window.location.search)
    expect(params.get('page')).toBeNull()
    expect(params.get('limit')).toBeNull()
    expect(params.get('sortBy')).toBeNull()
    expect(params.get('sortOrder')).toBeNull()
    // Foreign params survive canonicalization.
    expect(params.get('type')).toBe('X')
  })

  it('does not parse pagination keys when pagination is disabled', () => {
    setUrl('/?page=7&limit=50')
    const { result } = renderHook(
      () => useListUrlState({ pagination: false, sort: SORT }),
      { wrapper: makeWrapper() },
    )
    // The foreign values are neither adopted nor stripped.
    expect(result.current.page).toBe(1)
    const params = new URLSearchParams(window.location.search)
    expect(params.get('page')).toBe('7')
    expect(params.get('limit')).toBe('50')
  })

  it('does not parse sort keys when sort is not configured', () => {
    setUrl('/?sortBy=whatever&sortOrder=asc')
    renderHook(() => useListUrlState(), { wrapper: makeWrapper() })
    const params = new URLSearchParams(window.location.search)
    expect(params.get('sortBy')).toBe('whatever')
    expect(params.get('sortOrder')).toBe('asc')
  })
})

describe('useListUrlState — serialization', () => {
  it('writes nothing to the URL while every value is default', () => {
    renderHook(() => useListUrlState({ sort: SORT }), { wrapper: makeWrapper() })
    expect(window.location.search).toBe('')
  })

  it('writes page and drops it again when it returns to the default', () => {
    const { result } = renderHook(() => useListUrlState({ sort: SORT }), { wrapper: makeWrapper() })
    act(() => result.current.setPage(4))
    expect(new URLSearchParams(window.location.search).get('page')).toBe('4')
    act(() => result.current.setPage(1))
    expect(new URLSearchParams(window.location.search).get('page')).toBeNull()
  })

  it('preserves foreign params when writing', () => {
    setUrl('/?type=CASH_DRAWING')
    const { result } = renderHook(() => useListUrlState({ sort: SORT }), { wrapper: makeWrapper() })
    act(() => result.current.setPage(2))
    const params = new URLSearchParams(window.location.search)
    expect(params.get('type')).toBe('CASH_DRAWING')
    expect(params.get('page')).toBe('2')
  })

  it('preserves window.history.state when writing', () => {
    window.history.replaceState({ idx: 7 }, '', '/')
    const { result } = renderHook(() => useListUrlState({ sort: SORT }), { wrapper: makeWrapper() })
    act(() => result.current.setPage(2))
    expect(window.history.state).toEqual({ idx: 7 })
  })
})

describe('useListUrlState — mutations', () => {
  it('setLimit resets the page to 1', () => {
    const { result } = renderHook(() => useListUrlState({ sort: SORT }), { wrapper: makeWrapper() })
    act(() => result.current.setPage(5))
    act(() => result.current.setLimit(50))
    expect(result.current.page).toBe(1)
    expect(result.current.limit).toBe(50)
  })

  it('setSort() with no argument toggles the order and resets the page', () => {
    const { result } = renderHook(() => useListUrlState({ sort: SORT }), { wrapper: makeWrapper() })
    act(() => result.current.setPage(3))
    act(() => result.current.setSort())
    expect(result.current.sortOrder).toBe('asc')
    expect(result.current.page).toBe(1)
    act(() => result.current.setSort())
    expect(result.current.sortOrder).toBe('desc')
  })

  it('setSort(sameField) toggles, setSort(otherField) switches at desc', () => {
    const sort = { fields: ['name', 'sku'] as const, defaultField: 'name' as const, defaultOrder: 'asc' as const }
    const { result } = renderHook(() => useListUrlState({ sort }), { wrapper: makeWrapper() })
    expect(result.current.sortOrder).toBe('asc')

    act(() => result.current.setSort('name'))
    expect(result.current.sortBy).toBe('name')
    expect(result.current.sortOrder).toBe('desc')

    act(() => result.current.setSort('sku'))
    expect(result.current.sortBy).toBe('sku')
    expect(result.current.sortOrder).toBe('desc')
  })

  it('resetPage returns to page 1', () => {
    const { result } = renderHook(() => useListUrlState({ sort: SORT }), { wrapper: makeWrapper() })
    act(() => result.current.setPage(6))
    act(() => result.current.resetPage())
    expect(result.current.page).toBe(1)
  })
})

describe('useListUrlState — capability gating', () => {
  it('pagination:false never writes page/limit and leaves a foreign page param intact', () => {
    setUrl('/?page=9')
    const { result } = renderHook(
      () => useListUrlState({ pagination: false, sort: SORT }),
      { wrapper: makeWrapper() },
    )
    act(() => result.current.setSort())
    const params = new URLSearchParams(window.location.search)
    expect(params.get('page')).toBe('9')
    expect(params.get('sortOrder')).toBe('asc')
  })

  it('omitting sort never writes sortBy/sortOrder', () => {
    setUrl('/?sortBy=foreign')
    const { result } = renderHook(() => useListUrlState(), { wrapper: makeWrapper() })
    act(() => result.current.setPage(2))
    const params = new URLSearchParams(window.location.search)
    expect(params.get('sortBy')).toBe('foreign')
    expect(params.get('page')).toBe('2')
  })
})

describe('getManagedListParamKeys', () => {
  it('returns keys only for enabled capabilities', async () => {
    const { getManagedListParamKeys } = await import('@/hooks/useListUrlState')
    expect(getManagedListParamKeys({ sort: SORT })).toEqual(['page', 'limit', 'sortBy', 'sortOrder'])
    expect(getManagedListParamKeys()).toEqual(['page', 'limit'])
    expect(getManagedListParamKeys({ pagination: false, sort: SORT })).toEqual(['sortBy', 'sortOrder'])
    expect(getManagedListParamKeys({ namespace: 'orders', sort: SORT })).toEqual([
      'orders_page', 'orders_limit', 'orders_sortBy', 'orders_sortOrder',
    ])
  })
})

describe('useListUrlState — namespacing', () => {
  it('writes only namespaced keys', () => {
    const { result } = renderHook(
      () => useListUrlState({ namespace: 'orders', sort: SORT }),
      { wrapper: makeWrapper() },
    )
    act(() => result.current.setPage(2))
    const params = new URLSearchParams(window.location.search)
    expect(params.get('orders_page')).toBe('2')
    expect(params.get('page')).toBeNull()
  })

  it('two namespaced instances do not clobber each other', () => {
    const { result } = renderHook(
      () => ({
        a: useListUrlState({ namespace: 'a' }),
        b: useListUrlState({ namespace: 'b' }),
      }),
      { wrapper: makeWrapper() },
    )
    act(() => result.current.a.setPage(2))
    act(() => result.current.b.setPage(5))
    const params = new URLSearchParams(window.location.search)
    expect(params.get('a_page')).toBe('2')
    expect(params.get('b_page')).toBe('5')
  })
})

describe('useListUrlState + useFilterBar co-existence', () => {
  it('neither hook drops the other params', async () => {
    const { useFilterBar } = await import('@/hooks/useFilterBar')
    const filterConfig = {
      search: { placeholder: '', debounceMs: 0 },
      fields: [{ field: 'status' as const, label: 'Status', type: 'select' as const, options: [{ value: 'active', label: 'Active' }] }],
      defaults: { search: '', status: null },
    }

    const { result } = renderHook(
      () => ({
        list: useListUrlState({ sort: SORT }),
        filters: useFilterBar<{ search: string; status: string | null }>(filterConfig),
      }),
      { wrapper: makeWrapper() },
    )

    act(() => result.current.list.setPage(3))
    act(() => result.current.filters.handlers.onQuickFilterChange('status', 'active'))

    const params = new URLSearchParams(window.location.search)
    expect(params.get('page')).toBe('3')
    expect(params.get('status')).toBe('active')
  })
})

describe('post-mount ticket generation (regression: stale useLocation)', () => {
  it('builds a ticket from state changed AFTER mount, not the mount-time URL', async () => {
    const { withCurrentListQuery } = await import('@/utils/listQuery')
    setUrl('/list')

    const { result } = renderHook(() => useListUrlState({ sort: SORT }), { wrapper: makeWrapper() })

    // Change list state after mount, exactly as a user sorting then paging would.
    // Order matters: setSort() resets page to 1, so sort first, then page.
    act(() => result.current.setSort())
    act(() => result.current.setPage(3))

    // The ticket must reflect the CURRENT visible list state. Building it from
    // React Router's useLocation().search would yield '' here, because native
    // replaceState does not notify the router.
    const url = withCurrentListQuery('/list/EQ-1/view')
    const ticket = new URLSearchParams(url.slice(url.indexOf('?'))).get('listQuery')
    const inner = new URLSearchParams(ticket ?? '')

    expect(inner.get('page')).toBe('3')
    expect(inner.get('sortOrder')).toBe('asc')
  })

  it('round-trips that ticket back to the list', async () => {
    const { withCurrentListQuery, currentListPath } = await import('@/utils/listQuery')
    setUrl('/list')
    const { result } = renderHook(() => useListUrlState({ sort: SORT }), { wrapper: makeWrapper() })
    act(() => result.current.setPage(2))

    const detailUrl = withCurrentListQuery('/list/EQ-1/view')
    setUrl(detailUrl)

    expect(currentListPath('/list')).toBe('/list?page=2')
  })
})
