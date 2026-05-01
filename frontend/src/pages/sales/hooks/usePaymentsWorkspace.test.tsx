import { act, renderHook, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import type { PropsWithChildren } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePaymentsWorkspace, type PaymentListItem } from './usePaymentsWorkspace'

import salesReducer, { selectSelectedPayment } from '@/store/slices/salesSlice'

const navigateSpy = vi.fn()
const fetchJournalEntries = vi.fn(() => ({
  unwrap: vi.fn().mockResolvedValue({ data: [] }),
}))
const fetchSalesOrder = vi.fn(() => ({
  unwrap: vi.fn().mockResolvedValue({ id: 'so-1', isFulfilled: true }),
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')

  return {
    ...actual,
    useNavigate: () => navigateSpy,
  }
})

vi.mock('@/store/api/accountingApi', () => ({
  useLazyGetJournalEntriesQuery: () => [fetchJournalEntries],
}))

vi.mock('@/store/api/salesApi', () => ({
  useLazyGetSalesOrderQuery: () => [fetchSalesOrder],
}))

const makePayment = (id: string): PaymentListItem => ({
  id,
  paymentNumber: `PAY-${id}`,
  customerName: `Customer ${id}`,
  amount: 100,
  paymentDate: '2026-04-16',
  status: 'completed',
})

const renderPaymentsWorkspace = ({
  initialUrl = '/sales/payments?highlight=pay-2',
  selectedPayment = null,
  payments = [makePayment('pay-1'), makePayment('pay-2')],
}: {
  initialUrl?: string
  selectedPayment?: PaymentListItem | null
  payments?: PaymentListItem[]
} = {}) => {
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
    () => usePaymentsWorkspace({
      dispatch: store.dispatch,
      payments,
      selectedPayment,
      refetch: vi.fn(),
    }),
    { wrapper },
  )

  return { ...result, store }
}

describe('usePaymentsWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.history.replaceState(null, '', '/')
  })

  it('selects the highlighted payment from the URL query param', async () => {
    const { result, store } = renderPaymentsWorkspace()

    await waitFor(() => {
      expect(selectSelectedPayment(store.getState())?.id).toBe('pay-2')
    })

    expect(result.current.focusedIndex).toBe(1)
  })

  it('keeps Enter as a no-op for payments', async () => {
    const { result } = renderPaymentsWorkspace({ initialUrl: '/sales/payments' })

    await act(async () => {
      result.current.handleSelect(makePayment('pay-1'))
    })

    act(() => {
      result.current.handleEnterAction()
    })

    expect(navigateSpy).not.toHaveBeenCalled()
  })

  it('includes the fulfilled sales order journal entry source for invoice-linked payments', async () => {
    const selectedPayment = {
      ...makePayment('pay-1'),
      relatedOrderId: 'so-1',
    }

    renderPaymentsWorkspace({
      initialUrl: '/sales/payments',
      selectedPayment,
      payments: [selectedPayment],
    })

    await waitFor(() => {
      expect(fetchSalesOrder).toHaveBeenCalledWith('so-1')
    })

    await waitFor(() => {
      expect(fetchJournalEntries).toHaveBeenCalledWith({
        sourceType: 'sales_order',
        sourceId: 'so-1',
      })
    })
  })
})
