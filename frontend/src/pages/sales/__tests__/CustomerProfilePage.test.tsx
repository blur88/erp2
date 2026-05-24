import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

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

function renderPage(slug = 'acme-corp') {
  const store = configureStore({ reducer: { sales: (state = {}) => state } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/sales/customers/${slug}/view`]}>
        <Routes>
          <Route path="/sales/customers/:slug/view" element={<CustomerProfilePage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('CustomerProfilePage', () => {
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
})
