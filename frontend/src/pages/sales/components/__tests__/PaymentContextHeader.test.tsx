import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import PaymentContextHeader from '../PaymentContextHeader'

const basePayment = {
  id: 'payment-1',
  paymentNumber: 'PAY-1001',
  customerName: 'Acme Supplies',
  amount: 75,
  paymentDate: new Date('2026-04-13T00:00:00.000Z'),
  status: 'completed',
  paymentMethod: 'Cash',
  customer: {},
} as any

describe('PaymentContextHeader', () => {
  it('renders a labeled print action button', () => {
    render(
      <PaymentContextHeader
        selectedPayment={basePayment}
        journalEntryRefs={[]}
        journalEntryRefsLoading={false}
        onPrint={vi.fn()}
        onOrderClick={vi.fn()}
        onInvoiceClick={vi.fn()}
        onNavigateToJournalEntry={vi.fn()}
      />,
    )

    expect(screen.getByText('Print')).toBeInTheDocument()
  })
})
