import React from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { Supplier } from '@/types'
import { SupplierType } from '@/types'
import SupplierWorkspaceCard from '../SupplierWorkspaceCard'

vi.mock('@/store/api/purchasingApi', () => ({
  useGetSupplierPurchaseOrdersQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  useGetSupplierGRNsQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
  useGetSupplierPaymentsQuery: vi.fn(() => ({ data: undefined, isLoading: false })),
}))

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
    render(
      <MemoryRouter>
        <SupplierWorkspaceCard selectedSupplier={mockSupplier} />
      </MemoryRouter>,
    )

    expect(screen.getByText(/no purchase orders found/i)).toBeInTheDocument()
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
})
