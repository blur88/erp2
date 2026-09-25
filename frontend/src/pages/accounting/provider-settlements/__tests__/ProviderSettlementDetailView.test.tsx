import '@testing-library/jest-dom/vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
  lines: [{
    id: 'l1', salesOrderPaymentId: 'pay-1', amount: '98.0000', releasedAt: null,
    salesOrderPayment: {
      id: 'pay-1', salesOrderId: 'so-1', paymentMethodId: 'pm-1', paymentDate: '2026-09-01',
      referenceNumber: 'REF-pay-1', amount: '999.0000',
      salesOrder: { id: 'so-1', orderNumber: 'SO-26-001' },
      paymentMethod: { id: 'pm-1', name: 'Atome' },
    },
  }],
}

const line = (
  id: string, paymentId: string, amount: string, so: string, method: string,
  released: string | null = null,
) => ({
  id, salesOrderPaymentId: paymentId, amount, releasedAt: released,
  salesOrderPayment: {
    id: paymentId, salesOrderId: so, paymentMethodId: method, paymentDate: '2026-09-01',
    referenceNumber: `REF-${paymentId}`,
    // LIVE amount deliberately differs from the snapshot: the view must use the snapshot.
    amount: '999.0000',
    salesOrder: { id: so, orderNumber: so === 'so-8' ? 'SO-26-008' : 'SO-26-009' },
    paymentMethod: { id: method, name: 'TikTok' },
  },
})

const view = (over: Partial<typeof base> = {}) =>
  render(
    <MemoryRouter>
      <ProviderSettlementDetailView settlement={{ ...base, ...over } as any} />
    </MemoryRouter>,
  )

// #1285 helpers: a line with a joined payment (grouped by order + method) and
// a legacy line with no joined payment (its own group, labels '—').
let lineSeq = 0
const lineFor = (orderNumber: string, method: string) => {
  lineSeq += 1
  const id = `line-${lineSeq}`
  const salesOrderId = `so-${orderNumber}`
  const paymentMethodId = `pm-${method}`
  return {
    id, salesOrderPaymentId: `pay-${lineSeq}`, amount: '10.0000', releasedAt: null,
    salesOrderPayment: {
      id: `pay-${lineSeq}`, salesOrderId, paymentMethodId, paymentDate: '2026-09-01',
      referenceNumber: `REF-${lineSeq}`,
      salesOrder: { id: salesOrderId, orderNumber },
      paymentMethod: { id: paymentMethodId, name: method },
    },
  }
}

const legacyLine = () => {
  lineSeq += 1
  return {
    id: `legacy-${lineSeq}`, salesOrderPaymentId: `legacy-pay-${lineSeq}`,
    amount: '5.0000', releasedAt: null,
  }
}

const draftWithLines = ({
  isProviderClearing,
  lines,
}: { isProviderClearing: boolean; lines: any[] }) =>
  ({
    ...base,
    status: 'DRAFT',
    clearingAccount: { ...base.clearingAccount, isProviderClearing },
    lines,
  })

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

  it('lists the claimed payments grouped by order and method', () => {
    view()
    // The raw payment UUID is never displayed; the group row identifies it.
    expect(screen.queryByText('pay-1')).not.toBeInTheDocument()
    expect(screen.getByText('SO-26-001')).toBeInTheDocument()
    expect(screen.getByTestId('group-net')).toHaveTextContent('98.00')
  })

  it('groups lines by Sales Order + Payment Method with totals from snapshots', async () => {
    view({
      lines: [
        line('l1', 'p1', '100.0000', 'so-8', 'pm-tt'),
        line('l2', 'r1', '-30.0000', 'so-8', 'pm-tt'),
        line('l3', 'p2', '20.0000', 'so-9', 'pm-tt'),
      ],
    } as any)
    const row = screen.getByText('SO-26-008').closest('tr')!
    expect(within(row).getByText('TikTok')).toBeInTheDocument()
    expect(within(row).getByTestId('group-net')).toHaveTextContent('70.00')
    expect(screen.queryByText('p1')).not.toBeInTheDocument() // no raw uuids
    await userEvent.click(
      within(row).getByRole('button', { name: /show payments for SO-26-008/i }),
    )
    expect(screen.getByText('REF-p1')).toBeInTheDocument()
    expect(screen.getByText('REF-r1')).toBeInTheDocument()
  })

  // #1285, Review Focus #5: legacy lines with no joined payment each fall back
  // to their own group key, so several render the same '— · —' label. The
  // banner deduplicates by LABEL, listing each order · method exactly once.
  it('shows the banner for a DRAFT with an unflagged clearing account, listing each order · method once', () => {
    render(
      <MemoryRouter>
        <ProviderSettlementDetailView settlement={draftWithLines({
          isProviderClearing: false,
          lines: [
            lineFor('SO-1', 'CIMB'), lineFor('SO-1', 'CIMB'), lineFor('SO-2', 'CIMB'),
            legacyLine(), legacyLine(),
          ],
        }) as any} />
      </MemoryRouter>,
    )
    const banner = screen.getByTestId('not-provider-clearing')
    expect(banner).toHaveTextContent(
      'These payments were not recorded to a provider clearing account. Edit the draft to remove them, or discard it.',
    )
    expect(within(banner).getAllByRole('listitem').map((li) => li.textContent))
      .toEqual(['SO-1 · CIMB', 'SO-2 · CIMB', '— · —'])
  })

  it.each(['POSTED', 'REVERSED'] as const)('no banner for a %s settlement', (status) => {
    view({
      status,
      clearingAccount: { ...base.clearingAccount, isProviderClearing: false },
    } as any)
    expect(screen.queryByTestId('not-provider-clearing')).toBeNull()
  })

  it('no banner for a flagged DRAFT', () => {
    view({
      status: 'DRAFT',
      clearingAccount: { ...base.clearingAccount, isProviderClearing: true },
    } as any)
    expect(screen.queryByTestId('not-provider-clearing')).toBeNull()
  })
})
