import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import type { FilterBarConfig } from '../filterBar.types'
import { useFilterBar } from '../useFilterBar'

interface Filters {
  search: string
  status: string | null
  tags: string[]
}

const config: FilterBarConfig<Filters> = {
  search: { placeholder: '', debounceMs: 0 },
  quick: [
    { field: 'status', label: 'Status', type: 'select', options: [{ value: 'active', label: 'Active' }] },
  ],
  advanced: [
    { field: 'tags', label: 'Tags', type: 'multi-select', options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] },
  ],
  defaults: { search: '', status: null, tags: [] },
}

function makeWrapper(initialUrl = '/') {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
  )
}

describe('useFilterBar', () => {
  it('starts from defaults when URL is empty', () => {
    const { result } = renderHook(() => useFilterBar(config), { wrapper: makeWrapper() })
    expect(result.current.appliedFilters).toEqual({ search: '', status: null, tags: [] })
    expect(result.current.draftFilters).toEqual({ search: '', status: null, tags: [] })
  })

  it('restores filters from URL', () => {
    const { result } = renderHook(() => useFilterBar(config), { wrapper: makeWrapper('/?search=gundam&status=active') })
    expect(result.current.appliedFilters.search).toBe('gundam')
    expect(result.current.appliedFilters.status).toBe('active')
  })

  it('updates quick filters immediately in draft and applied state', () => {
    const { result } = renderHook(() => useFilterBar(config), { wrapper: makeWrapper() })
    act(() => {
      result.current.handlers.onQuickFilterChange('status', 'active')
    })
    expect(result.current.draftFilters.status).toBe('active')
    expect(result.current.appliedFilters.status).toBe('active')
  })

  it('updates search draft immediately and applied after debounce', async () => {
    const { result } = renderHook(() => useFilterBar(config), { wrapper: makeWrapper() })
    await act(async () => {
      result.current.handlers.onSearchChange('gun')
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(result.current.draftFilters.search).toBe('gun')
    expect(result.current.appliedFilters.search).toBe('gun')
  })

  it('supports advanced draft, apply, cancel, and clear', () => {
    const { result } = renderHook(() => useFilterBar(config), { wrapper: makeWrapper() })

    act(() => {
      result.current.handlers.onAdvancedDraftChange('tags', ['a'])
    })
    expect(result.current.appliedFilters.tags).toEqual([])
    expect(result.current.hasUnappliedChanges).toBe(true)

    act(() => {
      result.current.handlers.onAdvancedCancel()
    })
    expect(result.current.draftFilters.tags).toEqual([])

    act(() => {
      result.current.handlers.onAdvancedDraftChange('tags', ['a', 'b'])
    })

    act(() => {
      result.current.handlers.onAdvancedApply()
    })
    expect(result.current.appliedFilters.tags).toEqual(['a', 'b'])
    expect(result.current.activeChips).toEqual([{ field: 'tags', label: 'Tags: 2 selected' }])

    act(() => {
      result.current.handlers.onClearAll()
    })
    expect(result.current.hasActiveFilters).toBe(false)
  })
})
