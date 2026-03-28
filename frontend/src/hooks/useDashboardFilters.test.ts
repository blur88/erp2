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
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('this_month')
    expect(result.current.compareWith).toBeNull()
    expect(result.current.customFrom).toBeNull()
    expect(result.current.customTo).toBeNull()
  })

  it('reads period and compare from URL on mount', () => {
    setUrl('?sales_period=last_month&sales_compare=last_year')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('last_month')
    expect(result.current.compareWith).toBe('last_year')
  })

  it('normalizes invalid period to this_month on mount', () => {
    setUrl('?sales_period=garbage')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('this_month')
  })

  it('normalizes period=custom without from/to to this_month on mount', () => {
    setUrl('?sales_period=custom')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('this_month')
  })

  it('normalizes period=custom with from > to to this_month on mount', () => {
    setUrl('?sales_period=custom&sales_from=2026-03-31&sales_to=2026-03-01')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('this_month')
  })

  it('accepts valid period=custom with from and to', () => {
    setUrl('?sales_period=custom&sales_from=2026-03-01&sales_to=2026-03-31')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('custom')
    expect(result.current.customFrom).toBe('2026-03-01')
    expect(result.current.customTo).toBe('2026-03-31')
  })

  it('normalizes invalid compare value to null', () => {
    setUrl('?sales_compare=garbage')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.compareWith).toBeNull()
  })

  it('setPeriod updates period and clears from/to for non-custom', () => {
    setUrl('?sales_period=custom&sales_from=2026-03-01&sales_to=2026-03-31')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    act(() => {
      result.current.setPeriod('this_month')
    })
    expect(result.current.period).toBe('this_month')
    expect(result.current.customFrom).toBeNull()
    expect(result.current.customTo).toBeNull()
  })

  it('reset restores defaults', () => {
    setUrl('?sales_period=last_month&sales_compare=last_year')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    act(() => {
      result.current.reset()
    })
    expect(result.current.period).toBe('this_month')
    expect(result.current.compareWith).toBeNull()
  })

  it('resolvedApiParams maps this_month to dateRange=this_month', () => {
    setUrl('?sales_period=this_month')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.resolvedApiParams.dateRange).toBe('this_month')
    expect(result.current.resolvedApiParams.groupBy).toBe('day')
    expect(result.current.resolvedApiParams.compareWith).toBeUndefined()
  })

  it('resolvedApiParams maps last_7_days to explicit startDate/endDate', () => {
    setUrl('?sales_period=last_7_days')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.resolvedApiParams.dateRange).toBeUndefined()
    expect(result.current.resolvedApiParams.startDate).toBeDefined()
    expect(result.current.resolvedApiParams.groupBy).toBe('day')
  })

  it('resolvedApiParams includes compareWith when set', () => {
    setUrl('?sales_period=this_month&sales_compare=previous_period')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.resolvedApiParams.compareWith).toBe('previous_period')
  })

  it('preserves a custom from date before the to date is selected', () => {
    setUrl('?sales_period=custom')
    const { result } = renderHook(() => useDashboardFilters('sales'))

    act(() => {
      result.current.setCustomFrom('2026-03-01')
    })

    expect(result.current.period).toBe('custom')
    expect(result.current.customFrom).toBe('2026-03-01')
    expect(result.current.customTo).toBeNull()
  })

  it('preserves a custom to date before the from date is selected', () => {
    setUrl('?sales_period=custom')
    const { result } = renderHook(() => useDashboardFilters('sales'))

    act(() => {
      result.current.setCustomTo('2026-03-31')
    })

    expect(result.current.period).toBe('custom')
    expect(result.current.customFrom).toBeNull()
    expect(result.current.customTo).toBe('2026-03-31')
  })

  it('reads from namespace-prefixed URL params (not bare keys)', () => {
    setUrl('?period=last_month&compare=last_year')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('this_month')
    expect(result.current.compareWith).toBeNull()
  })

  it('writes namespace-prefixed keys to the URL', () => {
    setUrl('')
    const replaceState = vi.fn()
    vi.stubGlobal('history', { replaceState })
    const { result } = renderHook(() => useDashboardFilters('purchasing'))
    act(() => {
      result.current.setPeriod('last_month')
    })
    const calledUrl: string = replaceState.mock.calls[0][2]
    expect(calledUrl).toContain('purchasing_period=last_month')
  })

  it('two namespaces in the same URL are independent', () => {
    setUrl('?sales_period=today&purchasing_period=last_month')
    const { result: salesResult } = renderHook(() => useDashboardFilters('sales'))
    const { result: purchasingResult } = renderHook(() => useDashboardFilters('purchasing'))
    expect(salesResult.current.period).toBe('today')
    expect(purchasingResult.current.period).toBe('last_month')
  })

  describe('new filters: customerId, isFulfilled, paymentStatus', () => {
    it('returns null for all three when URL is empty', () => {
      setUrl('')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.customerId).toBeNull()
      expect(result.current.isFulfilled).toBeNull()
      expect(result.current.paymentStatus).toBeNull()
    })

    it('reads customerId from URL on mount', () => {
      setUrl('?sales_customer=abc-123')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.customerId).toBe('abc-123')
    })

    it('reads isFulfilled=true from URL on mount', () => {
      setUrl('?sales_fulfilled=true')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.isFulfilled).toBe(true)
    })

    it('reads isFulfilled=false from URL on mount', () => {
      setUrl('?sales_fulfilled=false')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.isFulfilled).toBe(false)
    })

    it('reads paymentStatus from URL on mount', () => {
      setUrl('?sales_payment=paid')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.paymentStatus).toBe('paid')
    })

    it('ignores invalid paymentStatus value', () => {
      setUrl('?sales_payment=garbage')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.paymentStatus).toBeNull()
    })

    it('setCustomerId writes to URL and updates state', () => {
      setUrl('')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      act(() => { result.current.setCustomerId('uuid-999') })
      expect(result.current.customerId).toBe('uuid-999')
      const replaceState = window.history.replaceState as ReturnType<typeof vi.fn>
      expect(replaceState).toHaveBeenCalled()
    })

    it('reset clears all three new filters', () => {
      setUrl('?sales_customer=abc&sales_fulfilled=true&sales_payment=paid')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      act(() => { result.current.reset() })
      expect(result.current.customerId).toBeNull()
      expect(result.current.isFulfilled).toBeNull()
      expect(result.current.paymentStatus).toBeNull()
    })

    it('isDefault is false when customerId is set', () => {
      setUrl('?sales_customer=abc')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.isDefault).toBe(false)
    })

    it('resolvedApiParams includes customerId when set', () => {
      setUrl('?sales_customer=abc-123')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.resolvedApiParams.customerId).toBe('abc-123')
    })

    it('resolvedApiParams includes isFulfilled when set', () => {
      setUrl('?sales_fulfilled=true')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.resolvedApiParams.isFulfilled).toBe(true)
    })

    it('resolvedApiParams includes paymentStatus when set', () => {
      setUrl('?sales_payment=partial_paid')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.resolvedApiParams.paymentStatus).toBe('partial_paid')
    })
  })
})
