import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

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
})
