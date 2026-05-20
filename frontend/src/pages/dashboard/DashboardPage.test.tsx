import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { vi } from 'vitest'
import DashboardPage from './DashboardPage'

// Mock all RTK Query hooks used by DashboardPage
vi.mock('@/store/api/inventoryApi', () => ({
  useGetDashboardStatsQuery: vi.fn(),
  useGetOutOfStockProductsQuery: vi.fn(),
}))
vi.mock('@/store/api/salesApi', () => ({
  useGetSalesOrdersQuery: vi.fn(),
  useGetPaymentsQuery: vi.fn(),
}))
vi.mock('@/store/api/purchasingApi', () => ({
  useGetPurchaseOrdersQuery: vi.fn(),
  useGetSuppliersQuery: vi.fn(),
}))
vi.mock('@/hooks/useCurrency', () => ({
  useCurrency: () => ({ currency: 'USD' }),
}))
vi.mock('./components', () => ({
  DashboardStats: () => <div data-testid="dashboard-stats" />,
  QuickActions: () => <div data-testid="quick-actions" />,
  BusinessPerformanceChart: () => <div data-testid="business-performance-chart" />,
  RecentSalesTable: () => <div data-testid="recent-sales-table" />,
  RecentPurchasesTable: () => <div data-testid="recent-purchases-table" />,
  TopPerformers: () => <div data-testid="top-performers" />,
  InventoryOverview: () => <div data-testid="inventory-overview" />,
}))

import {
  useGetDashboardStatsQuery,
  useGetOutOfStockProductsQuery,
} from '@/store/api/inventoryApi'
import { useGetSalesOrdersQuery, useGetPaymentsQuery } from '@/store/api/salesApi'
import {
  useGetPurchaseOrdersQuery,
  useGetSuppliersQuery,
} from '@/store/api/purchasingApi'

const successResult = { data: { data: [] }, isLoading: false, error: undefined }
const statsSuccess = { data: { totalProducts: 0, totalCategories: 0, inventoryValue: 0, outOfStockCount: 0, stockHealthMetrics: { inStockPercentage: 100, outOfStockPercentage: 0 } }, isLoading: false, error: undefined }
const outOfStockSuccess = { data: [], isLoading: false, error: undefined }
const errorResult = (name: string) => ({ data: undefined, isLoading: false, error: { status: 500, error: name } })

function setAllSuccess() {
  ;(useGetSalesOrdersQuery as any).mockReturnValue(successResult)
  ;(useGetPaymentsQuery as any).mockReturnValue(successResult)
  ;(useGetPurchaseOrdersQuery as any).mockReturnValue(successResult)
  ;(useGetSuppliersQuery as any).mockReturnValue(successResult)
  ;(useGetDashboardStatsQuery as any).mockReturnValue(statsSuccess)
  ;(useGetOutOfStockProductsQuery as any).mockReturnValue(outOfStockSuccess)
}

function renderDashboard() {
  const store = configureStore({ reducer: { test: (state = {}) => state } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </Provider>
  )
}

describe('DashboardPage error banner', () => {
  it('shows no banner when all queries succeed', () => {
    setAllSuccess()
    renderDashboard()
    expect(screen.queryByText(/Could not load/i)).not.toBeInTheDocument()
  })

  it('shows warning banner listing the failed section when sales errors', () => {
    setAllSuccess()
    ;(useGetSalesOrdersQuery as any).mockReturnValue(errorResult('sales'))
    renderDashboard()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Sales')
    expect(alert).not.toHaveTextContent('Purchases')
  })

  it('shows warning banner listing multiple failed sections', () => {
    setAllSuccess()
    ;(useGetSalesOrdersQuery as any).mockReturnValue(errorResult('sales'))
    ;(useGetPaymentsQuery as any).mockReturnValue(errorResult('payments'))
    renderDashboard()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent('Sales')
    expect(alert).toHaveTextContent('Payments')
    expect(alert).not.toHaveTextContent('Purchases')
  })

  it('shows warning severity (not error) banner', () => {
    setAllSuccess()
    ;(useGetSalesOrdersQuery as any).mockReturnValue(errorResult('sales'))
    renderDashboard()
    const alert = screen.getByRole('alert')
    expect(alert).toHaveClass('MuiAlert-colorWarning')
  })

  it('auto-dismisses banner when previously-failed query recovers', () => {
    setAllSuccess()
    ;(useGetSalesOrdersQuery as any).mockReturnValue(errorResult('sales'))
    const { rerender } = renderDashboard()
    expect(screen.getByText(/Could not load/i)).toBeInTheDocument()

    ;(useGetSalesOrdersQuery as any).mockReturnValue(successResult)
    rerender(
      <Provider store={configureStore({ reducer: { test: (state = {}) => state } })}>
        <MemoryRouter>
          <DashboardPage />
        </MemoryRouter>
      </Provider>
    )
    expect(screen.queryByText(/Could not load/i)).not.toBeInTheDocument()
  })
})
