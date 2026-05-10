import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import OrderContextHeader from '../OrderContextHeader'

const baseOrder = {
  id: 'order-1',
  orderNumber: 'SO-1001',
  orderDate: new Date('2026-04-10T00:00:00.000Z'),
  customer: { id: 'customer-1', name: 'Acme Supplies' },
  invoices: [],
  items: [{ id: 'item-1', totalAmount: 120 }],
  totalAmount: 120,
  paidAmount: 0,
  isPaidInFull: false,
  isFulfilled: false,
} as any

describe('OrderContextHeader', () => {
  it('renders labeled action buttons in the header and payment section', () => {
    render(
      <MemoryRouter>
      <OrderContextHeader
        selectedOrder={baseOrder}
        isLoading={false}
        journalEntryRef={null}
        journalEntryRefLoading={false}
        onEditOrder={vi.fn()}
        onDeleteOrder={vi.fn()}
        onPrintOrder={vi.fn()}
        onNavigateToInvoice={vi.fn()}
        onNavigateToPayment={vi.fn()}
        onNavigateToJournalEntry={vi.fn()}
        onRefundOrder={vi.fn()}
        onUnpayOrder={vi.fn()}
        onOpenPaymentDialog={vi.fn()}
        onFulfillOrder={vi.fn()}
        onUnfulfillOrder={vi.fn()}
      />
      </MemoryRouter>,
    )

    expect(screen.getByText('Edit')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.getByText('Print')).toBeInTheDocument()
    expect(screen.getByText('Pay')).toBeInTheDocument()
    expect(screen.getByText('Fulfill')).toBeInTheDocument()
  })
})
