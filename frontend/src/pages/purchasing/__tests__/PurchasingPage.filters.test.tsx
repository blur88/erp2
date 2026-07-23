import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PurchasingPage from '../PurchasingPage'

const mockUseGetSuppliersQuery = vi.fn()
const mockUsePurchasingAnalytics = vi.fn()
const filterBarSpy = vi.fn()

vi.mock('@/store/api/purchasingApi', () => ({
  useGetSuppliersQuery: (...args: unknown[]) => mockUseGetSuppliersQuery(...args),
}))

vi.mock('../hooks/usePurchasingAnalytics', () => ({
  usePurchasingAnalytics: (...args: unknown[]) => mockUsePurchasingAnalytics(...args),
}))

vi.mock('@/components/filters/FilterBar', () => ({
  FilterBar: (props: unknown) => {
    filterBarSpy(props)
    return <div data-testid="filter-bar" />
  },
}))

vi.mock('react-chartjs-2', () => ({
  Line: () => <div data-testid="purchasing-line-chart" />,
}))

describe('PurchasingPage filters', () => {
  const initialEntry =
    '/?purchasing_supplier=550e8400-e29b-41d4-a716-446655440001&purchasing_status=received&purchasing_payment=partial'

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
  })

  it('passes purchasing filter state into analytics', () => {
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
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
  })

  it('renders the FilterBar component', () => {
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <PurchasingPage />
      </MemoryRouter>,
    )
    expect(screen.getByTestId('filter-bar')).toBeInTheDocument()
  })

  it('renders the purchasing overview heading', () => {
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <PurchasingPage />
      </MemoryRouter>,
    )
    expect(screen.getByText('Purchasing Overview')).toBeInTheDocument()
  })

  it('configures supplier and status filters with the named purchasing filter types', () => {
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <PurchasingPage />
      </MemoryRouter>,
    )

    const latestProps = filterBarSpy.mock.calls.at(-1)?.[0] as {
      config: {
        fields: Array<{ field: string; type: string; paramKey?: string }>
      }
    }

    expect(latestProps.config.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'supplierId',
          type: 'supplier',
          paramKey: 'supplier',
        }),
        expect.objectContaining({
          field: 'status',
          type: 'select',
        }),
      ]),
    )
  })
})
