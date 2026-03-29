import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import InventoryPage from '../InventoryPage'

const mockUseGetSuppliersQuery = vi.fn()
const mockUseGetCategoriesQuery = vi.fn()
const mockUseInventoryAnalytics = vi.fn()
const dashboardFilterBarSpy = vi.fn()

vi.mock('@/store/api/purchasingApi', () => ({
  useGetSuppliersQuery: (...args: unknown[]) => mockUseGetSuppliersQuery(...args),
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useGetCategoriesQuery: (...args: unknown[]) => mockUseGetCategoriesQuery(...args),
}))

vi.mock('../hooks/useInventoryAnalytics', () => ({
  useInventoryAnalytics: (...args: unknown[]) => mockUseInventoryAnalytics(...args),
}))

vi.mock('@/components/filters/DashboardFilterBar', () => ({
  DashboardFilterBar: (props: unknown) => {
    dashboardFilterBarSpy(props)
    return <div data-testid="dashboard-filter-bar" />
  },
}))

vi.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="inventory-line-chart" />,
  Doughnut: () => <div data-testid="inventory-doughnut-chart" />,
}))

describe('InventoryPage filters', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseGetSuppliersQuery.mockReturnValue({
      data: {
        data: [
          { id: '550e8400-e29b-41d4-a716-446655440001', companyName: 'Acme Supplies' },
        ],
      },
    })
    mockUseGetCategoriesQuery.mockReturnValue({
      data: [
        { id: '550e8400-e29b-41d4-a716-446655440010', name: 'Electronics' },
      ],
    })
    mockUseInventoryAnalytics.mockReturnValue({
      data: {
        current: {
          metrics: {
            totalProducts: 0,
            totalCategories: 0,
            inventoryValue: 0,
            lowStockCount: 0,
            outOfStockCount: 0,
            stockMovementsIn: 0,
            stockMovementsOut: 0,
          },
          periodData: [],
          periodStart: '2026-03-01',
          periodEnd: '2026-03-31',
        },
        lowStockAlerts: [],
        recentMovements: [],
      },
      isLoading: false,
      isFetching: false,
      error: null,
    })
    window.history.replaceState(
      {},
      '',
      '/?inventory_supplier=550e8400-e29b-41d4-a716-446655440001&inventory_category=550e8400-e29b-41d4-a716-446655440010&inventory_stock_status=low_stock',
    )
  })

  it('passes inventory filter state into analytics and the shared filter bar', () => {
    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>,
    )

    expect(mockUseInventoryAnalytics).toHaveBeenCalledWith(
      expect.objectContaining({
        supplierId: '550e8400-e29b-41d4-a716-446655440001',
        categoryId: '550e8400-e29b-41d4-a716-446655440010',
        stockStatus: 'low_stock',
      }),
    )

    expect(dashboardFilterBarSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        suppliers: [{ id: '550e8400-e29b-41d4-a716-446655440001', name: 'Acme Supplies' }],
        supplierId: '550e8400-e29b-41d4-a716-446655440001',
        categories: [{ id: '550e8400-e29b-41d4-a716-446655440010', name: 'Electronics' }],
        categoryId: '550e8400-e29b-41d4-a716-446655440010',
        stockStatus: 'low_stock',
      }),
    )
  })

  it('renders the inventory overview heading', () => {
    render(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Inventory Overview')).toBeInTheDocument()
  })
})
