import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import ProviderSettlementDetailView from '../ProviderSettlementDetailView'

const base = {
  id: 'ps-1', referenceNumber: 'PS-26-001', settlementDate: '2026-09-20',
  providerPaymentMethod: { id: 'pm-1', name: 'Atome' }, providerReference: 'ATM-9911',
  clearingAccount: { id: 'c1', code: '1240', name: 'Atome' },
  bankAccount: { id: 'b1', code: '1200', name: 'CIMB' },
  settlementAmount: '98.0000', status: 'DRAFT',
  journalEntryId: null, reversalJournalEntryId: null,
  postedAt: null, postedBy: null, reversedAt: null, reversedBy: null,
  lines: [{ id: 'l1', salesOrderPaymentId: 'pay-1', amount: '98.0000', releasedAt: null }],
}

const view = (over: Partial<typeof base> = {}) =>
  render(
    <MemoryRouter>
      <ProviderSettlementDetailView settlement={{ ...base, ...over } as any} />
    </MemoryRouter>,
  )

describe('ProviderSettlementDetailView', () => {
  it('shows no journal link on a draft', () => {
    view()
    expect(screen.queryByRole('link', { name: /journal entry/i })).not.toBeInTheDocument()
  })

  it('shows one journal link once posted', () => {
    view({ status: 'POSTED', journalEntryId: 'je-1' } as any)
    expect(screen.getByRole('link', { name: /^journal entry$/i })).toHaveAttribute(
      'href', '/accounting/journal-entries/je-1',
    )
    expect(screen.queryByRole('link', { name: /reversing entry/i })).not.toBeInTheDocument()
  })

  it('shows BOTH the original and the reversing entry once reversed', () => {
    view({
      status: 'REVERSED', journalEntryId: 'je-1', reversalJournalEntryId: 'je-2',
    } as any)
    expect(screen.getByRole('link', { name: /^journal entry$/i })).toHaveAttribute(
      'href', '/accounting/journal-entries/je-1',
    )
    expect(screen.getByRole('link', { name: /reversing entry/i })).toHaveAttribute(
      'href', '/accounting/journal-entries/je-2',
    )
  })

  it('renders the settlement amount at cent precision', () => {
    view()
    expect(screen.getByTestId('settlement-amount')).toHaveTextContent('98.00')
  })

  it('lists the claimed payments with their amounts', () => {
    view()
    expect(screen.getByText('pay-1')).toBeInTheDocument()
    expect(screen.getAllByText(/98\.00/).length).toBeGreaterThanOrEqual(2)
  })
})
