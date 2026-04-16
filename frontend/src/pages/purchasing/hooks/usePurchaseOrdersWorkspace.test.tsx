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

const renderPurchaseOrdersWorkspace = (initialUrl = '/purchasing/orders?poId=po-2') => {
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
    () =>
      usePurchaseOrdersWorkspace({
        dispatch: store.dispatch,
        purchaseOrders: [makePurchaseOrder('po-1') as any, makePurchaseOrder('po-2') as any],
        selectedOrder: null,
        refetchOrders: vi.fn(),
      }),
    { wrapper },
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
