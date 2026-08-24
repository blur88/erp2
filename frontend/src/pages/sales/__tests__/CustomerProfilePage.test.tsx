import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation  } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi  } from 'vitest'

import type { Customer } from '@/types'
import { CustomerType } from '@/types'

import CustomerProfilePage from '../CustomerProfilePage'

const { mockNavigate, mockGetCustomerBySlug } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGetCustomerBySlug: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/store/api/salesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/salesApi')>()
  return {
    ...actual,
    useGetCustomerBySlugQuery: mockGetCustomerBySlug,
  }
})

vi.mock('../components/CustomerOverviewTab', () => ({ default: () => <div>OverviewTab</div> }))
vi.mock('../components/CustomerOrdersTab', () => ({ default: () => <div>OrdersTab</div> }))
vi.mock('../components/CustomerInvoicesTab', () => ({ default: () => <div>InvoicesTab</div> }))
vi.mock('../components/CustomerPaymentsTab', () => ({ default: () => <div>PaymentsTab</div> }))

const customer: Customer = {
  id: 'c1',
  slug: 'acme-corp',
  type: CustomerType.BUSINESS,
  name: 'Acme Corp',
  isActive: true,
  totalSales: 0,
  totalOrders: 0,
  averageOrderValue: 0,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
}

function renderPage(slug = 'acme-corp', search = '') {
  // Seed the REAL url too: listQuery helpers read window.location.search,
  // which MemoryRouter never populates (#1131 review).
  window.history.replaceState(null, '', `/sales/customers/${slug}/view${search}`)
  const store = configureStore({ reducer: { sales: (state = {}) => state } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/sales/customers/${slug}/view${search}`]}>
        <Routes>
          <Route path="/sales/customers/:slug/view" element={<CustomerProfilePage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('CustomerProfilePage', () => {
  // jsdom persists window.location across cases; BrowserRouter tests below
  // read it, so reset between tests (#1131 review).
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('shows loading state', () => {
    mockGetCustomerBySlug.mockReturnValue({ data: undefined, isLoading: true })
    renderPage()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders customer name and status badge', () => {
    mockGetCustomerBySlug.mockReturnValue({ data: customer, isLoading: false })
    renderPage()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
    expect(screen.getByText('Active')).toBeInTheDocument()
  })

  it('renders Overview tab content by default', () => {
    mockGetCustomerBySlug.mockReturnValue({ data: customer, isLoading: false })
    renderPage()
    expect(screen.getByText('OverviewTab')).toBeInTheDocument()
  })

  it('switches to Orders tab on click', async () => {
    mockGetCustomerBySlug.mockReturnValue({ data: customer, isLoading: false })
    renderPage()
    await userEvent.click(screen.getByRole('tab', { name: /Orders/i }))
    expect(screen.getByText('OrdersTab')).toBeInTheDocument()
  })

  it('navigates back on back button click', async () => {
    mockGetCustomerBySlug.mockReturnValue({ data: customer, isLoading: false })
    renderPage()
    await userEvent.click(screen.getByTestId('ArrowBackIcon').closest('button')!)
    expect(mockNavigate).toHaveBeenCalledWith('/sales/customers')
  })

  it('returns to the list with the ticket decoded', async () => {
    mockGetCustomerBySlug.mockReturnValue({ data: customer, isLoading: false })
    // ?tab= must NOT leak into the restored list URL.
    renderPage('acme-corp', '?listQuery=page%3D2&tab=1')

    const user = userEvent.setup()
    await user.click(screen.getByTestId('ArrowBackIcon').closest('button')!)

    expect(mockNavigate).toHaveBeenCalledWith('/sales/customers?page=2')
  })

  it('navigates to edit with profile return state on Edit Customer click', async () => {
    mockGetCustomerBySlug.mockReturnValue({ data: customer, isLoading: false })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Edit Customer' }))
    expect(mockNavigate).toHaveBeenCalledWith(
      '/sales/customers/acme-corp/edit',
      expect.objectContaining({
        state: expect.objectContaining({ returnTo: 'profile', breadcrumbTitle: 'Acme Corp' }),
      }),
    )
  })

  it('does not show Set as Inactive or Reactivate buttons', () => {
    mockGetCustomerBySlug.mockReturnValue({ data: customer, isLoading: false })
    renderPage()
    expect(screen.queryByRole('button', { name: 'Set as Inactive' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reactivate' })).not.toBeInTheDocument()
  })

  it('shows not found message on error', () => {
    mockGetCustomerBySlug.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderPage()
    expect(screen.getByText('Customer not found.')).toBeInTheDocument()
  })

  it('shows not found message when data is missing and not loading', () => {
    mockGetCustomerBySlug.mockReturnValue({ data: undefined, isLoading: false, isError: false })
    renderPage()
    expect(screen.getByText('Customer not found.')).toBeInTheDocument()
  })

  it('clamps an out-of-range ?tab= to the last real tab instead of an empty panel', () => {
    mockGetCustomerBySlug.mockReturnValue({ data: customer, isLoading: false })
    renderPage('acme-corp', '?tab=3')

    // Three tabs exist (0-2); ?tab=3 must not leave the content area blank.
    expect(screen.getByText('PaymentsTab')).toBeInTheDocument()
    expect(screen.getByRole('tab', { selected: true })).toHaveAccessibleName(/Payments/i)
  })

  it('honours an in-range ?tab= deep link', () => {
    mockGetCustomerBySlug.mockReturnValue({ data: customer, isLoading: false })
    renderPage('acme-corp', '?tab=1')
    expect(screen.getByText('OrdersTab')).toBeInTheDocument()
  })

  it('preserves other query params when the tab changes', async () => {
    mockGetCustomerBySlug.mockReturnValue({ data: customer, isLoading: false })

    function LocationProbe() {
      const location = useLocation()
      return <span data-testid="probe-search">{location.search}</span>
    }

    const store = configureStore({ reducer: { sales: (state = {}) => state } })
    window.history.replaceState(null, '', '/sales/customers/acme-corp/view?tab=0&probe=keepme')
    render(
      <Provider store={store}>
        <BrowserRouter>
          <Routes>
            <Route path="/sales/customers/:slug/view" element={<CustomerProfilePage />} />
          </Routes>
          <LocationProbe />
        </BrowserRouter>
      </Provider>,
    )

    const user = userEvent.setup()
    const tabs = await screen.findAllByRole('tab')
    await user.click(tabs[1])

    const search = screen.getByTestId('probe-search').textContent ?? ''
    expect(new URLSearchParams(search).get('probe')).toBe('keepme')
    expect(new URLSearchParams(search).get('tab')).toBe('1')
  })
})
