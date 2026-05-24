import { render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import CustomerPaymentsTab from '../CustomerPaymentsTab'

const { mockGetPayments } = vi.hoisted(() => ({
  mockGetPayments: vi.fn(),
}))

vi.mock('@/store/api/salesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/salesApi')>()
  return {
    ...actual,
    useGetPaymentsQuery: mockGetPayments,
  }
})

function renderTab(customerId: string) {
  const store = configureStore({ reducer: { sales: (state = {}) => state } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <CustomerPaymentsTab customerId={customerId} />
      </MemoryRouter>
    </Provider>,
  )
}

describe('CustomerPaymentsTab', () => {
  it('shows loading state', () => {
    mockGetPayments.mockReturnValue({ data: undefined, isLoading: true })
    renderTab('c1')
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows empty state when no payments', () => {
    mockGetPayments.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false })
    renderTab('c1')
    expect(screen.getByText(/No payments yet/)).toBeInTheDocument()
  })

  it('renders payment rows', () => {
    mockGetPayments.mockReturnValue({
      data: {
        data: [{
          id: 'p1',
          paymentNumber: 'PAY-001',
          invoice: { id: 'inv1', invoiceNumber: 'INV-001' },
          paymentDate: '2026-01-25',
          amount: 1000,
          paymentMethod: 'cash',
          referenceNumber: 'REF-123',
          status: 'completed',
          customerId: 'c1',
          createdAt: '2026-01-25',
          updatedAt: '2026-01-25',
        }],
        meta: { total: 1 },
      },
      isLoading: false,
    })
    renderTab('c1')
    expect(screen.getByText('PAY-001')).toBeInTheDocument()
    expect(screen.getByText('INV-001')).toBeInTheDocument()
    expect(screen.getByText('REF-123')).toBeInTheDocument()
    expect(screen.getByText('View')).toBeInTheDocument()
  })

  it('passes customerId to query', () => {
    mockGetPayments.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false })
    renderTab('cust-99')
    expect(mockGetPayments).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'cust-99' }),
    )
  })
})
