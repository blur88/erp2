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
})
