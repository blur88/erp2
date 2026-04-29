import { act, renderHook, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useOrdersWorkspace } from './useOrdersWorkspace'

import salesReducer, { selectSelectedOrder } from '@/store/slices/salesSlice'

const navigateSpy = vi.fn()
const fetchJournalEntries = vi.fn(() => ({
  unwrap: vi.fn().mockResolvedValue({ data: [] }),
}))
const triggerGetSalesOrder = vi.fn((id: string) => ({
  unwrap: vi.fn().mockResolvedValue({
    ...makeOrder(id),
    items: [{ id: `item-${id}`, quantity: 1 }],
  }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    useNavigate: () => navigateSpy,
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useLazyGetJournalEntriesQuery: () => [fetchJournalEntries],
}))

vi.mock('@/store/api/salesApi', () => ({
  useLazyGetSalesOrderQuery: () => [triggerGetSalesOrder],
  useDeleteSalesOrderMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
  useConfirmSalesOrderMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
  useShipSalesOrderMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
  useDeliverSalesOrderMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
  useCompleteSalesOrderMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
  useCancelSalesOrderMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
  useDuplicateSalesOrderMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
  useRecordOrderPaymentMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
  useRecordOrderPaymentsMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
  useUnpaySalesOrderMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
  useFulfillSalesOrderMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
  useUnfulfillSalesOrderMutation: () => [vi.fn(() => ({ unwrap: vi.fn() }))],
}))

function makeOrder(id: string) {
  return {
    id,
    orderNumber: `SO-${id}`,
    orderDate: '2026-04-16',
    isFulfilled: false,
    paidAmount: 0,
    totalAmount: 100,
    isPaidInFull: false,
    customer: { id: 'cust-1', name: 'Amuro Ray' },
    items: [],
    invoices: [],
  }
}

function makeOrderWithPayments(id: string) {
  return {
    ...makeOrder(id),
    isFulfilled: true,
    payments: [
      { id: 'pay-1', paymentNumber: 'PAY-001', amount: 100, paymentDate: '2026-04-01' },
    ],
  }
}

const renderOrdersWorkspace = (initialUrl = '/sales/orders?highlight=ord-2') => {
  const store = configureStore({
    reducer: {
      sales: salesReducer,
    },
  })

  const wrapper = ({ children }: PropsWithChildren) => (
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>{children}</MemoryRouter>
    </Provider>
  )

  const result = renderHook(
    () =>
      useOrdersWorkspace({
        dispatch: store.dispatch,
        getState: () => store.getState() as any,
        orders: [makeOrder('ord-1') as any, makeOrder('ord-2') as any],
        selectedOrder: null,
        refetchOrders: vi.fn(),
      }),
    { wrapper },
  )

  return { ...result, store }
}

describe('useOrdersWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/')
  })

  it('selects the highlighted order from the query string', async () => {
    const { result, store } = renderOrdersWorkspace()

    await waitFor(() => {
      expect(selectSelectedOrder(store.getState())?.id).toBe('ord-2')
    })

    expect(result.current.focusedOrderIndex).toBe(1)
  })

  it('loads full order details when a row is selected', async () => {
    const { result, store } = renderOrdersWorkspace('/sales/orders')

    await act(async () => {
      result.current.handleOrderSelect(makeOrder('ord-1') as any)
    })

    await waitFor(() => {
      expect(triggerGetSalesOrder).toHaveBeenCalledWith('ord-1')
    })

    expect(selectSelectedOrder(store.getState())?.items).toHaveLength(1)
  })

  it('fetches payment JEs when order has payments', async () => {
    const store = configureStore({ reducer: { sales: salesReducer } })
    const wrapper = ({ children }: PropsWithChildren) => (
      <Provider store={store}>
        <MemoryRouter initialEntries={['/sales/orders']}>{children}</MemoryRouter>
      </Provider>
    )

    renderHook(
      () =>
        useOrdersWorkspace({
          dispatch: store.dispatch,
          getState: () => store.getState() as any,
          orders: [makeOrderWithPayments('ord-1') as any],
          selectedOrder: makeOrderWithPayments('ord-1') as any,
          refetchOrders: vi.fn(),
        }),
      { wrapper },
    )

    await waitFor(() => {
      expect(fetchJournalEntries).toHaveBeenCalledWith(
        expect.objectContaining({ sourceType: 'payment', sourceId: 'pay-1' }),
      )
    })
  })

  it('does not fetch invoice JEs', async () => {
    const store = configureStore({ reducer: { sales: salesReducer } })
    const wrapper = ({ children }: PropsWithChildren) => (
      <Provider store={store}>
        <MemoryRouter initialEntries={['/sales/orders']}>{children}</MemoryRouter>
      </Provider>
    )

    renderHook(
      () =>
        useOrdersWorkspace({
          dispatch: store.dispatch,
          getState: () => store.getState() as any,
          orders: [makeOrder('ord-1') as any],
          selectedOrder: { ...makeOrder('ord-1'), invoices: [{ id: 'inv-1', invoiceNumber: 'INV-001' }] } as any,
          refetchOrders: vi.fn(),
        }),
      { wrapper },
    )

    await new Promise((r) => setTimeout(r, 50))
    expect(fetchJournalEntries).not.toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'invoice' }),
    )
  })
})
