import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import ThemeWrapper from '@/components/common/ThemeWrapper'
import { useLayoutScroll } from '@/contexts/LayoutScrollContext'
import DashboardPage from './DashboardPage'

vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ currency: 'USD' }),
}))

vi.mock('@/contexts/LayoutScrollContext', () => ({
  useLayoutScroll: vi.fn(),
}))

vi.mock('@/store/api/salesApi', () => ({
  useGetSalesOrdersQuery: () => ({
    data: { data: [] },
    isLoading: false,
    error: undefined,
  }),
  useGetPaymentsQuery: () => ({
    data: { data: [] },
    isLoading: false,
    error: undefined,
  }),
}))

vi.mock('@/store/api/purchasingApi', () => ({
  useGetPurchaseOrdersQuery: () => ({
    data: { data: [] },
    isLoading: false,
    error: undefined,
  }),
  useGetSuppliersQuery: () => ({
    data: { data: [] },
    isLoading: false,
    error: undefined,
  }),
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useGetDashboardStatsQuery: () => ({
    data: {
      totalProducts: 0,
      totalCategories: 0,
      inventoryValue: 0,
      outOfStockCount: 0,
      stockHealthMetrics: {
        inStockPercentage: 100,
        outOfStockPercentage: 0,
      },
    },
    isLoading: false,
    error: undefined,
  }),
  useGetOutOfStockProductsQuery: () => ({
    data: { data: { items: [] } },
    isLoading: false,
    error: undefined,
  }),
}))

vi.mock('./components', () => ({
  DashboardStats: () => <div>Dashboard stats</div>,
  QuickActions: () => <div>Quick actions</div>,
  BusinessPerformanceChart: () => <div>Business performance</div>,
  RecentSalesTable: () => <div>Recent sales</div>,
  RecentPurchasesTable: () => <div>Recent purchases</div>,
  TopPerformers: () => <div>Top performers</div>,
  InventoryOverview: () => <div>Inventory overview</div>,
}))

describe('DashboardPage', () => {
  it('renders when out-of-stock response data is not an array', () => {
    render(
      <ThemeWrapper>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </ThemeWrapper>,
    )

    expect(screen.getByText('Dashboard')).toBeInTheDocument()
    expect(screen.getByText('Inventory overview')).toBeInTheDocument()
  })

  it('opts in to layout scrolling', () => {
    render(
      <ThemeWrapper>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </ThemeWrapper>,
    )

    expect(useLayoutScroll).toHaveBeenCalledWith(true)
  })
})
