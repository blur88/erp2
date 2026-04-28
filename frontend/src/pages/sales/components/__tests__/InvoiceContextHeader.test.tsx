import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import InvoiceContextHeader from '../InvoiceContextHeader'

const baseInvoice = {
  id: 'invoice-1',
  invoiceNumber: 'INV-1001',
  invoiceDate: new Date('2026-04-12T00:00:00.000Z'),
  customerName: 'Acme Supplies',
  salesOrder: null,
  totalAmount: 150,
  shippingAmount: 0,
  paidAmount: 0,
  balanceDue: 150,
  status: 'draft',
  payments: [],
} as any

describe('InvoiceContextHeader', () => {
  it('renders a labeled print action button', () => {
    render(
      <InvoiceContextHeader
        selectedInvoice={baseInvoice}
        journalEntryRefs={[]}
        journalEntryRefsLoading={false}
        onPrint={vi.fn()}
        onNavigateToSalesOrder={vi.fn()}
        onNavigateToPayment={vi.fn()}
        onNavigateToJournalEntries={vi.fn()}
      />,
    )

    expect(screen.getByText('Print')).toBeInTheDocument()
  })
})
