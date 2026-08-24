import { configureStore } from '@reduxjs/toolkit'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation  } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { SalesOrder } from '@/types'

import SalesOrderDetailPage from '../SalesOrderDetailPage'

const {
  mockNavigate,
  mockGetSalesOrderByNumber,
  mockGetSalesOrderPayments,
  mockFulfill,
  mockUnfulfill,
  mockCancel,
  mockRecordPayments,
  mockRecordRefunds,
  mockUncancel,
  mockDuplicate,
} = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGetSalesOrderByNumber: vi.fn(),
  mockGetSalesOrderPayments: vi.fn(),
  mockFulfill: vi.fn(),
  mockUnfulfill: vi.fn(),
  mockCancel: vi.fn(),
  mockRecordPayments: vi.fn(),
  mockRecordRefunds: vi.fn(),
  mockUncancel: vi.fn(),
  mockDuplicate: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/store/api/salesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/salesApi')>()
  return {
    ...actual,
    useGetSalesOrderByNumberQuery: mockGetSalesOrderByNumber,
    useGetSalesOrderPaymentsQuery: mockGetSalesOrderPayments,
    useFulfillSalesOrderMutation: () => [mockFulfill, { isLoading: false }],
    useUnfulfillSalesOrderMutation: () => [mockUnfulfill, { isLoading: false }],
    useCancelSalesOrderMutation: () => [mockCancel, { isLoading: false }],
    useRecordOrderPaymentsMutation: () => [mockRecordPayments, { isLoading: false }],
    useRecordOrderRefundsMutation: () => [mockRecordRefunds, { isLoading: false }],
    useUncancelSalesOrderMutation: () => [mockUncancel, { isLoading: false }],
    useDuplicateSalesOrderMutation: () => [mockDuplicate, { isLoading: false }],
  }
})

vi.mock('../components/OrderOverviewTab', () => ({ default: () => <div>OverviewTab</div> }))
vi.mock('../components/OrderPaymentsTab', () => ({ default: () => <div>PaymentsTab</div> }))
vi.mock('@/components/common/PaymentDialog', () => ({
  default: ({ open, paidAmount }: any) =>
    open ? (
      <div data-testid="payment-dialog-paid-amount">
        {paidAmount}
        PaymentDialog
      </div>
    ) : null,
}))
vi.mock('@/components/common/RefundDialog', () => ({ default: () => <div>RefundDialog</div> }))
vi.mock('@/store/api/paymentMethodsApi', () => ({
  useGetActivePaymentMethodsQuery: () => ({ data: [], isLoading: false }),
}))

function makeOrder(overrides: Partial<SalesOrder> = {}): SalesOrder {
  return {
    id: 'o1',
    orderNumber: 'SO-26-001',
    status: 'DRAFT',
    paymentStatus: 'UNPAID',
    customerId: 'c1',
    totalAmount: 500,
    paidAmount: 0,
    orderDate: new Date('2026-01-15'),
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    ...overrides,
  } as SalesOrder
}

