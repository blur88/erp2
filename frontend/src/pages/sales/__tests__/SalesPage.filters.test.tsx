import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SalesPage from '../SalesPage'

const mockUseGetCustomersQuery = vi.fn()
const mockUseDashboardAnalytics = vi.fn()
const filterBarSpy = vi.fn()

vi.mock('@/store/api/salesApi', () => ({
  useGetCustomersQuery: (...args: unknown[]) => mockUseGetCustomersQuery(...args),
}))

vi.mock('../hooks/useDashboardAnalytics', () => ({
  useDashboardAnalytics: (...args: unknown[]) => mockUseDashboardAnalytics(...args),
}))

vi.mock('@/components/filters/FilterBar', () => ({
  FilterBar: (props: unknown) => {
    filterBarSpy(props)
    return <div data-testid="filter-bar" />
  },
}))

vi.mock('@/services/api', () => ({
  default: { get: vi.fn().mockResolvedValue({ data: { data: [] } }) },
}))

vi.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="sales-line-chart" />,
  Bar: () => <div data-testid="sales-bar-chart" />,
}))

const emptyAnalyticsData = {
  current: {
    metrics: {
      totalRevenue: 0,
      totalOrders: 0,
      newCustomers: 0,
      averageOrderValue: 0,
      conversionRate: 0,
      paidInvoicesAmount: 0,
      pendingInvoicesAmount: 0,
      overdueInvoicesAmount: 0,
      completedOrders: 0,
      confirmedOrders: 0,
      draftOrders: 0,
    },
    periodData: [],
    periodStart: '2026-03-01',
    periodEnd: '2026-03-31',
  },
  topCustomers: [],
  topProducts: [],
}

describe('SalesPage filters', () => {
  // URL uses namespace-prefixed keys: sales_fulfilled, sales_payment, sales_customer
  const initialEntry =
    '/?sales_fulfilled=fulfilled&sales_payment=paid&sales_customer=550e8400-e29b-41d4-a716-446655440001'

  beforeEach(() => {
    vi.clearAllMocks()
    mockUseGetCustomersQuery.mockReturnValue({
      data: {
        data: [{ id: '550e8400-e29b-41d4-a716-446655440001', name: 'Amuro Ray' }],
      },
    })
    mockUseDashboardAnalytics.mockReturnValue({
      data: emptyAnalyticsData,
      isLoading: false,
      isFetching: false,
      error: null,
    })
  })

  it('passes canonical fulfillmentStatus and paymentStatus into analytics', () => {
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <SalesPage />
      </MemoryRouter>,
    )

    expect(mockUseDashboardAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        fulfillmentStatus: 'fulfilled',
        paymentStatus: 'paid',
      }),
    )
  })

  it('passes customerId into analytics when set via URL', () => {
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <SalesPage />
      </MemoryRouter>,
    )

    expect(mockUseDashboardAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: '550e8400-e29b-41d4-a716-446655440001',
      }),
    )
  })

  it('omits fulfillmentStatus and paymentStatus from analytics when not set', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <SalesPage />
      </MemoryRouter>,
    )

    const call = mockUseDashboardAnalytics.mock.calls[0][0]
    expect(call.fulfillmentStatus).toBeUndefined()
    expect(call.paymentStatus).toBeUndefined()
  })

  it('renders the FilterBar component', () => {
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <SalesPage />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('filter-bar')).toBeInTheDocument()
  })

  it('renders the sales overview heading', () => {
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <SalesPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Sales Overview')).toBeInTheDocument()
  })
})
