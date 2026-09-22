import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'

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
  // formatDate reads 'dateFormat' from localStorage, which jsdom keeps across
  // tests; clear it so the one test that sets it cannot leak into the rest.
  beforeEach(() => {
    localStorage.clear()
  })

  // #1275: the detail view uses the same 'Date' label as the list and the
  // sibling accounting pages.
  it('labels the date field "Date", not "Settlement Date"', () => {
    view()
    expect(screen.getByText('Date')).toBeInTheDocument()
    expect(screen.queryByText('Settlement Date')).not.toBeInTheDocument()
  })

  // #1275: the expected string is a LITERAL, not formatDate(...) — an
  // expectation computed by the code under test could not fail. The saved
  // preference is set explicitly so the assertion does not depend on a
  // default no test controls.
  it('renders the settlement date date-only, in the saved format', () => {
    localStorage.setItem('dateFormat', 'DD/MM/YYYY')
    view({ settlementDate: '2026-09-22' })
    // Exact equality, not toHaveTextContent: that is a substring match and
    // would still accept '22/09/2026 14:30'.
    expect(screen.getByTestId('settlement-date').textContent).toBe('22/09/2026')
  })

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
