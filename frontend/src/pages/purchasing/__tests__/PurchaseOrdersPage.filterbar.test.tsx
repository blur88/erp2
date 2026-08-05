import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PurchaseOrdersPage from '../PurchaseOrdersPage'

const { useGetPurchaseOrdersQuery } = vi.hoisted(() => ({
  useGetPurchaseOrdersQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  })),
}))

const filterBarSpy = vi.fn()

vi.mock('@/store/api/purchasingApi', () => ({
  useGetPurchaseOrdersQuery,
  useReceiveGoodsMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useReturnGoodsMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useCancelPurchaseOrderMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useUncancelPurchaseOrderMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useDuplicatePurchaseOrderMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useRecordPurchaseOrderRefundsMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useRecordVendorPaymentsMutation: vi.fn(() => [vi.fn(), { isLoading: false }]),
  useGetPurchaseOrderPaymentsQuery: vi.fn(() => ({ data: [], isLoading: false })),
}))

vi.mock('@/store/api/paymentMethodsApi', () => ({
  useGetActivePaymentMethodsForPurchasesQuery: () => ({ data: [] }),
}))

vi.mock('@/components/filters', () => ({
  FilterBar: (props: unknown) => {
    filterBarSpy(props)
    return <input placeholder="Search purchase orders..." />
  },
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/components/common/RefundDialog', () => ({ default: () => null }))

function renderPage(initialUrl = '/') {
  const store = configureStore({
    reducer: {
      _noop: (state = {}) => state,
    },
  })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <PurchaseOrdersPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('PurchaseOrdersPage FilterBar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the shared filter search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search purchase orders/i)).toBeInTheDocument()
  })

  it('uses the new PO list page and query shape', () => {
    renderPage('/?search=gundam&supplierId=sup-1&status=READY&paymentStatus=PAID')

    expect(useGetPurchaseOrdersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({
        search: 'gundam',
        supplierId: 'sup-1',
        status: 'READY',
        paymentStatus: 'PAID',
        sortBy: 'orderNumber',
        sortOrder: 'DESC',
        page: 1,
        limit: 25,
      }),
    )
  })

  it('configures supplier, status, and payment filters', () => {
    renderPage()

    const latestProps = filterBarSpy.mock.calls.at(-1)?.[0] as {
      config: {
        fields: Array<{ field: string; type: string; valueCase?: string }>
      }
    }

    expect(latestProps.config.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'supplierId', type: 'supplier' }),
        expect.objectContaining({ field: 'status', type: 'select' }),
        expect.objectContaining({ field: 'paymentStatus', type: 'payment-status', valueCase: 'upper' }),
      ]),
    )
  })

  it('keeps date params out of the list query when no period is selected', () => {
    renderPage('/?orderDateFrom=2024-01-01')

    expect(useGetPurchaseOrdersQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({
        orderDateFrom: expect.anything(),
        orderDateTo: expect.anything(),
      }),
    )
  })
})
