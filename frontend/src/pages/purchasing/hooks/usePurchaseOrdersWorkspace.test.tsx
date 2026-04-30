import { renderHook, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePurchaseOrdersWorkspace } from './usePurchaseOrdersWorkspace'

import purchasingReducer, { selectSelectedPurchaseOrder } from '@/store/slices/purchasingSlice'

const navigateSpy = vi.fn()
const fetchJournalEntries = vi.fn(() => ({
  unwrap: vi.fn().mockResolvedValue({ data: [] }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    useNavigate: () => navigateSpy,
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useLazyGetJournalEntriesQuery: () => [fetchJournalEntries],
}))

vi.mock('@/store/api/purchasingApi', () => ({
  useLazyGetPurchaseOrderQuery: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
  useReceiveGoodsMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
  useReturnGoodsMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
  useMarkPurchaseOrderAsUnpaidMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
  useRecordOrderPaymentsMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
  useDeletePurchaseOrderMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
}))

const makePurchaseOrder = (id: string) => ({
  id,
  orderNumber: `PO-${id}`,
  orderDate: '2026-04-16',
  goodsReceivedNotes: [],
  vendorPayments: [],
  items: [],
  supplier: { id: 'sup-1', companyName: 'Anaheim Electronics' },
})

const renderPurchaseOrdersWorkspace = (
  initialUrl = '/purchasing/orders?poId=po-2',
  initialPurchaseOrders = [makePurchaseOrder('po-1') as any, makePurchaseOrder('po-2') as any],
) => {
  const store = configureStore({
    reducer: {
      purchasing: purchasingReducer,
    },
  })

  const wrapper = ({ children }: PropsWithChildren) => (
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
    </Provider>
  )

  const result = renderHook(
    ({ purchaseOrders }) =>
      usePurchaseOrdersWorkspace({
        dispatch: store.dispatch,
        purchaseOrders,
        selectedOrder: null,
        refetchOrders: vi.fn(),
        isLoading: false,
      }),
    { wrapper, initialProps: { purchaseOrders: initialPurchaseOrders } },
  )

  return { ...result, store }
}

describe('usePurchaseOrdersWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('selects the purchase order referenced by the poId query param', async () => {
    const { result, store } = renderPurchaseOrdersWorkspace()

    await waitFor(() => {
      expect(selectSelectedPurchaseOrder(store.getState())?.id).toBe('po-2')
    })

    expect(result.current.focusedOrderIndex).toBe(1)
  })
})

describe('highlight deep-link', () => {
  it('selects and focuses order matching ?highlight= param', async () => {
    const { rerender, store } = renderPurchaseOrdersWorkspace('/purchasing/orders?highlight=po-2', [])

    const orders = [makePurchaseOrder('po-1') as any, makePurchaseOrder('po-2') as any]

    // Re-render with orders loaded
    rerender({ purchaseOrders: orders })

    await waitFor(() => {
      const selected = selectSelectedPurchaseOrder(store.getState())
      expect(selected?.id).toBe('po-2')
    })
  })
})

describe('keyboard navigation', () => {
  it('exposes focusedIndex from useEntityWorkspace', () => {
    const { result } = renderPurchaseOrdersWorkspace('/purchasing/orders')
    expect(typeof result.current.focusedOrderIndex).toBe('number')
  })
})

describe('loading state', () => {
  it('does not clear the selected purchase order while purchase orders are loading', () => {
    const selectedOrder = makePurchaseOrder('po-1') as any
    const store = configureStore({
      reducer: { purchasing: purchasingReducer },
      preloadedState: {
        purchasing: {
          selectedPurchaseOrder: selectedOrder,
          selectedGRN: null,
          selectedVendorPayment: null,
          selectedSupplier: null,
          supplierFilters: {
            search: '',
            sortBy: 'companyName',
            sortOrder: 'ASC',
            isActive: true,
          },
        },
      },
    })
    const wrapper = ({ children }: PropsWithChildren) => (
      <Provider store={store}>
        <MemoryRouter initialEntries={['/purchasing/orders']}>{children}</MemoryRouter>
      </Provider>
    )

    renderHook(
      () =>
        usePurchaseOrdersWorkspace({
          dispatch: store.dispatch,
          purchaseOrders: [],
          selectedOrder,
          refetchOrders: vi.fn(),
          isLoading: true,
        }),
      { wrapper },
    )

    expect(selectSelectedPurchaseOrder(store.getState())?.id).toBe('po-1')
  })
})
