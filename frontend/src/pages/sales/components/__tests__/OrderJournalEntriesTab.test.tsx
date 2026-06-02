import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import OrderJournalEntriesTab from '../OrderJournalEntriesTab'

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
    referenceNumber: 'JE-001',
    entryDate: '2026-01-20',
    description: 'Sales order SO-26-001',
    status: 'POSTED',
    isDraft: false,
    isPosted: true,
    isReversed: false,
    fiscalPeriodId: 'fp1',
    lines: [
      { id: 'l1', journalEntryId: 'je1', accountId: 'a1', debitAmount: 100, creditAmount: 0, createdAt: '2026-01-20', updatedAt: '2026-01-20' },
      { id: 'l2', journalEntryId: 'je1', accountId: 'a2', debitAmount: 0, creditAmount: 100, createdAt: '2026-01-20', updatedAt: '2026-01-20' },
    ],
    ...overrides,
  }
}

function renderTab(orderId: string) {
  const store = configureStore({ reducer: { accounting: (state = {}) => state } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <OrderJournalEntriesTab orderId={orderId} />
      </MemoryRouter>
    </Provider>,
  )
}

describe('OrderJournalEntriesTab', () => {
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

  it('renders entry row with reference number', () => {
    mockGetJournalEntries.mockReturnValue({ data: { data: [makeEntry()], meta: { total: 1 } }, isLoading: false })
    renderTab('o1')
    expect(screen.getByText('JE-001')).toBeInTheDocument()
  })

  it('renders entry number as a link', () => {
    mockGetJournalEntries.mockReturnValue({ data: { data: [makeEntry()], meta: { total: 1 } }, isLoading: false })
    renderTab('o1')
    const link = screen.getByRole('link', { name: 'JE-001' })
    expect(link).toHaveAttribute('href', '/accounting/journal-entries?sourceType=sales_order&sourceId=o1')
  })

  it('renders description', () => {
    mockGetJournalEntries.mockReturnValue({ data: { data: [makeEntry()], meta: { total: 1 } }, isLoading: false })
    renderTab('o1')
    expect(screen.getByText('Sales order SO-26-001')).toBeInTheDocument()
  })

  it('passes correct sourceType and sourceId to query', () => {
    mockGetJournalEntries.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false })
    renderTab('order-99')
    expect(mockGetJournalEntries).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'sales_order', sourceId: 'order-99' }),
    )
  })
})
