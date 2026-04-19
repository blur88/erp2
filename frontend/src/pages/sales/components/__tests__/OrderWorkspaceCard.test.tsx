import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import OrderWorkspaceCard from '../OrderWorkspaceCard'

const baseOrder = {
  id: 'so-1',
  orderNumber: 'SO-1001',
  customerId: 'cust-1',
  items: [{ id: 'item-1', product: { name: 'Widget' }, quantity: 2, unitPrice: 10, totalAmount: 20 }],
  totalAmount: 20,
  orderDate: new Date('2026-04-19T00:00:00.000Z'),
  createdAt: new Date(),
  updatedAt: new Date(),
} as any

describe('OrderWorkspaceCard', () => {
  it('shows a lock banner when the sales order is fulfilled', () => {
    render(
      <OrderWorkspaceCard
        selectedOrder={{ ...baseOrder, isFulfilled: true }}
      />,
    )

    expect(screen.getByText(/Items are locked/i)).toBeInTheDocument()
    expect(screen.getByText(/unfulfill before editing/i)).toBeInTheDocument()
  })
})
