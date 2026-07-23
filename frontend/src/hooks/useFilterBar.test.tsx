import { act, renderHook } from '@testing-library/react'
import React from 'react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { STATUS_OPTIONS } from '@/constants/filterOptions'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { useFilterBar } from '@/hooks/useFilterBar'

interface Filters {
  search: string
  status: string | null
}

const config: FilterBarConfig<Filters> = {
  search: { placeholder: '', debounceMs: 0 },
  fields: [
    { field: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
  ],
  defaults: { search: '', status: null },
}

function makeWrapper(initialUrl = '/') {
  return ({ children }: { children: React.ReactNode }) => (
    <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
  )
}

describe('useFilterBar', () => {
  it('starts from defaults when URL is empty', () => {
    const { result } = renderHook(() => useFilterBar(config), { wrapper: makeWrapper() })
    expect(result.current.appliedFilters).toEqual({ search: '', status: null })
    expect(result.current.draftFilters).toEqual({ search: '', status: null })
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

  it('clears all filters', () => {
    const { result } = renderHook(() => useFilterBar(config), { wrapper: makeWrapper() })
    act(() => {
      result.current.handlers.onQuickFilterChange('status', 'active')
    })
    expect(result.current.hasActiveFilters).toBe(true)
    act(() => {
      result.current.handlers.onClearAll()
    })
    expect(result.current.hasActiveFilters).toBe(false)
  })
})

describe('useFilterBar — period field', () => {
  it('defaults period key to null when no default is configured', () => {
    interface PeriodFilters {
      period: PeriodValue
    }

    const periodConfig: FilterBarConfig<PeriodFilters> = {
      fields: [{ field: 'period', label: 'Period', type: 'period' }],
    }

    const { result } = renderHook(() => useFilterBar(periodConfig), { wrapper: makeWrapper() })

    expect(result.current.appliedFilters.period.key).toBeNull()
  })

  it('updates period value via onQuickFilterChange', () => {
    interface PeriodFilters {
      period: PeriodValue
    }

    const periodConfig: FilterBarConfig<PeriodFilters> = {
      fields: [{ field: 'period', label: 'Period', type: 'period' }],
    }

    const { result } = renderHook(() => useFilterBar(periodConfig), { wrapper: makeWrapper() })

    act(() => {
      result.current.handlers.onQuickFilterChange('period', { key: 'last_week', from: null, to: null })
    })

    expect(result.current.appliedFilters.period).toEqual({ key: 'last_week', from: null, to: null })
  })

  it('hasActiveFilters is false when period key is null (default)', () => {
    interface PeriodFilters {
      period: PeriodValue
    }

    const periodConfig: FilterBarConfig<PeriodFilters> = {
      fields: [{ field: 'period', label: 'Period', type: 'period' }],
    }

    const { result } = renderHook(() => useFilterBar(periodConfig), { wrapper: makeWrapper() })

    expect(result.current.hasActiveFilters).toBe(false)
  })

  it('hasActiveFilters is true after period key is set', () => {
    interface PeriodFilters {
      period: PeriodValue
    }

    const periodConfig: FilterBarConfig<PeriodFilters> = {
      fields: [{ field: 'period', label: 'Period', type: 'period' }],
    }

    const { result } = renderHook(() => useFilterBar(periodConfig), { wrapper: makeWrapper() })

    act(() => {
      result.current.handlers.onQuickFilterChange('period', { key: 'this_week', from: null, to: null })
    })

    expect(result.current.hasActiveFilters).toBe(true)
  })
})
