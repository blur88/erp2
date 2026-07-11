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
      { accountCode: '1100', accountName: 'Cash', debit: '100.00', credit: '0.00' },
      { accountCode: '4000', accountName: 'Sales Revenue', debit: '0.00', credit: '100.00' },
    ],
    totalDebit: '100.00',
    totalCredit: '100.00',
    difference: '0.00',
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
      { accountCode: '1100', accountName: 'Cash', debit: '5000.00', credit: '0.00' },
      { accountCode: '3100', accountName: 'Opening Balance Equity', debit: '0.00', credit: '5000.00' },
    ],
    totalDebit: '5000.00',
    totalCredit: '5000.00',
    difference: '0.00',
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

  it('shows totals with Difference = "0.00"', () => {
    mockUseGetJournalEntryQuery.mockReturnValue({
      data: salesOrderEntry,
      isFetching: false,
      error: undefined,
    })
    renderPage()
    const zeroElements = screen.getAllByText('0.00')
    expect(zeroElements.length).toBeGreaterThanOrEqual(1)
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
