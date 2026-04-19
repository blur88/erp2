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
  it('shows a lock banner when the purchase order is paid', () => {
    render(
      <PurchaseOrderWorkspaceCard
        selectedOrder={{ ...baseOrder, paidAmount: 10 }}
      />,
    )

    expect(screen.getByText(/Items are locked/i)).toBeInTheDocument()
    expect(screen.getByText(/unpay before editing/i)).toBeInTheDocument()
  })

  it('shows a lock banner when goods have been received', () => {
    render(
      <PurchaseOrderWorkspaceCard
        selectedOrder={{
          ...baseOrder,
          paidAmount: 0,
          goodsReceivedNotes: [{ id: 'grn-1', status: 'received' }],
        }}
      />,
    )

    expect(screen.getByText(/Items are locked/i)).toBeInTheDocument()
    expect(screen.getByText(/return goods before editing/i)).toBeInTheDocument()
  })

  it('shows a combined lock banner when both paid and received', () => {
    render(
      <PurchaseOrderWorkspaceCard
        selectedOrder={{
          ...baseOrder,
          paidAmount: 10,
          goodsReceivedNotes: [{ id: 'grn-1', status: 'received' }],
        }}
      />,
    )

    expect(screen.getByText(/Items are locked/i)).toBeInTheDocument()
    expect(screen.getByText(/return goods and unpay before editing/i)).toBeInTheDocument()
  })

  it('shows no lock banner when neither paid nor received', () => {
    render(
      <PurchaseOrderWorkspaceCard
        selectedOrder={{ ...baseOrder, paidAmount: 0, goodsReceivedNotes: [] }}
      />,
    )

    expect(screen.queryByText(/Items are locked/i)).not.toBeInTheDocument()
  })
})
