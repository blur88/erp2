import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import type { Supplier } from '@/types'
import { SupplierType } from '@/types'
import SupplierWorkspaceCard from '../SupplierWorkspaceCard'

const mockGetSupplierPurchaseOrdersQuery = vi.hoisted(() => vi.fn())
const mockGetSupplierGRNsQuery = vi.hoisted(() => vi.fn())
const mockGetSupplierPaymentsQuery = vi.hoisted(() => vi.fn())
const mockNavigate = vi.hoisted(() => vi.fn())

vi.mock('@/store/api/purchasingApi', () => ({
  useGetSupplierPurchaseOrdersQuery: mockGetSupplierPurchaseOrdersQuery,
  useGetSupplierGRNsQuery: mockGetSupplierGRNsQuery,
  useGetSupplierPaymentsQuery: mockGetSupplierPaymentsQuery,
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

const mockSupplier: Supplier = {
  id: 'sup-1',
  companyName: 'Acme Corp',
  type: SupplierType.LOCAL,
  isActive: true,
  totalPurchases: 0,
  totalOrders: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
}

describe('SupplierWorkspaceCard', () => {
  beforeEach(() => {
    mockGetSupplierPurchaseOrdersQuery.mockReset()
    mockGetSupplierGRNsQuery.mockReset()
    mockGetSupplierPaymentsQuery.mockReset()
    mockNavigate.mockReset()

    mockGetSupplierPurchaseOrdersQuery.mockReturnValue({ data: undefined, isLoading: false })
    mockGetSupplierGRNsQuery.mockReturnValue({ data: undefined, isLoading: false })
    mockGetSupplierPaymentsQuery.mockReturnValue({ data: undefined, isLoading: false })
  })

  it('renders empty Paper when no supplier selected', () => {
    const { container } = render(
      <MemoryRouter>
        <SupplierWorkspaceCard selectedSupplier={null} />
      </MemoryRouter>,
    )

    expect(container.querySelector('.MuiPaper-root')).toBeInTheDocument()
    expect(screen.queryByRole('tab')).not.toBeInTheDocument()
  })

  it('renders three tabs when supplier selected', () => {
    render(
      <MemoryRouter>
        <SupplierWorkspaceCard selectedSupplier={mockSupplier} />
      </MemoryRouter>,
    )

    expect(screen.getByRole('tab', { name: /purchase orders/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /grns/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /payments/i })).toBeInTheDocument()
  })

  it('shows empty state when no purchase orders', () => {
    mockGetSupplierPurchaseOrdersQuery.mockReturnValue({ data: { data: [] }, isLoading: false })

    render(
      <MemoryRouter>
        <SupplierWorkspaceCard selectedSupplier={mockSupplier} />
      </MemoryRouter>,
    )

    expect(screen.getByText(/no purchase orders found/i)).toBeInTheDocument()
  })

  it('clicking a purchase order navigates to purchasing orders list with highlight param', async () => {
    mockGetSupplierPurchaseOrdersQuery.mockReturnValue({
      data: {
        data: [{ id: 'po-1', orderNumber: 'PO-001', orderDate: '2026-01-10', receivedDate: null, paidAmount: 0, total: 2000 }],
      },
      isLoading: false,
    })

    render(
      <MemoryRouter>
        <SupplierWorkspaceCard selectedSupplier={mockSupplier} />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByText('PO-001').closest('tr')!)
    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/orders?highlight=po-1')
  })

  it('switches to GRNs tab on click', async () => {
    render(
      <MemoryRouter>
        <SupplierWorkspaceCard selectedSupplier={mockSupplier} />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('tab', { name: /grns/i }))
    expect(screen.getByText(/no grns found/i)).toBeInTheDocument()
  })

  it('switches to Payments tab on click', async () => {
    render(
      <MemoryRouter>
        <SupplierWorkspaceCard selectedSupplier={mockSupplier} />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('tab', { name: /payments/i }))
    expect(screen.getByText(/no payments found/i)).toBeInTheDocument()
  })

  it('clicking a payment navigates to vendor payments with vpId param', async () => {
    mockGetSupplierPaymentsQuery.mockReturnValue({
      data: {
        data: [{ id: 'vp-1', paymentNumber: 'VP-001', paymentDate: '2026-01-20', status: 'completed', amount: 500 }],
      },
      isLoading: false,
    })

    render(
      <MemoryRouter>
        <SupplierWorkspaceCard selectedSupplier={mockSupplier} />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('tab', { name: /payments/i }))
    await userEvent.click(screen.getByText('VP-001').closest('tr')!)
    expect(mockNavigate).toHaveBeenCalledWith('/purchasing/vendor-payments?vpId=vp-1')
  })
})
