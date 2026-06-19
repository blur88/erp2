import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import JournalEntriesTab from '../JournalEntriesTab'

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
    referenceNumber: 'JE-900',
    entryDate: '2026-03-01',
    description: 'Entry description',
    status: 'POSTED',
    isDraft: false,
    isPosted: true,
    isReversed: false,
    fiscalPeriodId: 'fp1',
    lines: [
      { id: 'l1', journalEntryId: 'je1', accountId: 'a1', debitAmount: 40, creditAmount: 0, createdAt: '2026-03-01', updatedAt: '2026-03-01' },
      { id: 'l2', journalEntryId: 'je1', accountId: 'a2', debitAmount: 0, creditAmount: 40, createdAt: '2026-03-01', updatedAt: '2026-03-01' },
    ],
    ...overrides,
  }
}

function renderTab(props: { sourceType: 'sales_order' | 'purchase_order'; orderId: string; emptyText: string }) {
  const store = configureStore({ reducer: { accounting: (state = {}) => state } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <JournalEntriesTab {...props} />
      </MemoryRouter>
    </Provider>,
  )
}

describe('JournalEntriesTab (shared)', () => {
  it('shows the provided empty text', () => {
    mockGetJournalEntries.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false })
    renderTab({ sourceType: 'sales_order', orderId: 'o1', emptyText: 'Nothing here' })
    expect(screen.getByText('Nothing here')).toBeInTheDocument()
  })

  it('queries with the given sourceType and orderId', () => {
    mockGetJournalEntries.mockReturnValue({ data: { data: [], meta: { total: 0 } }, isLoading: false })
    renderTab({ sourceType: 'purchase_order', orderId: 'po-9', emptyText: 'Nothing' })
    expect(mockGetJournalEntries).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: 'purchase_order', sourceId: 'po-9' }),
    )
  })

  it('links the entry number to the source-filtered journal-entries page', () => {
    mockGetJournalEntries.mockReturnValue({ data: { data: [makeEntry()], meta: { total: 1 } }, isLoading: false })
    renderTab({ sourceType: 'sales_order', orderId: 'o1', emptyText: 'Nothing' })
    const link = screen.getByRole('link', { name: 'JE-900' })
    expect(link).toHaveAttribute('href', '/accounting/journal-entries?sourceType=sales_order&sourceId=o1')
  })

  it('renders a gold-standard grey header (DataTable)', () => {
    mockGetJournalEntries.mockReturnValue({ data: { data: [makeEntry()], meta: { total: 1 } }, isLoading: false })
    const { container } = renderTab({ sourceType: 'sales_order', orderId: 'o1', emptyText: 'Nothing' })
    const headerCell = container.querySelector('.MuiTableCell-head')
    expect(headerCell).not.toBeNull()
    expect(headerCell).toHaveStyle({ backgroundColor: 'rgb(250, 250, 250)' })
  })
})
