import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import PurchaseOrderJournalEntriesTab from '../PurchaseOrderJournalEntriesTab'

const { mockGetJournalEntries } = vi.hoisted(() => ({
  mockGetJournalEntries: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/accountingApi')>()
  return { ...actual, useGetJournalEntriesQuery: mockGetJournalEntries }
})

function makeEntry(overrides = {}) {
  return {
    id: 'je1',
    referenceNumber: 'JE-501',
    entryDate: '2026-02-10',
    description: 'Purchase order PO-26-009',
    status: 'POSTED',
    isDraft: false,
    isPosted: true,
    isReversed: false,
    fiscalPeriodId: 'fp1',
    lines: [
      { id: 'l1', journalEntryId: 'je1', accountId: 'a1', debitAmount: 75, creditAmount: 0, createdAt: '2026-02-10', updatedAt: '2026-02-10' },
      { id: 'l2', journalEntryId: 'je1', accountId: 'a2', debitAmount: 0, creditAmount: 75, createdAt: '2026-02-10', updatedAt: '2026-02-10' },
    ],
    ...overrides,
  }
}

function renderTab(orderId: string) {
  const store = configureStore({ reducer: { accounting: (state = {}) => state } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <PurchaseOrderJournalEntriesTab orderId={orderId} />
      </MemoryRouter>
    </Provider>,
  )
}

describe('PurchaseOrderJournalEntriesTab', () => {
  it('shows loading state', () => {
    mockGetJournalEntries.mockReturnValue({ data: undefined, isLoading: true })
    renderTab('o1')
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('shows empty state when no entries', () => {
    mockGetJournalEntries.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false })
    renderTab('o1')
    expect(screen.getByText(/No journal entries/)).toBeInTheDocument()
  })

  it('renders entry number as a link with the purchase_order href', () => {
    mockGetJournalEntries.mockReturnValue({ data: { data: [makeEntry()], meta: { total: 1 } }, isLoading: false })
    renderTab('o1')
    const link = screen.getByRole('link', { name: 'JE-501' })
    expect(link).toHaveAttribute('href', '/accounting/journal-entries?sourceType=purchase_order&sourceId=o1')
  })

  it('renders description and debit/credit totals', () => {
    mockGetJournalEntries.mockReturnValue({ data: { data: [makeEntry()], meta: { total: 1 } }, isLoading: false })
    renderTab('o1')
    expect(screen.getByText('Purchase order PO-26-009')).toBeInTheDocument()
    expect(screen.getAllByText('RM 75.00').length).toBeGreaterThanOrEqual(2)
  })

  it('passes purchase_order sourceType and sourceId to query', () => {
    mockGetJournalEntries.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false })
    renderTab('order-77')
    expect(mockGetJournalEntries).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'purchase_order', sourceId: 'order-77' }),
    )
  })

  it('renders a gold-standard grey header (DataTable)', () => {
    mockGetJournalEntries.mockReturnValue({ data: { data: [makeEntry()], meta: { total: 1 } }, isLoading: false })
    const { container } = renderTab('o1')
    const headerCell = container.querySelector('.MuiTableCell-head')
    expect(headerCell).not.toBeNull()
    expect(headerCell).toHaveStyle({ backgroundColor: 'rgb(250, 250, 250)' })
  })
})
