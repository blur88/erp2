import { describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

import { useFilterBar } from '@/hooks/useFilterBar'
import type { FilterBarConfig } from '@/types/filterBar.types'

interface F { status: string | null }

const config: FilterBarConfig<F> = {
  fields: [
    {
      field: 'status',
      label: 'Status',
      type: 'select',
      options: [{ value: 'active', label: 'Active' }],
    },
  ],
}

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(MemoryRouter, null, children)

describe('useFilterBar select defaults', () => {
  it('defaults a select field to null, not undefined', () => {
    const { result } = renderHook(() => useFilterBar(config), { wrapper })
    expect(result.current.appliedFilters.status).toBeNull()
    expect('status' in result.current.appliedFilters).toBe(true)
    expect(result.current.hasActiveFilters).toBe(false)
  })

  it('restores null and clears the active flag after Clear All', () => {
    const { result } = renderHook(() => useFilterBar(config), { wrapper })

    act(() => { result.current.handlers.onQuickFilterChange('status', 'active') })
    expect(result.current.appliedFilters.status).toBe('active')
    expect(result.current.hasActiveFilters).toBe(true)

    act(() => { result.current.handlers.onClearAll() })
    expect(result.current.appliedFilters.status).toBeNull()
    expect(result.current.appliedFilters.status).not.toBeUndefined()
    expect(result.current.hasActiveFilters).toBe(false)
  })

  it('restores null after clearing the single field', () => {
    const { result } = renderHook(() => useFilterBar(config), { wrapper })
    act(() => { result.current.handlers.onQuickFilterChange('status', 'active') })
    act(() => { result.current.handlers.onClearField('status') })
    expect(result.current.appliedFilters.status).toBeNull()
    expect(result.current.hasActiveFilters).toBe(false)
  })
})
