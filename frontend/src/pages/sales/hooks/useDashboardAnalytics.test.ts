import { renderHook, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { useDashboardAnalytics } from './useDashboardAnalytics'

vi.mock('@/services/api', () => ({
  default: { get: vi.fn() },
}))

import api from '@/services/api'

const mockCurrentData = {
  current: {
    metrics: { totalRevenue: 1000, totalOrders: 10, averageOrderValue: 100, newCustomers: 2 },
    periodData: [{ period: '2026-03-01', revenue: 1000, orders: 10, newCustomers: 2, averageOrderValue: 100 }],
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
  },
  topCustomers: [],
  topProducts: [],
}

describe('useDashboardAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('starts with isLoading=true and no data', () => {
    vi.mocked(api.get).mockReturnValue(new Promise(() => {}))
    const { result } = renderHook(() => useDashboardAnalytics({ dateRange: 'this_month', groupBy: 'day' }))
    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeNull()
  })

  it('returns data and isLoading=false after successful fetch', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: mockCurrentData })
    const { result } = renderHook(() => useDashboardAnalytics({ dateRange: 'this_month', groupBy: 'day' }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.data?.current.metrics.totalRevenue).toBe(1000)
    expect(result.current.error).toBeNull()
  })

  it('sets error on fetch failure and data remains null on first load', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('Network error'))
    const { result } = renderHook(() => useDashboardAnalytics({ dateRange: 'this_month', groupBy: 'day' }))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.error).toBeInstanceOf(Error)
    expect(result.current.data).toBeNull()
  })

  it('preserves existing data when a subsequent fetch fails', async () => {
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: mockCurrentData })
      .mockRejectedValueOnce(new Error('Network error'))

    const { result, rerender } = renderHook(
      (params) => useDashboardAnalytics(params),
      { initialProps: { dateRange: 'this_month' as const, groupBy: 'day' as const } },
    )
    await waitFor(() => expect(result.current.data).not.toBeNull())

    rerender({ dateRange: 'last_month', groupBy: 'day' })
    await waitFor(() => expect(result.current.error).not.toBeNull())

    expect(result.current.data?.current.metrics.totalRevenue).toBe(1000)
  })

  it('isFetching is true while request is in-flight after first load', async () => {
    let resolve!: (v: unknown) => void
    vi.mocked(api.get)
      .mockResolvedValueOnce({ data: mockCurrentData })
      .mockReturnValueOnce(new Promise((r) => { resolve = r }))

    const { result, rerender } = renderHook(
      (params) => useDashboardAnalytics(params),
      { initialProps: { dateRange: 'this_month' as const, groupBy: 'day' as const } },
    )
    await waitFor(() => expect(result.current.data).not.toBeNull())

    rerender({ dateRange: 'last_month', groupBy: 'day' })
    expect(result.current.isFetching).toBe(true)
    expect(result.current.isLoading).toBe(false)
    resolve({ data: mockCurrentData })
  })
})
