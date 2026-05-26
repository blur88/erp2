import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { SalesOrderPayment } from '@/types'

import OrderPaymentsTab from '../OrderPaymentsTab'

const { mockGetSalesOrderPayments } = vi.hoisted(() => ({
  mockGetSalesOrderPayments: vi.fn(),
}))

vi.mock('@/store/api/salesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/salesApi')>()
  return { ...actual, useGetSalesOrderPaymentsQuery: mockGetSalesOrderPayments }
})

function makePayment(overrides: Partial<SalesOrderPayment> = {}): SalesOrderPayment {
  return {
    id: 'pay1',
    salesOrderId: 'o1',
    paymentMethodId: 'pm1',
    paymentMethod: { id: 'pm1', name: 'Cash' },
    referenceNumber: 'REF-001',
    amount: 200,
    paymentDate: '2026-01-20',
    createdAt: '2026-01-20',
    updatedAt: '2026-01-20',
    ...overrides,
  }
}

function renderTab(orderId: string, totalAmount: number) {
  const store = configureStore({ reducer: { sales: (state = {}) => state } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <OrderPaymentsTab orderId={orderId} totalAmount={totalAmount} />
      </MemoryRouter>
    </Provider>,
  )
}

describe('OrderPaymentsTab', () => {
  it('shows loading state', () => {
    mockGetSalesOrderPayments.mockReturnValue({ data: undefined, isLoading: true })
    renderTab('o1', 200)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows empty state when no payments', () => {
    mockGetSalesOrderPayments.mockReturnValue({ data: [], isLoading: false })
    renderTab('o1', 200)
    expect(screen.getByText(/No payments recorded/)).toBeInTheDocument()
  })

  it('renders payment row with method and reference', () => {
    mockGetSalesOrderPayments.mockReturnValue({ data: [makePayment()], isLoading: false })
    renderTab('o1', 200)
    expect(screen.getByText('Cash')).toBeInTheDocument()
    expect(screen.getByText('REF-001')).toBeInTheDocument()
  })

  it('shows em dash when paymentMethod is absent', () => {
    mockGetSalesOrderPayments.mockReturnValue({
      data: [makePayment({ paymentMethod: undefined, referenceNumber: undefined })],
      isLoading: false,
    })
    renderTab('o1', 200)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('shows negative amount in red for refunds', () => {
    mockGetSalesOrderPayments.mockReturnValue({
      data: [makePayment({ amount: -50 })],
      isLoading: false,
    })
    renderTab('o1', 200)
    const amountCell = screen.getByTestId('payment-amount-pay1')
    expect(amountCell).toHaveStyle({ color: 'rgb(211, 47, 47)' })
    expect(amountCell.textContent).toMatch(/-/)
  })

  it('renders summary row with Total Paid and Balance', () => {
    mockGetSalesOrderPayments.mockReturnValue({ data: [makePayment({ amount: 150 })], isLoading: false })
    renderTab('o1', 200)
    expect(screen.getByText('Total Paid')).toBeInTheDocument()
    expect(screen.getByText('Balance')).toBeInTheDocument()
  })

  it('passes orderId to query', () => {
    mockGetSalesOrderPayments.mockReturnValue({ data: [], isLoading: false })
    renderTab('order-99', 100)
    expect(mockGetSalesOrderPayments).toHaveBeenCalledWith('order-99')
  })
})
