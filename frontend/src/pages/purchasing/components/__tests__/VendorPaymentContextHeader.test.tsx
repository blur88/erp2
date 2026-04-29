import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

import VendorPaymentContextHeader from '../VendorPaymentContextHeader'

const basePayment = {
  id: 'vp-1',
  paymentNumber: 'VP-1001',
  status: 'completed' as const,
  paymentDate: new Date('2026-04-10T00:00:00.000Z'),
  supplier: { id: 'sup-1', companyName: 'Acme Supplies' },
  supplierId: 'sup-1',
  amount: 500,
  purchaseOrder: { id: 'po-1', orderNumber: 'PO-1001' },
  createdAt: new Date(),
} as any

describe('VendorPaymentContextHeader', () => {
  it('shows empty state when no payment selected', () => {
    render(
      <MemoryRouter>
        <VendorPaymentContextHeader
          selectedPayment={null}
          journalEntryRefs={[]}
          journalEntryRefLoading={false}
          onPrint={vi.fn()}
          onNavigateToJournalEntry={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText('Select a vendor payment to view details')).toBeInTheDocument()
  })

  it('renders payment number in header', () => {
    render(
      <MemoryRouter>
        <VendorPaymentContextHeader
          selectedPayment={basePayment}
          journalEntryRefs={[]}
          journalEntryRefLoading={false}
          onPrint={vi.fn()}
          onNavigateToJournalEntry={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.getByText(/Vendor Payment Details - VP-1001/i)).toBeInTheDocument()
  })

  it('renders a labeled Print action button', () => {
    render(
      <MemoryRouter>
        <VendorPaymentContextHeader
          selectedPayment={basePayment}
          journalEntryRefs={[]}
          journalEntryRefLoading={false}
          onPrint={vi.fn()}
          onNavigateToJournalEntry={vi.fn()}
        />
      </MemoryRouter>,
    )
    expect(screen.getByTitle('Print Payment')).toBeInTheDocument()
    expect(screen.getByText('Print')).toBeInTheDocument()
  })
})
