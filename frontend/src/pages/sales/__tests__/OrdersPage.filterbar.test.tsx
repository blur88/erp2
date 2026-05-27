import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import salesReducer from '@/store/slices/salesSlice'

import OrdersPage from '../OrdersPage'

const { useGetSalesOrdersQuery } = vi.hoisted(() => ({
  useGetSalesOrdersQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isFetching: false,
    error: undefined,
  })),
}))

vi.mock('@/store/api/salesApi', () => ({
  useGetSalesOrdersQuery,
  useGetCustomersQuery: vi.fn(() => ({
    data: { data: [{ id: 'cust-1', name: 'Amuro Ray' }] },
  })),
  useFulfillSalesOrderMutation: vi.fn(() => [vi.fn()]),
  useUnfulfillSalesOrderMutation: vi.fn(() => [vi.fn()]),
  useCancelSalesOrderMutation: vi.fn(() => [vi.fn()]),
  useRecordOrderPaymentMutation: vi.fn(() => [vi.fn()]),
  useRecordOrderPaymentsMutation: vi.fn(() => [vi.fn()]),
  useRecordOrderRefundsMutation: vi.fn(() => [vi.fn()]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('../components/SalesOrderList', () => ({
  default: () => <div>SalesOrderList</div>,
}))

vi.mock('../components/SalesOrdersDialogs', () => ({
  default: () => null,
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({ reducer: { sales: salesReducer } })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <OrdersPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('OrdersPage FilterBar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search orders/i)).toBeInTheDocument()
  })

  it('renders the SalesOrderList slot', () => {
    renderPage()
    expect(screen.getByText('SalesOrderList')).toBeInTheDocument()
  })

  it('passes status filter from URL to the query', () => {
    renderPage('/?status=FULFILLED')
    expect(useGetSalesOrdersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'FULFILLED' }),
    )
  })

  it('passes paymentStatus filter from URL to the query', () => {
    renderPage('/?paymentStatus=PAID')
    expect(useGetSalesOrdersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ paymentStatus: 'PAID' }),
    )
  })

  it('passes customerId and search from URL to the query', () => {
    renderPage('/?search=gundam&customerId=cust-1')
    expect(useGetSalesOrdersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'gundam', customerId: 'cust-1' }),
    )
  })

  it('defaults period to this_month and resolves to fromDate/toDate', () => {
    renderPage()
    expect(useGetSalesOrdersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        fromDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        toDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    )
  })

  it('sends no fromDate/toDate when period key is null', () => {
    renderPage('/?period=')
    const call = (useGetSalesOrdersQuery as any).mock.calls.at(-1)[0]
    expect(call.fromDate).toBeUndefined()
    expect(call.toDate).toBeUndefined()
  })

  it('does not include fulfillmentStatus in query params', () => {
    renderPage()
    const call = (useGetSalesOrdersQuery as any).mock.calls.at(-1)[0]
    expect(call).not.toHaveProperty('fulfillmentStatus')
  })
})
