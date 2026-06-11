import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import salesReducer from '@/store/slices/salesSlice'

import OrdersPage from '../OrdersPage'

const order = {
  id: 'ord-1',
  orderNumber: 'SO-26-001',
  status: 'DRAFT',
  paymentStatus: 'UNPAID',
  customerId: 'cust-1',
  customer: { id: 'cust-1', name: 'Amuro Ray' },
  totalAmount: 1000,
  orderDate: '2026-01-15',
  createdAt: '2026-01-15',
  updatedAt: '2026-01-15',
}

vi.mock('@/store/api/salesApi', () => ({
  useGetSalesOrdersQuery: vi.fn(() => ({
    data: { data: [order], meta: { total: 1 } },
    isFetching: false,
    error: undefined,
  })),
  useGetCustomersQuery: vi.fn(() => ({
    data: { data: [{ id: 'cust-1', name: 'Amuro Ray' }] },
  })),
  useFulfillSalesOrderMutation: vi.fn(() => [vi.fn()]),
  useUnfulfillSalesOrderMutation: vi.fn(() => [vi.fn()]),
  useCancelSalesOrderMutation: vi.fn(() => [vi.fn()]),
  useRecordOrderPaymentsMutation: vi.fn(() => [vi.fn()]),
  useRecordOrderRefundsMutation: vi.fn(() => [vi.fn()]),
  useUncancelSalesOrderMutation: vi.fn(() => [vi.fn()]),
  useDuplicateSalesOrderMutation: vi.fn(() => [vi.fn()]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('../components/SalesOrdersDialogs', () => ({
  default: () => null,
}))

const navigateMock = vi.fn()
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => navigateMock }
})

function renderPage() {
  const store = configureStore({ reducer: { sales: salesReducer } })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/']}>
        <OrdersPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('OrdersPage row click navigation', () => {
  beforeEach(() => {
    navigateMock.mockClear()
  })

  it('navigates to the order detail page when a Sales Order row is clicked', async () => {
    renderPage()
    await userEvent.click(screen.getByText('SO-26-001'))
    expect(navigateMock).toHaveBeenCalledWith('/sales/orders/SO-26-001/view')
  })
})
