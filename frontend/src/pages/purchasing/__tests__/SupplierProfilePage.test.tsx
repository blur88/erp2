import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Supplier } from '@/types'

import SupplierProfilePage from '../SupplierProfilePage'

const { mockNavigate, mockGetSupplierBySlug, mockUpdateSupplier } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGetSupplierBySlug: vi.fn(),
  mockUpdateSupplier: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/store/api/purchasingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/purchasingApi')>()
  return {
    ...actual,
    useGetSupplierBySlugQuery: mockGetSupplierBySlug,
    useUpdateSupplierMutation: () => [mockUpdateSupplier],
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('../components/SupplierOverviewTab', () => ({ default: () => <div>OverviewTab</div> }))
vi.mock('../components/SupplierPurchaseOrdersTab', () => ({
  default: () => <div>PurchaseOrdersTab</div>,
}))
vi.mock('../components/SupplierPaymentsTab', () => ({ default: () => <div>PaymentsTab</div> }))

const supplier: Supplier = {
  id: 's1',
  slug: 'globex-supply',
  type: 'local',
  companyName: 'Globex Supply',
  isActive: true,
  totalPurchases: 0,
  totalOrders: 0,
  averageOrderValue: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

function renderPage(slug = 'globex-supply', search = '') {
  const store = configureStore({ reducer: { purchasing: (state = {}) => state } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/purchasing/suppliers/${slug}/view${search}`]}>
        <Routes>
          <Route path="/purchasing/suppliers/:slug/view" element={<SupplierProfilePage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('SupplierProfilePage', () => {
  it('renders Overview tab content by default', () => {
    mockGetSupplierBySlug.mockReturnValue({ data: supplier, isLoading: false })
    renderPage()
    expect(screen.getByText('OverviewTab')).toBeInTheDocument()
  })

  it('honours an in-range ?tab= deep link', () => {
    mockGetSupplierBySlug.mockReturnValue({ data: supplier, isLoading: false })
    renderPage('globex-supply', '?tab=1')
    expect(screen.getByText('PurchaseOrdersTab')).toBeInTheDocument()
  })

  it('clamps an out-of-range ?tab= to the last real tab instead of an empty panel', () => {
    mockGetSupplierBySlug.mockReturnValue({ data: supplier, isLoading: false })
    renderPage('globex-supply', '?tab=3')

    // Three tabs exist (0-2); ?tab=3 must not leave the content area blank.
    expect(screen.getByText('PaymentsTab')).toBeInTheDocument()
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(/Vendor Payments/i)
  })

  it('preserves other query params when the tab changes', async () => {
    mockGetSupplierBySlug.mockReturnValue({ data: supplier, isLoading: false })

    function LocationProbe() {
      const location = useLocation()
      return <span data-testid="probe-search">{location.search}</span>
    }

    const store = configureStore({ reducer: { purchasing: (state = {}) => state } })
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/purchasing/suppliers/globex-supply/view?tab=0&probe=keepme']}>
          <Routes>
            <Route path="/purchasing/suppliers/:slug/view" element={<SupplierProfilePage />} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </Provider>,
    )

    const user = userEvent.setup()
    const tabs = await screen.findAllByRole('tab')
    await user.click(tabs[1])

    const search = screen.getByTestId('probe-search').textContent ?? ''
    expect(new URLSearchParams(search).get('probe')).toBe('keepme')
    expect(new URLSearchParams(search).get('tab')).toBe('1')
  })

  it('returns to the list with the ticket decoded', async () => {
    mockGetSupplierBySlug.mockReturnValue({ data: supplier, isLoading: false })
    renderPage('globex-supply', '?listQuery=page%3D2&tab=1')

    const user = userEvent.setup()
    await user.click(screen.getByTestId('ArrowBackIcon').closest('button')!)

    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/suppliers?page=2')
  })
})
