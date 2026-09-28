import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import ProviderSettlementDetailView from '../ProviderSettlementDetailView'

const mockNavigate = vi.fn()
const mockPost = vi.fn()
const mockDiscard = vi.fn()
const mockReverse = vi.fn()
const mockShowSuccess = vi.fn()
const mockShowError = vi.fn()
// Per-mutation pending flag, read at render time.
const pending = { post: false, discard: false, reverse: false }

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

// Each trigger returns { unwrap } like an RTK Query mutation.
const trigger = (fn: ReturnType<typeof vi.fn>) => (id: string) => ({ unwrap: () => fn(id) })

vi.mock('@/store/api/accountingApi', () => ({
  usePostProviderSettlementMutation: () => [trigger(mockPost), { isLoading: pending.post }],
  useDiscardProviderSettlementMutation: () => [trigger(mockDiscard), { isLoading: pending.discard }],
  useReverseProviderSettlementMutation: () => [trigger(mockReverse), { isLoading: pending.reverse }],
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: mockShowSuccess, showError: mockShowError }),
}))

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

// `search` seeds the detail URL, e.g. '?tab=1' opens the Payments tab.
const view = (over: Partial<typeof base> = {}, search = '') =>
  render(
    <MemoryRouter initialEntries={[`/accounting/provider-settlements/ps-1/view${search}`]}>
      <ProviderSettlementDetailView settlement={{ ...base, ...over } as any} />
    </MemoryRouter>,
  )

const header = () => screen.getByTestId('page-header-divider')

// The CardContent under a section title — scopes field lookups so a value that
// also appears in the header (the provider name) is not an ambiguous match.
const section = (title: string) =>
  screen.getByRole('heading', { name: title }).closest('.MuiCardContent-root') as HTMLElement

