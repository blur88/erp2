import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import CustomerOrdersTab from '../CustomerOrdersTab'

const { mockGetSalesOrders, mockNavigate } = vi.hoisted(() => ({
  mockGetSalesOrders: vi.fn(),
  mockNavigate: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

vi.mock('@/store/api/salesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/salesApi')>()
  return {
    ...actual,
    useGetSalesOrdersQuery: mockGetSalesOrders,
  }
})

function renderTab(customerId: string) {
  const store = configureStore({ reducer: { sales: (state = {}) => state } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <CustomerOrdersTab customerId={customerId} />
      </MemoryRouter>
    </Provider>,
  )
}

describe('CustomerOrdersTab', () => {
  afterEach(() => {
    // useListUrlState hydrates from the live window.location, which jsdom
    // persists across tests in this file.
    window.history.replaceState(null, '', '/')
  })

  it('shows loading state', () => {
    mockGetSalesOrders.mockReturnValue({ data: undefined, isLoading: true })
    renderTab('c1')
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows empty state when no orders', () => {
    mockGetSalesOrders.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false })
    renderTab('c1')
    expect(screen.getByText(/No orders yet/)).toBeInTheDocument()
  })

  it('renders order rows', () => {
    mockGetSalesOrders.mockReturnValue({
      data: {
        data: [{
          id: 'o1',
          orderNumber: 'SO-001',
          orderDate: '2026-01-15',
          isCompleted: true,
          isFulfilled: false,
          totalAmount: 1500,
          customerId: 'c1',
          createdAt: '2026-01-15',
          updatedAt: '2026-01-15',
        }],
        meta: { total: 1 },
      },
      isLoading: false,
    })
    renderTab('c1')
    expect(screen.getByText('SO-001')).toBeInTheDocument()
    expect(screen.getByText(/Completed/i)).toBeInTheDocument()
  })

  it('navigates to the order detail page when View is clicked', async () => {
    mockNavigate.mockClear()
    mockGetSalesOrders.mockReturnValue({
      data: {
        data: [{
          id: 'o1',
          orderNumber: 'SO-001',
          orderDate: '2026-01-15',
          isCompleted: true,
          isFulfilled: false,
          totalAmount: 1500,
          customerId: 'c1',
          createdAt: '2026-01-15',
          updatedAt: '2026-01-15',
        }],
        meta: { total: 1 },
      },
      isLoading: false,
    })
    renderTab('c1')
    await userEvent.click(screen.getByRole('button', { name: /view/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/sales/orders/SO-001/view')
  })

  it('passes customerId to query', () => {
    mockGetSalesOrders.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false })
    renderTab('customer-abc')
    expect(mockGetSalesOrders).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'customer-abc', page: 1, limit: expect.any(Number) }),
    )
  })

  it('renders the pagination footer with the total', () => {
    mockGetSalesOrders.mockReturnValue({
      data: {
        data: [{
          id: 'o1',
          orderNumber: 'SO-001',
          orderDate: '2026-01-15',
          isCompleted: true,
          isFulfilled: false,
          totalAmount: 1500,
          customerId: 'c1',
          createdAt: '2026-01-15',
          updatedAt: '2026-01-15',
        }],
        meta: { total: 42 },
      },
      isLoading: false,
    })
    renderTab('c1')
    expect(screen.getByText(/of 42 records/)).toBeInTheDocument()
  })

  it('shows the error state, not the empty state, when the query fails', () => {
    mockGetSalesOrders.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderTab('c1')
    expect(screen.getByText('Failed to load orders.')).toBeInTheDocument()
    expect(screen.queryByText(/No orders yet/)).not.toBeInTheDocument()
  })

  it('keeps its pagination on its own namespaced URL key', async () => {
    // useListUrlState hydrates from window.location.search, which MemoryRouter
    // never populates — set the real URL and render under BrowserRouter.
    // The custOrders_ prefix proves sibling tabs cannot clobber this key.
    window.history.replaceState(null, '', '/sales/customers/c1/view?tab=1&custOrders_page=2')
    mockGetSalesOrders.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false })

    const store = configureStore({ reducer: { sales: (state = {}) => state } })
    render(
      <Provider store={store}>
        <BrowserRouter>
          <CustomerOrdersTab customerId="c1" />
        </BrowserRouter>
      </Provider>,
    )

    await waitFor(() => {
      expect(mockGetSalesOrders).toHaveBeenLastCalledWith(
        expect.objectContaining({ customerId: 'c1', page: 2 }),
      )
    })
  })
})
