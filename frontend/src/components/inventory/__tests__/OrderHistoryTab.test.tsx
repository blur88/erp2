import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const { mockNavigate, mockGet, mockShowError } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockGet: vi.fn(),
  mockShowError: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/services/api', () => ({ ApiService: { get: mockGet } }))
vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showError: mockShowError }) }))

import OrderHistoryTab from '../OrderHistoryTab'

function renderTab() {
  return render(
    <MemoryRouter>
      <OrderHistoryTab productId="p1" />
    </MemoryRouter>,
  )
}

describe('OrderHistoryTab', () => {
  it('navigates to the sales order when View is clicked', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            id: 'h1',
            type: 'sales_order',
            orderNumber: 'SO-5',
            customerOrVendor: 'Acme',
            date: '2026-01-01',
            paymentStatus: 'paid',
            fulfillmentStatus: 'fulfilled',
            quantity: 3,
            subTotal: 300,
          },
        ],
        meta: { total: 1 },
      },
    })
    renderTab()
    await waitFor(() => expect(screen.getByText('SO-5')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /view/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/sales/orders/SO-5/view')
  })

  it('renders payment + fulfillment chips for a sales order row', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            id: 'h2',
            type: 'sales_order',
            orderNumber: 'SO-6',
            customerOrVendor: 'Acme',
            date: '2026-01-01',
            paymentStatus: 'paid',
            fulfillmentStatus: 'unfulfilled',
            quantity: 1,
            subTotal: 100,
          },
        ],
        meta: { total: 1 },
      },
    })
    renderTab()
    await waitFor(() => expect(screen.getByText('SO-6')).toBeInTheDocument())
    expect(screen.getByText(/Paid/i)).toBeInTheDocument()
    expect(screen.getByText(/Unfulfilled/i)).toBeInTheDocument()
  })

  it('navigates to the purchase order when View is clicked', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            id: 'h3',
            type: 'purchase_order',
            orderNumber: 'PO-8',
            customerOrVendor: 'Vendor Co',
            date: '2026-01-01',
            paymentStatus: 'unpaid',
            receivedStatus: 'not_received',
            quantity: 2,
            subTotal: 200,
          },
        ],
        meta: { total: 1 },
      },
    })
    renderTab()
    await waitFor(() => expect(screen.getByText('PO-8')).toBeInTheDocument())
    await userEvent.click(screen.getByRole('button', { name: /view/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/orders/PO-8/view')
  })

  it('renders payment + received chips for a purchase order row', async () => {
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            id: 'h4',
            type: 'purchase_order',
            orderNumber: 'PO-9',
            customerOrVendor: 'Vendor Co',
            date: '2026-01-01',
            paymentStatus: 'unpaid',
            receivedStatus: 'not_received',
            quantity: 2,
            subTotal: 200,
          },
        ],
        meta: { total: 1 },
      },
    })
    renderTab()
    await waitFor(() => expect(screen.getByText('PO-9')).toBeInTheDocument())
    expect(screen.getByText(/Unpaid/i)).toBeInTheDocument()
    expect(screen.getByText(/Not Received/i)).toBeInTheDocument()
  })
})
