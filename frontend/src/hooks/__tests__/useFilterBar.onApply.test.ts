import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import React from 'react'

import { useFilterBar } from '@/hooks/useFilterBar'
import type { FilterBarConfig } from '@/types/filterBar.types'

interface F { search: string; status: string | null }

const config: FilterBarConfig<F> = {
  search: { placeholder: 'Search...' },
  fields: [
    {
      field: 'status',
      label: 'Status',
      type: 'select',
      options: [{ value: 'active', label: 'Active' }],
    },
  ],
  defaults: { search: '', status: null },
}

const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(MemoryRouter, null, children)

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
afterEach(() => { vi.useRealTimers() })

describe('useFilterBar onApply', () => {
  it('fires when a quick filter changes', () => {
    const onApply = vi.fn()
    const { result } = renderHook(() => useFilterBar(config, { onApply }), { wrapper })
    act(() => { result.current.handlers.onQuickFilterChange('status', 'active') })
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('fires when the search box is cleared', () => {
    const onApply = vi.fn()
    const { result } = renderHook(() => useFilterBar(config, { onApply }), { wrapper })
    act(() => { result.current.handlers.onSearchChange('') })
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('fires from the debounced search path', () => {
    const onApply = vi.fn()
    const { result } = renderHook(() => useFilterBar(config, { onApply }), { wrapper })
    act(() => { result.current.handlers.onSearchChange('abc') })
    expect(onApply).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(500) })
    expect(onApply).toHaveBeenCalledTimes(1)
  })

  it('fires on commit, clear-field, and clear-all', () => {
    const onApply = vi.fn()
    const { result } = renderHook(() => useFilterBar(config, { onApply }), { wrapper })
    act(() => { result.current.handlers.onSearchCommit() })
    act(() => { result.current.handlers.onClearField('status') })
    act(() => { result.current.handlers.onClearAll() })
    expect(onApply).toHaveBeenCalledTimes(3)
  })

  it('is optional — existing callers are unaffected', () => {
    const { result } = renderHook(() => useFilterBar(config), { wrapper })
    act(() => { result.current.handlers.onQuickFilterChange('status', 'active') })
    expect(result.current.appliedFilters.status).toBe('active')
  })
})
