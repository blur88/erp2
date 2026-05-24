import { render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import CustomerInvoicesTab from '../CustomerInvoicesTab'

const { mockGetInvoices } = vi.hoisted(() => ({
  mockGetInvoices: vi.fn(),
}))

vi.mock('@/store/api/salesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/salesApi')>()
  return {
    ...actual,
    useGetInvoicesQuery: mockGetInvoices,
  }
})

function renderTab(customerId: string) {
  const store = configureStore({ reducer: { sales: (state = {}) => state } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <CustomerInvoicesTab customerId={customerId} />
      </MemoryRouter>
    </Provider>,
  )
}

describe('CustomerInvoicesTab', () => {
  it('shows loading state', () => {
    mockGetInvoices.mockReturnValue({ data: undefined, isLoading: true })
    renderTab('c1')
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows empty state when no invoices', () => {
    mockGetInvoices.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false })
    renderTab('c1')
    expect(screen.getByText(/No invoices yet/)).toBeInTheDocument()
  })

  it('renders invoice rows', () => {
    mockGetInvoices.mockReturnValue({
      data: {
        data: [{
          id: 'inv1',
          invoiceNumber: 'INV-001',
          salesOrder: { orderNumber: 'SO-001' },
          invoiceDate: '2026-01-20',
          totalAmount: 2000,
          balanceDue: 500,
          status: 'paid',
          customer: { id: 'c1', name: 'Acme' },
          paidAmount: 1500,
          createdAt: '2026-01-20',
          updatedAt: '2026-01-20',
        }],
        meta: { total: 1 },
      },
      isLoading: false,
    })
    renderTab('c1')
    expect(screen.getByText('INV-001')).toBeInTheDocument()
    expect(screen.getByText('SO-001')).toBeInTheDocument()
    expect(screen.getByText(/Paid/i)).toBeInTheDocument()
  })

  it('passes customerId to query', () => {
    mockGetInvoices.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false })
    renderTab('customer-xyz')
    expect(mockGetInvoices).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: 'customer-xyz' }),
    )
  })
})
