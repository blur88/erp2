import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const { mockNavigate, mockQuery } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockQuery: vi.fn(),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/store/api/purchasingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/purchasingApi')>()
  return { ...actual, useGetSupplierPaymentsQuery: mockQuery }
})

import SupplierPaymentsTab from '../SupplierPaymentsTab'

function renderTab() {
  return render(
    <MemoryRouter>
      <SupplierPaymentsTab supplierId="s1" />
    </MemoryRouter>,
  )
}

describe('SupplierPaymentsTab', () => {
  it('navigates to the PO when View is clicked for a payment with an order', async () => {
    mockNavigate.mockClear()
    mockQuery.mockReturnValue({
      data: {
        data: [
          {
            id: 'p1',
            paymentNumber: 'PAY-1',
            paymentDate: '2026-01-01',
            amount: 100,
            purchaseOrder: { orderNumber: 'PO-9' },
          },
        ],
      },
      isLoading: false,
    })
    renderTab()
    await userEvent.click(screen.getByRole('button', { name: /view/i }))
    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/orders/PO-9/view')
  })

  it('disables View when the payment has no purchase order', () => {
    mockQuery.mockReturnValue({
      data: { data: [{ id: 'p2', paymentNumber: 'PAY-2', paymentDate: '2026-01-01', amount: 50 }] },
      isLoading: false,
    })
    renderTab()
    expect(screen.getByRole('button', { name: /view/i })).toBeDisabled()
  })

  it('passes supplierId, page and limit to the query', () => {
    mockQuery.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false })
    renderTab()
    expect(mockQuery).toHaveBeenCalledWith(
      expect.objectContaining({ supplierId: 's1', page: 1, limit: expect.any(Number) }),
    )
  })

  it('renders the footer total', () => {
    mockQuery.mockReturnValue({
      data: {
        data: [{ id: 'vp1', paymentNumber: 'VP-001', paymentDate: '2026-01-01', amount: 250, paymentMethodEntity: { id: 'm1', name: 'Bank', isActive: true } }],
        meta: { total: 55 },
      },
      isLoading: false,
    })
    renderTab()
    expect(screen.getByText('VP-001')).toBeInTheDocument()
    expect(screen.getByText(/of 55 records/)).toBeInTheDocument()
  })
})
