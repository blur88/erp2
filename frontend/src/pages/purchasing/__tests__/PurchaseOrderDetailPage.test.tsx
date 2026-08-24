import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation  } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi  } from 'vitest'

import type { PurchaseOrder } from '@/types'

import PurchaseOrderDetailPage from '../PurchaseOrderDetailPage'

const { mockNavigate, mockGetPurchaseOrderByNumber, mockGetPurchaseOrderPayments } = vi.hoisted(
  () => ({
    mockNavigate: vi.fn(),
    mockGetPurchaseOrderByNumber: vi.fn(),
    mockGetPurchaseOrderPayments: vi.fn(),
  }),
)

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/store/api/purchasingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/purchasingApi')>()
  return {
    ...actual,
    useGetPurchaseOrderByNumberQuery: mockGetPurchaseOrderByNumber,
    useGetPurchaseOrderPaymentsQuery: mockGetPurchaseOrderPayments,
    useCancelPurchaseOrderMutation: () => [vi.fn(), { isLoading: false }],
    useDuplicatePurchaseOrderMutation: () => [vi.fn(), { isLoading: false }],
    useReceiveGoodsMutation: () => [vi.fn(), { isLoading: false }],
    useRecordPurchaseOrderRefundsMutation: () => [vi.fn(), { isLoading: false }],
    useRecordVendorPaymentsMutation: () => [vi.fn(), { isLoading: false }],
    useReturnGoodsMutation: () => [vi.fn(), { isLoading: false }],
    useUncancelPurchaseOrderMutation: () => [vi.fn(), { isLoading: false }],
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/store/api/paymentMethodsApi', () => ({
  useGetActivePaymentMethodsForPurchasesQuery: () => ({ data: [], isLoading: false }),
  useGetActivePaymentMethodsQuery: () => ({ data: [], isLoading: false }),
}))

vi.mock('../components/PurchaseOrderOverviewTab', () => ({ default: () => <div>OverviewTab</div> }))
vi.mock('../components/PurchaseOrderPaymentsTab', () => ({ default: () => <div>PaymentsTab</div> }))
vi.mock('../components/PurchaseOrderActionBar', () => ({ default: () => <div>ActionBar</div> }))
vi.mock('../components/PurchaseOrderPrintDialog', () => ({ default: () => null }))
vi.mock('@/components/common/PaymentDialog', () => ({ default: () => null }))
vi.mock('@/components/common/RefundDialog', () => ({ default: () => null }))
vi.mock('@/components/common/ConfirmationDialog', () => ({ default: () => null }))

const order: Partial<PurchaseOrder> = {
  id: 'po-1',
  orderNumber: 'PO-26-001',
  status: 'DRAFT',
  paymentStatus: 'UNPAID',
  totalAmount: '500.0000',
  vendorPayments: [],
}

function renderPage(search = '') {
  // Seed the REAL url too: listQuery helpers read window.location.search,
  // which MemoryRouter never populates (#1131 review).
  window.history.replaceState(null, '', `/purchasing/orders/PO-26-001/view${search}`)
  const store = configureStore({ reducer: { purchasing: (state = {}) => state } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[`/purchasing/orders/PO-26-001/view${search}`]}>
        <Routes>
          <Route path="/purchasing/orders/:orderNumber/view" element={<PurchaseOrderDetailPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('PurchaseOrderDetailPage', () => {
  // jsdom persists window.location across cases; BrowserRouter tests below
  // read it, so reset between tests (#1131 review).
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('preserves other query params when the tab changes', async () => {
    mockGetPurchaseOrderByNumber.mockReturnValue({ data: order, isLoading: false })
    mockGetPurchaseOrderPayments.mockReturnValue({ data: [], isLoading: false })

    function LocationProbe() {
      const location = useLocation()
      return <span data-testid="probe-search">{location.search}</span>
    }

    const store = configureStore({ reducer: { purchasing: (state = {}) => state } })
    window.history.replaceState(null, '', '/purchasing/orders/PO-26-001/view?tab=0&probe=keepme')
    render(
      <Provider store={store}>
        <BrowserRouter>
          <Routes>
            <Route path="/purchasing/orders/:orderNumber/view" element={<PurchaseOrderDetailPage />} />
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

  it('returns to the list with the ticket decoded', async () => {
    mockGetPurchaseOrderByNumber.mockReturnValue({ data: order, isLoading: false })
    mockGetPurchaseOrderPayments.mockReturnValue({ data: [], isLoading: false })
    renderPage('?listQuery=page%3D2')

    const user = userEvent.setup()
    await user.click(screen.getByTestId('ArrowBackIcon').closest('button')!)

    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/orders?page=2')
  })

  it('returns to the bare list when there is no ticket', async () => {
    mockGetPurchaseOrderByNumber.mockReturnValue({ data: order, isLoading: false })
    mockGetPurchaseOrderPayments.mockReturnValue({ data: [], isLoading: false })
    renderPage()

    const user = userEvent.setup()
    await user.click(screen.getByTestId('ArrowBackIcon').closest('button')!)

    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/orders')
  })
})
