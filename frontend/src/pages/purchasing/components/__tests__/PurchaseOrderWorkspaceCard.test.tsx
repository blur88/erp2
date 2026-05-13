import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import PurchaseOrderWorkspaceCard from '../PurchaseOrderWorkspaceCard'

const baseOrder = {
  id: 'po-1',
  orderNumber: 'PO-1001',
  supplier: { id: 'sup-1', companyName: 'Acme Supplies' },
  items: [{ id: 'item-1', product: { name: 'Widget' }, quantity: 2, unitPrice: 10, total: 20 }],
  total: 20,
  orderDate: new Date('2026-04-19T00:00:00.000Z'),
  createdAt: new Date(),
  updatedAt: new Date(),
} as any

describe('PurchaseOrderWorkspaceCard', () => {
  it('renders the PO Items section header', () => {
    render(<PurchaseOrderWorkspaceCard selectedOrder={{ ...baseOrder, paidAmount: 0, goodsReceivedNotes: [] }} />)
    expect(screen.getByText('PO Items')).toBeInTheDocument()
  })

  it('shows no lock alert when locked', () => {
    render(<PurchaseOrderWorkspaceCard selectedOrder={{ ...baseOrder, paidAmount: 10 }} />)
    expect(screen.queryByText(/Items are locked/i)).not.toBeInTheDocument()
  })

  it('shows no lock alert when goods received', () => {
    render(
      <PurchaseOrderWorkspaceCard
        selectedOrder={{ ...baseOrder, paidAmount: 0, goodsReceivedNotes: [{ id: 'grn-1', status: 'received' }] }}
      />,
    )
    expect(screen.queryByText(/Items are locked/i)).not.toBeInTheDocument()
  })
})
