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

  it('accepts yesterday as a valid period from URL', () => {
    setUrl('?sales_period=yesterday')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('yesterday')
  })

  it('accepts this_week as a valid period from URL', () => {
    setUrl('?sales_period=this_week')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('this_week')
  })

  it('accepts last_week as a valid period from URL', () => {
    setUrl('?sales_period=last_week')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('last_week')
  })

  it('accepts this_year as a valid period from URL', () => {
    setUrl('?sales_period=this_year')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('this_year')
  })

  it('accepts last_year as a valid period from URL', () => {
    setUrl('?sales_period=last_year')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('last_year')
  })

  it('accepts last_30_days as a valid period from URL', () => {
    setUrl('?sales_period=last_30_days')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('last_30_days')
  })

  it('accepts last_365_days as a valid period from URL', () => {
    setUrl('?sales_period=last_365_days')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.period).toBe('last_365_days')
  })

  it('resolvedApiParams maps yesterday to explicit startDate/endDate', () => {
    setUrl('?sales_period=yesterday')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.resolvedApiParams.startDate).toBeDefined()
    expect(result.current.resolvedApiParams.endDate).toBeDefined()
    expect(result.current.resolvedApiParams.startDate).toBe(result.current.resolvedApiParams.endDate)
  })

  it('resolvedApiParams maps this_week to explicit startDate/endDate', () => {
    setUrl('?sales_period=this_week')
    const { result } = renderHook(() => useDashboardFilters('sales'))
    expect(result.current.resolvedApiParams.startDate).toBeDefined()
    expect(result.current.resolvedApiParams.endDate).toBeDefined()
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

  describe('new filters: customerId, supplierId, isFulfilled, status, paymentStatus', () => {
    it('returns null for all five when URL is empty', () => {
      setUrl('')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.customerId).toBeNull()
      expect(result.current.supplierId).toBeNull()
      expect(result.current.isFulfilled).toBeNull()
      expect(result.current.status).toBeNull()
      expect(result.current.paymentStatus).toBeNull()
    })

    it('reads valid UUID customerId from URL on mount', () => {
      setUrl('?sales_customer=550e8400-e29b-41d4-a716-446655440000')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.customerId).toBe('550e8400-e29b-41d4-a716-446655440000')
    })

    it('ignores non-UUID customerId value from URL', () => {
      setUrl('?sales_customer=not-a-uuid')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.customerId).toBeNull()
    })

    it('reads valid UUID supplierId from URL on mount', () => {
      setUrl('?purchasing_supplier=550e8400-e29b-41d4-a716-446655440001')
      const { result } = renderHook(() => useDashboardFilters('purchasing'))
      expect(result.current.supplierId).toBe('550e8400-e29b-41d4-a716-446655440001')
    })

    it('ignores non-UUID supplierId value from URL', () => {
      setUrl('?purchasing_supplier=not-a-uuid')
      const { result } = renderHook(() => useDashboardFilters('purchasing'))
      expect(result.current.supplierId).toBeNull()
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

    it('reads status from URL on mount', () => {
      setUrl('?purchasing_status=received')
      const { result } = renderHook(() => useDashboardFilters('purchasing'))
      expect(result.current.status).toBe('received')
    })

    it('reads paymentStatus from URL on mount', () => {
      setUrl('?sales_payment=paid')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.paymentStatus).toBe('paid')
    })

    it('reads purchasing paymentStatus from URL on mount', () => {
      setUrl('?purchasing_payment=partial')
      const { result } = renderHook(() => useDashboardFilters('purchasing'))
      expect(result.current.paymentStatus).toBe('partial')
    })

    it('ignores invalid paymentStatus value', () => {
      setUrl('?sales_payment=garbage')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.paymentStatus).toBeNull()
    })

    it('setCustomerId writes to URL and updates state', () => {
      setUrl('')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      act(() => { result.current.setCustomerId('550e8400-e29b-41d4-a716-446655440000') })
      expect(result.current.customerId).toBe('550e8400-e29b-41d4-a716-446655440000')
      const replaceState = window.history.replaceState as ReturnType<typeof vi.fn>
      expect(replaceState).toHaveBeenCalled()
    })

    it('setSupplierId writes to URL and updates state', () => {
      setUrl('')
      const { result } = renderHook(() => useDashboardFilters('purchasing'))
      act(() => { result.current.setSupplierId('550e8400-e29b-41d4-a716-446655440001') })
      expect(result.current.supplierId).toBe('550e8400-e29b-41d4-a716-446655440001')
      const replaceState = window.history.replaceState as ReturnType<typeof vi.fn>
      expect(replaceState).toHaveBeenCalled()
    })

    it('setFulfilled writes to URL and updates state', () => {
      setUrl('')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      act(() => { result.current.setFulfilled(true) })
      expect(result.current.isFulfilled).toBe(true)
      const replaceState = window.history.replaceState as ReturnType<typeof vi.fn>
      expect(replaceState).toHaveBeenCalled()
    })

    it('setStatus writes to URL and updates state', () => {
      setUrl('')
      const { result } = renderHook(() => useDashboardFilters('purchasing'))
      act(() => { result.current.setStatus('pending') })
      expect(result.current.status).toBe('pending')
      const replaceState = window.history.replaceState as ReturnType<typeof vi.fn>
      expect(replaceState).toHaveBeenCalled()
    })

    it('setPaymentStatus writes to URL and updates state', () => {
      setUrl('')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      act(() => { result.current.setPaymentStatus('paid') })
      expect(result.current.paymentStatus).toBe('paid')
      const replaceState = window.history.replaceState as ReturnType<typeof vi.fn>
      expect(replaceState).toHaveBeenCalled()
    })

    it('reset clears all filter extensions', () => {
      setUrl('?sales_customer=550e8400-e29b-41d4-a716-446655440000&purchasing_supplier=550e8400-e29b-41d4-a716-446655440001&purchasing_status=received&purchasing_payment=partial')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      act(() => { result.current.reset() })
      expect(result.current.customerId).toBeNull()
      expect(result.current.supplierId).toBeNull()
      expect(result.current.isFulfilled).toBeNull()
      expect(result.current.status).toBeNull()
      expect(result.current.paymentStatus).toBeNull()
    })

    it('isDefault is false when customerId is set', () => {
      setUrl('?sales_customer=550e8400-e29b-41d4-a716-446655440000')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.isDefault).toBe(false)
    })

    it('isDefault is false when supplierId is set', () => {
      setUrl('?purchasing_supplier=550e8400-e29b-41d4-a716-446655440001')
      const { result } = renderHook(() => useDashboardFilters('purchasing'))
      expect(result.current.isDefault).toBe(false)
    })

    it('resolvedApiParams includes customerId when set', () => {
      setUrl('?sales_customer=550e8400-e29b-41d4-a716-446655440000')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.resolvedApiParams.customerId).toBe('550e8400-e29b-41d4-a716-446655440000')
    })

    it('resolvedApiParams includes supplierId when set', () => {
      setUrl('?purchasing_supplier=550e8400-e29b-41d4-a716-446655440001')
      const { result } = renderHook(() => useDashboardFilters('purchasing'))
      expect(result.current.resolvedApiParams.supplierId).toBe('550e8400-e29b-41d4-a716-446655440001')
    })

    it('resolvedApiParams includes isFulfilled when set', () => {
      setUrl('?sales_fulfilled=true')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.resolvedApiParams.isFulfilled).toBe(true)
    })

    it('resolvedApiParams includes status when set', () => {
      setUrl('?purchasing_status=received')
      const { result } = renderHook(() => useDashboardFilters('purchasing'))
      expect(result.current.resolvedApiParams.status).toBe('received')
    })

    it('resolvedApiParams includes paymentStatus when set', () => {
      setUrl('?sales_payment=partial_paid')
      const { result } = renderHook(() => useDashboardFilters('sales'))
      expect(result.current.resolvedApiParams.paymentStatus).toBe('partial_paid')
    })

    it('resolvedApiParams includes purchasing paymentStatus when set', () => {
      setUrl('?purchasing_payment=unpaid')
      const { result } = renderHook(() => useDashboardFilters('purchasing'))
      expect(result.current.resolvedApiParams.paymentStatus).toBe('unpaid')
    })
  })

  describe('new filters: categoryId, stockStatus', () => {
    it('returns null for categoryId and stockStatus when URL is empty', () => {
      setUrl('')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.categoryId).toBeNull()
      expect(result.current.stockStatus).toBeNull()
    })

    it('reads valid UUID categoryId from URL on mount', () => {
      setUrl('?inventory_category=550e8400-e29b-41d4-a716-446655440010')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.categoryId).toBe('550e8400-e29b-41d4-a716-446655440010')
    })

    it('ignores non-UUID categoryId from URL', () => {
      setUrl('?inventory_category=not-a-uuid')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.categoryId).toBeNull()
    })

    it('reads valid stockStatus from URL on mount', () => {
      setUrl('?inventory_stock_status=low_stock')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.stockStatus).toBe('low_stock')
    })

    it('ignores invalid stockStatus value from URL', () => {
      setUrl('?inventory_stock_status=garbage')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.stockStatus).toBeNull()
    })

    it('setCategoryId updates state and writes to URL', () => {
      setUrl('')
      const replaceState = vi.fn()
      vi.stubGlobal('history', { replaceState })
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      act(() => { result.current.setCategoryId('550e8400-e29b-41d4-a716-446655440010') })
      expect(result.current.categoryId).toBe('550e8400-e29b-41d4-a716-446655440010')
      expect(replaceState).toHaveBeenCalled()
    })

    it('setStockStatus updates state and writes to URL', () => {
      setUrl('')
      const replaceState = vi.fn()
      vi.stubGlobal('history', { replaceState })
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      act(() => { result.current.setStockStatus('in_stock') })
      expect(result.current.stockStatus).toBe('in_stock')
      expect(replaceState).toHaveBeenCalled()
    })

    it('reset clears categoryId and stockStatus', () => {
      setUrl('?inventory_category=550e8400-e29b-41d4-a716-446655440010&inventory_stock_status=in_stock')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      act(() => { result.current.reset() })
      expect(result.current.categoryId).toBeNull()
      expect(result.current.stockStatus).toBeNull()
    })

    it('isDefault is false when categoryId is set', () => {
      setUrl('?inventory_category=550e8400-e29b-41d4-a716-446655440010')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.isDefault).toBe(false)
    })

    it('isDefault is false when stockStatus is set', () => {
      setUrl('?inventory_stock_status=out_of_stock')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.isDefault).toBe(false)
    })

    it('resolvedApiParams includes categoryId when set', () => {
      setUrl('?inventory_category=550e8400-e29b-41d4-a716-446655440010')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.resolvedApiParams.categoryId).toBe('550e8400-e29b-41d4-a716-446655440010')
    })

    it('resolvedApiParams includes stockStatus when set', () => {
      setUrl('?inventory_stock_status=low_stock')
      const { result } = renderHook(() => useDashboardFilters('inventory'))
      expect(result.current.resolvedApiParams.stockStatus).toBe('low_stock')
    })
  })
})
