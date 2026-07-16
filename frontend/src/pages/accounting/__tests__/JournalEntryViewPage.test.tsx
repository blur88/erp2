import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const { salesOrderEntry, openingBalanceEntry, mockUseGetJournalEntryQuery } = vi.hoisted(() => {
  const salesEntry = {
    id: 'je-1',
    journalNo: 'JE-000001',
    status: 'Posted' as const,
    entryDate: '2026-07-01',
    sourceType: 'SALES_ORDER' as const,
    sourceDocumentId: 'so-1',
    sourceRef: 'SO-001',
    description: 'Sales order payment',
    createdBy: 'admin',
    createdAt: '2026-07-01T12:00:00Z',
    lines: [
      { accountCode: '1100', accountName: 'Cash', debit: '100.0000', credit: '0.0000' },
      { accountCode: '4000', accountName: 'Sales Revenue', debit: '0.0000', credit: '100.0000' },
    ],
    totalDebit: '100.0000',
    totalCredit: '100.0000',
    difference: '0.0000',
  }

  const openingEntry = {
    id: 'je-3',
    journalNo: 'JE-000003',
    status: 'Posted' as const,
    entryDate: '2026-06-30',
    sourceType: 'OPENING_BALANCE' as const,
    sourceDocumentId: null,
    sourceRef: null,
    description: 'Opening balance entry',
    createdBy: 'system',
    createdAt: '2026-06-30T00:00:00Z',
    lines: [
      { accountCode: '1100', accountName: 'Cash', debit: '5000.0000', credit: '0.0000' },
      { accountCode: '3100', accountName: 'Opening Balance Equity', debit: '0.0000', credit: '5000.0000' },
    ],
    totalDebit: '5000.0000',
    totalCredit: '5000.0000',
    difference: '0.0000',
  }

  return {
    salesOrderEntry: salesEntry,
    openingBalanceEntry: openingEntry,
    mockUseGetJournalEntryQuery: vi.fn(),
  }
})

vi.mock('@/store/api/accountingApi', () => ({
  useGetJournalEntryQuery: mockUseGetJournalEntryQuery,
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

import JournalEntryViewPage from '../JournalEntryViewPage'

function renderPage() {
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/accounting/journal-entries/je-1']}>
        <Routes>
          <Route path="/accounting/journal-entries/:id" element={<JournalEntryViewPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('JournalEntryViewPage', () => {
  beforeEach(() => {
    mockUseGetJournalEntryQuery.mockReset()
  })

  it('renders header with journalNo and status', () => {
    mockUseGetJournalEntryQuery.mockReturnValue({
      data: salesOrderEntry,
      isFetching: false,
      error: undefined,
    })
    renderPage()
    expect(screen.getByText(/JE-000001/)).toBeInTheDocument()
    expect(screen.getByText('Posted')).toBeInTheDocument()
  })

  it('formats line cells and totals as currency', () => {
    mockUseGetJournalEntryQuery.mockReturnValue({
      data: salesOrderEntry,
      isFetching: false,
      error: undefined,
    })
    renderPage()
    // Line table cell order: Account Code(0), Account Name(1), Debit(2), Credit(3)
    // Line 1 (Cash): debit 100 formatted, credit 0 → em-dash
    const line1 = screen.getByText('Cash').closest('tr')!.querySelectorAll('td')
    expect(line1[2]).toHaveTextContent('RM 100.00')
    expect(line1[2]).not.toHaveTextContent('100.0000')
    expect(line1[3]).toHaveTextContent('—')
    expect(line1[3]).not.toHaveTextContent('RM')
    // Line 2 (Sales Revenue): debit 0 → em-dash, credit 100 formatted
    const line2 = screen.getByText('Sales Revenue').closest('tr')!.querySelectorAll('td')
    expect(line2[2]).toHaveTextContent('—')
    expect(line2[2]).not.toHaveTextContent('RM')
    expect(line2[3]).toHaveTextContent('RM 100.00')
    // Totals section: assert all three summaries individually (labels are unique)
    expect(screen.getByText('Total Debit').closest('div')!).toHaveTextContent('RM 100.00')
    expect(screen.getByText('Total Credit').closest('div')!).toHaveTextContent('RM 100.00')
    // Difference is always shown (no zero-guard) → RM 0.00, not em-dash
    expect(screen.getByText('Difference').closest('div')!).toHaveTextContent('RM 0.00')
    expect(screen.queryByText('100.0000')).not.toBeInTheDocument()
    expect(screen.queryByText('0.0000')).not.toBeInTheDocument()
  })

  it('SALES_ORDER source shows clickable link', () => {
    mockUseGetJournalEntryQuery.mockReturnValue({
      data: salesOrderEntry,
      isFetching: false,
      error: undefined,
    })
    renderPage()
    const link = screen.getByRole('link', { name: /sales order/i })
    expect(link).toBeInTheDocument()
    expect(link).toHaveAttribute('href', '/sales/orders/so-1')
  })

  it('OPENING_BALANCE source shows plain text, no link', () => {
    mockUseGetJournalEntryQuery.mockReturnValue({
      data: openingBalanceEntry,
      isFetching: false,
      error: undefined,
    })
    renderPage()
    const obElements = screen.getAllByText(/opening balance/i)
    expect(obElements.length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})
