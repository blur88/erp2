import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PurchasingPage from '../PurchasingPage'

const mockUseGetSuppliersQuery = vi.fn()
const mockUsePurchasingAnalytics = vi.fn()
const dashboardFilterBarSpy = vi.fn()

vi.mock('@/store/api/purchasingApi', () => ({
  useGetSuppliersQuery: (...args: unknown[]) => mockUseGetSuppliersQuery(...args),
}))

vi.mock('../hooks/usePurchasingAnalytics', () => ({
  usePurchasingAnalytics: (...args: unknown[]) => mockUsePurchasingAnalytics(...args),
}))

vi.mock('@/components/filters/DashboardFilterBar', () => ({
  DashboardFilterBar: (props: unknown) => {
    dashboardFilterBarSpy(props)
    return <div data-testid="dashboard-filter-bar" />
  },
}))

vi.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="purchasing-line-chart" />,
}))

describe('PurchasingPage filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseGetSuppliersQuery.mockReturnValue({
      data: {
        data: [
          { id: '550e8400-e29b-41d4-a716-446655440001', companyName: 'Acme Supplies' },
        ],
      },
    })
    mockUsePurchasingAnalytics.mockReturnValue({
      data: {
        current: {
          metrics: { totalSpent: 0, totalOrders: 0, averageOrderValue: 0, activeSuppliers: 0 },
          periodData: [],
          periodStart: '2026-03-01',
          periodEnd: '2026-03-31',
        },
        topSuppliers: [],
        recentOrders: [],
      },
      isLoading: false,
      isFetching: false,
      error: null,
    })
    window.history.replaceState({}, '', '/?purchasing_supplier=550e8400-e29b-41d4-a716-446655440001&purchasing_status=received&purchasing_payment=partial')
  })

  it('passes purchasing filter state into analytics and the shared filter bar', () => {
    render(
      <MemoryRouter>
        <PurchasingPage />
      </MemoryRouter>,
    )

    expect(mockUsePurchasingAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: '550e8400-e29b-41d4-a716-446655440001',
        status: 'received',
        paymentStatus: 'partial',
      }),
    )

    expect(dashboardFilterBarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        suppliers: [{ id: '550e8400-e29b-41d4-a716-446655440001', name: 'Acme Supplies' }],
        supplierId: '550e8400-e29b-41d4-a716-446655440001',
        status: 'received',
        paymentStatus: 'partial',
      }),
    )
  })

  it('renders the purchasing overview heading', () => {
    render(
      <MemoryRouter>
        <PurchasingPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Purchasing Overview')).toBeInTheDocument()
  })
})