// A Field renders its caption and then its value as the next sibling.
const fieldValue = (scope: HTMLElement, label: string) =>
  within(scope).getByText(label).nextElementSibling as HTMLElement

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
    for (const m of [mockNavigate, mockPost, mockDiscard, mockReverse, mockShowSuccess, mockShowError]) {
      m.mockReset()
    }
    mockPost.mockResolvedValue(undefined)
    mockDiscard.mockResolvedValue(undefined)
    mockReverse.mockResolvedValue(undefined)
    Object.assign(pending, { post: false, discard: false, reverse: false })
  })

  // #1316: status-driven document actions under the header.
  describe('document actions', () => {
    const actionRow = () => screen.queryByTestId('settlement-actions')
    const actionLabels = () =>
      within(actionRow()!).getAllByRole('button').map((b) => b.textContent)
    const dialog = () => screen.getByRole('dialog')

    it('offers Edit, Post and Discard on a draft', () => {
      view()
      expect(actionLabels()).toEqual(['Edit', 'Post', 'Discard'])
    })

    it('offers only Reverse once posted', () => {
      view({ status: 'POSTED', journalEntryId: 'je-1' } as any)
      expect(actionLabels()).toEqual(['Reverse'])
    })

    it('renders no action row once reversed', () => {
      view({ status: 'REVERSED', journalEntryId: 'je-1', reversalJournalEntryId: 'je-2' } as any)
      expect(actionRow()).toBeNull()
    })

    it('never offers View on the detail page itself', () => {
      view()
      expect(within(actionRow()!).queryByRole('button', { name: 'View' })).toBeNull()
    })

    it('makes the primary action contained and the others outlined', () => {
      view()
      const btn = (name: string) => within(actionRow()!).getByRole('button', { name })
      expect(btn('Post')).toHaveClass('MuiButton-contained')
      expect(btn('Edit')).toHaveClass('MuiButton-outlined')
      expect(btn('Discard')).toHaveClass('MuiButton-outlined')
    })

    it('makes Reverse contained on a posted settlement', () => {
      view({ status: 'POSTED', journalEntryId: 'je-1' } as any)
      expect(within(actionRow()!).getByRole('button', { name: 'Reverse' }))
        .toHaveClass('MuiButton-contained')
    })

    it('navigates to the edit route', async () => {
      view()
      await userEvent.click(within(actionRow()!).getByRole('button', { name: 'Edit' }))
      expect(mockNavigate).toHaveBeenCalledWith('/accounting/provider-settlements/ps-1/edit')
    })

    describe('Post guard', () => {
      it('disables Post with its tooltip when the clearing account is explicitly unflagged', async () => {
        view({ clearingAccount: { ...base.clearingAccount, isProviderClearing: false } } as any)
        const post = within(actionRow()!).getByRole('button', { name: 'Post' })
        expect(post).toBeDisabled()
        // A disabled button swallows pointer events; the wrapper carries the hover.
        await userEvent.hover(post.parentElement!)
        expect(await screen.findByRole('tooltip')).toHaveTextContent('Not a provider clearing account')
      })

      it('leaves Post enabled when the clearing account is flagged', () => {
        view({ clearingAccount: { ...base.clearingAccount, isProviderClearing: true } } as any)
        expect(within(actionRow()!).getByRole('button', { name: 'Post' })).toBeEnabled()
      })

      // Only an explicit false blocks; an unknown flag never does.
      it('leaves Post enabled when the flag is undefined', () => {
        view()
        expect(base.clearingAccount).not.toHaveProperty('isProviderClearing')
        expect(within(actionRow()!).getByRole('button', { name: 'Post' })).toBeEnabled()
      })
    })

    describe.each([
      { label: 'Post', status: 'DRAFT', mutation: () => mockPost, done: 'posted' },
      { label: 'Discard', status: 'DRAFT', mutation: () => mockDiscard, done: 'discarded' },
      { label: 'Reverse', status: 'POSTED', mutation: () => mockReverse, done: 'reversed' },
    ] as const)('$label', ({ label, status, mutation, done }) => {
      const open = async () => {
        view({ status, journalEntryId: status === 'POSTED' ? 'je-1' : null } as any)
        await userEvent.click(within(actionRow()!).getByRole('button', { name: label }))
      }

      it('confirms before mutating', async () => {
        await open()
        expect(dialog()).toBeInTheDocument()
        expect(mutation()).not.toHaveBeenCalled()
        await userEvent.click(within(dialog()).getByRole('button', { name: label }))
        expect(mutation()).toHaveBeenCalledWith('ps-1')
        await waitFor(() =>
          expect(mockShowSuccess).toHaveBeenCalledWith(`Settlement PS-26-001 ${done}`))
        expect(mockShowError).not.toHaveBeenCalled()
      })

      it('does nothing when cancelled', async () => {
        await open()
        await userEvent.click(within(dialog()).getByRole('button', { name: 'Cancel' }))
        await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
        expect(mutation()).not.toHaveBeenCalled()
      })

      it('reports the server error and stays on the page', async () => {
        mutation().mockRejectedValue({ status: 409, data: 'Settlement changed' })
        await open()
        await userEvent.click(within(dialog()).getByRole('button', { name: label }))
        await waitFor(() => expect(mockShowError).toHaveBeenCalledWith('Settlement changed'))
        expect(mockShowSuccess).not.toHaveBeenCalled()
        expect(mockNavigate).not.toHaveBeenCalled()
      })
    })

    it.each([
      { label: 'Post', status: 'DRAFT', key: 'post' },
      { label: 'Discard', status: 'DRAFT', key: 'discard' },
      { label: 'Reverse', status: 'POSTED', key: 'reverse' },
    ] as const)('disables confirming $label while its mutation is pending', async ({ label, status, key }) => {
      pending[key] = true
      view({ status, journalEntryId: status === 'POSTED' ? 'je-1' : null } as any)
      await userEvent.click(within(actionRow()!).getByRole('button', { name: label }))
      expect(within(dialog()).getByRole('button', { name: label })).toBeDisabled()
    })

    it('returns to the list after a successful Discard', async () => {
      view()
      await userEvent.click(within(actionRow()!).getByRole('button', { name: 'Discard' }))
      await userEvent.click(within(dialog()).getByRole('button', { name: 'Discard' }))
      await waitFor(() =>
        expect(mockNavigate).toHaveBeenCalledWith('/accounting/provider-settlements'))
    })

    it.each(['Post', 'Reverse'] as const)('stays on the detail page after a successful %s', async (label) => {
      view(label === 'Reverse' ? { status: 'POSTED', journalEntryId: 'je-1' } as any : {})
      await userEvent.click(within(actionRow()!).getByRole('button', { name: label }))
      await userEvent.click(within(dialog()).getByRole('button', { name: label }))
      await waitFor(() => expect(mockShowSuccess).toHaveBeenCalled())
      expect(mockNavigate).not.toHaveBeenCalled()
    })
  })

  // #1315: the shared Accounting detail header.
  describe('header', () => {
    it('shows the reference as the page heading with the provider as subtitle', () => {
      view()
      expect(within(header()).getByRole('heading', { name: 'PS-26-001' })).toBeInTheDocument()
      expect(within(header()).getByText('Atome')).toBeInTheDocument()
    })

    it('shows the status badge in the header, not as a field', () => {
      view({ status: 'POSTED' } as any)
      expect(within(header()).getByText(/posted/i)).toBeInTheDocument()
      expect(screen.queryByText('Status')).not.toBeInTheDocument()
    })

    it('navigates back to the list', async () => {
      view()
      await userEvent.click(within(header()).getByRole('button', { name: 'Back' }))
      expect(mockNavigate).toHaveBeenCalledWith('/accounting/provider-settlements')
    })

    // Siblings keep money figures out of the header (Expense: Accounting card).
    it('does not show the settlement amount in the header', () => {
      view()
      expect(within(header()).queryByText(/98\.00/)).not.toBeInTheDocument()
      expect(within(header()).queryByText('Settlement Amount')).not.toBeInTheDocument()
    })
  })

  // #1315: Overview holds the information and accounting cards.
  describe('overview sections', () => {
    it('groups settlement metadata under Settlement Information', () => {
      localStorage.setItem('dateFormat', 'DD/MM/YYYY')
      view()
      const info = section('Settlement Information')
      expect(fieldValue(info, 'Date').textContent).toBe('20/09/2026')
      expect(fieldValue(info, 'Provider').textContent).toBe('Atome')
      expect(fieldValue(info, 'Provider Reference').textContent).toBe('ATM-9911')
    })

    it('groups the accounts under Accounting', () => {
      view()
      const acct = section('Accounting')
      expect(fieldValue(acct, 'Provider Clearing Account').textContent).toBe('1240 Atome')
      expect(fieldValue(acct, 'Bank Account').textContent).toBe('1200 CIMB')
      expect(fieldValue(acct, 'Settlement Amount')).toHaveTextContent('98.00')
    })

    it('shows "—" for a missing provider and reference, in the card and the subtitle', () => {
      view({ providerPaymentMethod: undefined, providerReference: null } as any)
      const info = section('Settlement Information')
      expect(fieldValue(info, 'Provider').textContent).toBe('—')
      expect(fieldValue(info, 'Provider Reference').textContent).toBe('—')
      expect(within(header()).getByText('—')).toBeInTheDocument()
    })
  })

  // #1315: ?tab= selects the tab; anything but a valid index falls back to Overview.
  describe('tabs', () => {
    const selected = (name: string) =>
      screen.getByRole('tab', { name }).getAttribute('aria-selected')

    it('defaults to Overview', () => {
      view()
      expect(selected('Overview')).toBe('true')
      expect(section('Accounting')).toBeInTheDocument()
    })

    it('opens Payments from ?tab=1', () => {
      view({}, '?tab=1')
      expect(selected('Payments')).toBe('true')
      expect(screen.getByText('SO-26-001')).toBeInTheDocument()
    })

    it.each(['abc', '5', '-1', '1.5', ''])('falls back to Overview for ?tab=%s', (tab) => {
      view({}, `?tab=${tab}`)
      expect(selected('Overview')).toBe('true')
      expect(selected('Payments')).toBe('false')
      expect(section('Settlement Information')).toBeInTheDocument()
    })

    it('shows the empty state and no summary when the settlement has no payments', () => {
      view({ lines: [] } as any, '?tab=1')
      expect(screen.getByText('No payments in this settlement.')).toBeInTheDocument()
      expect(screen.queryByRole('table')).not.toBeInTheDocument()
      expect(screen.queryByTestId('payments-settlement-amount')).not.toBeInTheDocument()
    })

    // Same frame and shape as the siblings' Payments tabs: the shared DataTable
    // card, one row per payment, the total in a right-aligned summary under it
    // (OrderPaymentsTab's footer). No grouping, no expand toggles.
    it('renders Payments as the sibling flat DataTable with a Settlement Amount summary', () => {
      view({}, '?tab=1')
      const table = screen.getByRole('table')
      expect(table.closest('.MuiPaper-outlined')).not.toBeNull()
      expect(within(table).getAllByRole('columnheader').map((h) => h.textContent))
        .toEqual(['Date', 'Sales Order No', 'Payment Method', 'Reference', 'Amount'])
      expect(within(table).queryByRole('button')).not.toBeInTheDocument()
      expect(screen.getByTestId('payments-settlement-amount')).toHaveTextContent('98.00')
      expect(table).not.toContainElement(screen.getByTestId('payments-settlement-amount'))
    })
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

  it('shows the journal links in the Accounting section', () => {
    view({
      status: 'REVERSED', journalEntryId: 'je-1', reversalJournalEntryId: 'je-2',
    } as any)
    const acct = section('Accounting')
    expect(within(acct).getByRole('link', { name: /^journal entry$/i })).toBeInTheDocument()
    expect(within(acct).getByRole('link', { name: /reversing entry/i })).toBeInTheDocument()
  })

  it('shows the not-provider-clearing banner on the Payments tab too', () => {
    view({
      status: 'DRAFT',
      clearingAccount: { ...base.clearingAccount, isProviderClearing: false },
    } as any, '?tab=1')
    expect(screen.getByTestId('not-provider-clearing')).toBeInTheDocument()
  })

  it('renders the settlement amount at cent precision', () => {
    view()
    expect(screen.getByTestId('settlement-amount')).toHaveTextContent('98.00')
  })

  it('lists each claimed payment as its own row, never the raw payment UUID', () => {
    localStorage.setItem('dateFormat', 'DD/MM/YYYY')
    view({}, '?tab=1')
    expect(screen.queryByText('pay-1')).not.toBeInTheDocument()
    const row = screen.getByText('REF-pay-1').closest('tr')!
    expect(within(row).getAllByRole('cell').map((c) => c.textContent))
      .toEqual(['01/09/2026', 'SO-26-001', 'Atome', 'REF-pay-1', 'RM 98.00'])
  })

  it('shows one row per line with SNAPSHOT amounts, ordered by sales order then date', () => {
    const late = { ...line('l1', 'p1', '100.0000', 'so-8', 'pm-tt') }
    late.salesOrderPayment = { ...late.salesOrderPayment, paymentDate: '2026-09-05' }
    view({
      // Deliberately out of order: SO-26-009 first, SO-26-008's later payment first.
      lines: [
        line('l3', 'p2', '20.0000', 'so-9', 'pm-tt'),
        late,
        line('l2', 'r1', '-30.0000', 'so-8', 'pm-tt'),
      ],
    } as any, '?tab=1')
    const refs = screen.getAllByText(/^REF-/).map((el) => el.textContent)
    expect(refs).toEqual(['REF-r1', 'REF-p1', 'REF-p2'])
    // The live salesOrderPayment.amount (999.00) must never be shown.
    expect(screen.queryByText(/999/)).not.toBeInTheDocument()
    expect(screen.getByTestId('line-amount-l1')).toHaveTextContent('100.00')
    expect(screen.getByTestId('line-amount-l2')).toHaveTextContent('-30.00')
  })

  // Same colour rule as the sibling Payments tabs (ExpenseDetailPage.test.tsx:253).
  it('renders a negative line amount in red and a positive one in the default colour', () => {
    view({
      lines: [
        line('l1', 'p1', '100.0000', 'so-8', 'pm-tt'),
        line('l2', 'r1', '-30.0000', 'so-8', 'pm-tt'),
      ],
    } as any, '?tab=1')
    expect(screen.getByTestId('line-amount-l2')).toHaveStyle({ color: 'rgb(211, 47, 47)' })
    expect(screen.getByTestId('line-amount-l1')).not.toHaveStyle({ color: 'rgb(211, 47, 47)' })
  })

  it('renders "—" for a legacy line with no joined payment', () => {
    view({ lines: [legacyLine()] } as any, '?tab=1')
    const row = screen.getByTestId(/^line-amount-legacy-/).closest('tr')!
    expect(within(row).getAllByRole('cell').map((c) => c.textContent))
      .toEqual(['—', '—', '—', '—', 'RM 5.00'])
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