function renderPage(orderNumber = 'SO-26-001', search = '') {
  // Seed the REAL url too: listQuery helpers read window.location.search,
  // which MemoryRouter never populates (#1131 review).
  window.history.replaceState(null, '', `/sales/orders/${orderNumber}/view${search}`)
  const store = configureStore({ reducer: { sales: (state = {}) => state } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/sales/orders/${orderNumber}/view${search}`]}>
        <Routes>
          <Route path="/sales/orders/:orderNumber/view" element={<SalesOrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('SalesOrderDetailPage', () => {
  // jsdom persists window.location across cases; BrowserRouter tests below
  // read it, so reset between tests (#1131 review).
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  beforeEach(() => {
    vi.clearAllMocks()
    mockGetSalesOrderPayments.mockReturnValue({ data: [], isLoading: false })
  })

  it('shows loading state', () => {
    mockGetSalesOrderByNumber.mockReturnValue({ data: undefined, isLoading: true })
    renderPage()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows not found on error', () => {
    mockGetSalesOrderByNumber.mockReturnValue({ data: undefined, isLoading: false, isError: true })
    renderPage()
    expect(screen.getByText(/Order not found/)).toBeInTheDocument()
  })

  it('renders order number in header', () => {
    mockGetSalesOrderByNumber.mockReturnValue({ data: makeOrder(), isLoading: false })
    renderPage()
    expect(screen.getByText('SO-26-001')).toBeInTheDocument()
  })

  it('renders Overview tab by default', () => {
    mockGetSalesOrderByNumber.mockReturnValue({ data: makeOrder(), isLoading: false })
    renderPage()
    expect(screen.getByText('OverviewTab')).toBeInTheDocument()
  })

  it('preserves other query params when the tab changes', async () => {
    mockGetSalesOrderByNumber.mockReturnValue({ data: makeOrder(), isLoading: false })

    function LocationProbe() {
      const location = useLocation()
      return <span data-testid="probe-search">{location.search}</span>
    }

    const store = configureStore({ reducer: { sales: (state = {}) => state } })
    window.history.replaceState(null, '', '/sales/orders/SO-26-001/view?tab=0&probe=keepme')
    render(
      <Provider store={store}>
        <BrowserRouter>
          <Routes>
            <Route path="/sales/orders/:orderNumber/view" element={<SalesOrderDetailPage />} />
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

  it('switches to Payments tab', async () => {
    mockGetSalesOrderByNumber.mockReturnValue({ data: makeOrder(), isLoading: false })
    renderPage()
    await userEvent.click(screen.getByRole('tab', { name: /Payments/i }))
    expect(screen.getByText('PaymentsTab')).toBeInTheDocument()
  })

  it('navigates back to orders list on back button click', async () => {
    mockGetSalesOrderByNumber.mockReturnValue({ data: makeOrder(), isLoading: false })
    renderPage()
    await userEvent.click(screen.getByTestId('ArrowBackIcon').closest('button')!)
    expect(mockNavigate).toHaveBeenCalledWith('/sales/orders')
  })

  it('returns to the list with the ticket decoded', async () => {
    mockGetSalesOrderByNumber.mockReturnValue({ data: makeOrder(), isLoading: false })
    renderPage('SO-26-001', '?listQuery=page%3D2')

    await userEvent.click(screen.getByTestId('ArrowBackIcon').closest('button')!)

    expect(mockNavigate).toHaveBeenCalledWith('/sales/orders?page=2')
  })

  it('navigates to edit page when Edit is clicked', async () => {
    mockGetSalesOrderByNumber.mockReturnValue({ data: makeOrder(), isLoading: false })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Edit' }))
    expect(mockNavigate).toHaveBeenCalledWith('/sales/orders/SO-26-001/edit')
  })

  it('shows confirm dialog when Cancel is clicked', async () => {
    mockGetSalesOrderByNumber.mockReturnValue({ data: makeOrder(), isLoading: false })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.getByText(/Cancel this order/i)).toBeInTheDocument()
  })

  it('shows confirm dialog when Fulfill is clicked', async () => {
    mockGetSalesOrderByNumber.mockReturnValue({ data: makeOrder({ status: 'DRAFT', paymentStatus: 'PAID' }), isLoading: false })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Fulfill' }))
    expect(screen.getByText(/Fulfill this order/i)).toBeInTheDocument()
  })

  it('shows stock alert and disables Fulfill when a READY order has out-of-stock items', () => {
    mockGetSalesOrderByNumber.mockReturnValue({
      data: makeOrder({
        status: 'READY',
        paymentStatus: 'PAID',
        items: [{ product: { name: 'Widget', stockQuantity: 0 }, quantity: 1 }],
      }),
      isLoading: false,
    })

    renderPage()

    expect(screen.getByRole('alert')).toHaveTextContent(/out of stock/i)
    expect(screen.getByRole('button', { name: 'Fulfill' })).toBeDisabled()
  })

  it('shows confirm dialog when Unfulfill is clicked', async () => {
    mockGetSalesOrderByNumber.mockReturnValue({ data: makeOrder({ status: 'FULFILLED', paymentStatus: 'PAID' }), isLoading: false })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Unfulfill' }))
    expect(screen.getByText(/Revert this order/i)).toBeInTheDocument()
  })

  it('opens PaymentDialog when Pay is clicked', async () => {
    mockGetSalesOrderByNumber.mockReturnValue({ data: makeOrder(), isLoading: false })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Pay' }))
    expect(screen.getByTestId('payment-dialog-paid-amount')).toBeInTheDocument()
  })

  it('passes order.paidAmount to the payment dialog without refetching payment history', async () => {
    mockGetSalesOrderByNumber.mockReturnValue({
      data: makeOrder({ paidAmount: '200.0000' }),
      isLoading: false,
    })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Pay' }))
    expect(screen.getByTestId('payment-dialog-paid-amount')).toHaveTextContent('200.0000')
    expect(mockGetSalesOrderPayments).not.toHaveBeenCalledWith('o1')
  })

  it('opens RefundDialog when Refund is clicked', async () => {
    mockGetSalesOrderByNumber.mockReturnValue({ data: makeOrder({ status: 'DRAFT', paymentStatus: 'PAID' }), isLoading: false })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: 'Refund' }))
    expect(screen.getByText('RefundDialog')).toBeInTheDocument()
  })

  it('shows Uncancel button for CANCELLED order', () => {
    mockGetSalesOrderByNumber.mockReturnValue({
      data: makeOrder({ status: 'CANCELLED', paymentStatus: 'UNPAID' }),
      isLoading: false,
    })
    renderPage()
    expect(screen.getByRole('button', { name: /uncancel/i })).toBeInTheDocument()
  })

  it('Uncancel button triggers confirmation dialog and calls uncancelSalesOrder on confirm', async () => {
    mockUncancel.mockReturnValue({ unwrap: () => Promise.resolve({}) })
    mockGetSalesOrderByNumber.mockReturnValue({
      data: makeOrder({ status: 'CANCELLED', paymentStatus: 'UNPAID' }),
      isLoading: false,
    })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /uncancel/i }))
    await userEvent.click(screen.getByRole('button', { name: /^restore$/i }))
    await waitFor(() => expect(mockUncancel).toHaveBeenCalled())
  })

  it('shows Duplicate button for DRAFT order', () => {
    mockGetSalesOrderByNumber.mockReturnValue({
      data: makeOrder({ status: 'DRAFT', paymentStatus: 'UNPAID' }),
      isLoading: false,
    })
    renderPage()
    expect(screen.getByRole('button', { name: /duplicate/i })).toBeInTheDocument()
  })

  it('Duplicate button calls mutation and stays on the current order (no edit-page navigation)', async () => {
    mockDuplicate.mockReturnValue({ unwrap: () => Promise.resolve({ orderNumber: 'SO-26-002' }) })
    mockGetSalesOrderByNumber.mockReturnValue({
      data: makeOrder({ status: 'DRAFT', paymentStatus: 'UNPAID' }),
      isLoading: false,
    })
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /duplicate/i }))
    await waitFor(() => expect(mockDuplicate).toHaveBeenCalled())
    expect(mockNavigate).not.toHaveBeenCalledWith('/sales/orders/SO-26-002/edit')
  })
})
