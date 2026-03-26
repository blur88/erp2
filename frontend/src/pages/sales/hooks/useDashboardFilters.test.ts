// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useDashboardFilters } from './useDashboardFilters'

function setUrl(search: string) {
  vi.stubGlobal('location', { search, pathname: '/', href: `http://localhost/${search}` })
  vi.stubGlobal('history', { replaceState: vi.fn() })
}

beforeEach(() => {
  setUrl('')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useDashboardFilters', () => {
  it('returns default period=this_month and compareWith=null when URL is empty', () => {
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.period).toBe('this_month')
    expect(result.current.compareWith).toBeNull()
    expect(result.current.customFrom).toBeNull()
    expect(result.current.customTo).toBeNull()
  })

  it('reads period and compare from URL on mount', () => {
    setUrl('?period=last_month&compare=last_year')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.period).toBe('last_month')
    expect(result.current.compareWith).toBe('last_year')
  })

  it('normalizes invalid period to this_month on mount', () => {
    setUrl('?period=garbage')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.period).toBe('this_month')
  })

  it('normalizes period=custom without from/to to this_month on mount', () => {
    setUrl('?period=custom')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.period).toBe('this_month')
  })

  it('normalizes period=custom with from > to to this_month on mount', () => {
    setUrl('?period=custom&from=2026-03-31&to=2026-03-01')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.period).toBe('this_month')
  })

  it('accepts valid period=custom with from and to', () => {
    setUrl('?period=custom&from=2026-03-01&to=2026-03-31')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.period).toBe('custom')
    expect(result.current.customFrom).toBe('2026-03-01')
    expect(result.current.customTo).toBe('2026-03-31')
  })

  it('normalizes invalid compare value to null', () => {
    setUrl('?compare=garbage')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.compareWith).toBeNull()
  })

  it('setPeriod updates period and clears from/to for non-custom', () => {
    setUrl('?period=custom&from=2026-03-01&to=2026-03-31')
    const { result } = renderHook(() => useDashboardFilters())
    act(() => {
      result.current.setPeriod('this_month')
    })
    expect(result.current.period).toBe('this_month')
    expect(result.current.customFrom).toBeNull()
    expect(result.current.customTo).toBeNull()
  })

  it('reset restores defaults', () => {
    setUrl('?period=last_month&compare=last_year')
    const { result } = renderHook(() => useDashboardFilters())
    act(() => {
      result.current.reset()
    })
    expect(result.current.period).toBe('this_month')
    expect(result.current.compareWith).toBeNull()
  })

  it('resolvedApiParams maps this_month to dateRange=this_month', () => {
    setUrl('?period=this_month')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.resolvedApiParams.dateRange).toBe('this_month')
    expect(result.current.resolvedApiParams.groupBy).toBe('day')
    expect(result.current.resolvedApiParams.compareWith).toBeUndefined()
  })

  it('resolvedApiParams maps last_7_days to explicit startDate/endDate', () => {
    setUrl('?period=last_7_days')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.resolvedApiParams.dateRange).toBeUndefined()
    expect(result.current.resolvedApiParams.startDate).toBeDefined()
    expect(result.current.resolvedApiParams.groupBy).toBe('day')
  })

  it('resolvedApiParams includes compareWith when set', () => {
    setUrl('?period=this_month&compare=previous_period')
    const { result } = renderHook(() => useDashboardFilters())
    expect(result.current.resolvedApiParams.compareWith).toBe('previous_period')
  })

  it('preserves a custom from date before the to date is selected', () => {
    setUrl('?period=custom')
    const { result } = renderHook(() => useDashboardFilters())

    act(() => {
      result.current.setCustomFrom('2026-03-01')
    })

    expect(result.current.period).toBe('custom')
    expect(result.current.customFrom).toBe('2026-03-01')
    expect(result.current.customTo).toBeNull()
  })

  it('preserves a custom to date before the from date is selected', () => {
    setUrl('?period=custom')
    const { result } = renderHook(() => useDashboardFilters())

    act(() => {
      result.current.setCustomTo('2026-03-31')
    })

    expect(result.current.period).toBe('custom')
    expect(result.current.customFrom).toBeNull()
    expect(result.current.customTo).toBe('2026-03-31')
  })
})
