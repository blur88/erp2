import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { formatDate, formatDateTime } from '@/utils/formatters'

const {
  salesOrderEntry,
  openingBalanceEntry,
  emptyLinesEntry,
  zeroFormatsEntry,
  mockUseGetJournalEntryQuery,
} = vi.hoisted(() => {
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

  const emptyEntry = {
    ...salesEntry,
    id: 'je-empty',
    journalNo: 'JE-000099',
    lines: [] as { accountCode: string; accountName: string; debit: string; credit: string }[],
    totalDebit: '0.0000',
    totalCredit: '0.0000',
  }

  // Exercises lineCell's numeric zero-check across formats + a non-numeric guard.
  const zeroFormatsEntry = {
    ...salesEntry,
    id: 'je-zeros',
    journalNo: 'JE-000100',
    lines: [
      { accountCode: '1000', accountName: 'Bare Zero', debit: '0', credit: '50.0000' },
      { accountCode: '1001', accountName: 'Two DP Zero', debit: '0.00', credit: '50.0000' },
      { accountCode: '1002', accountName: 'Bad Value', debit: 'abc', credit: '50.0000' },
    ],
  }

  return {
    salesOrderEntry: salesEntry,
    openingBalanceEntry: openingEntry,
    emptyLinesEntry: emptyEntry,
    zeroFormatsEntry,
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

  it('renders header and Summary card status (both placements)', () => {
    mockUseGetJournalEntryQuery.mockReturnValue({
      data: salesOrderEntry,
      isFetching: false,
      error: undefined,
    })
    renderPage()
    expect(screen.getByText(/JE-000001/)).toBeInTheDocument()
    // Status appears in the header badge AND the Summary card.
    expect(screen.getAllByText('Posted')).toHaveLength(2)
  })

  it('formats entry and creation dates', () => {
    mockUseGetJournalEntryQuery.mockReturnValue({
      data: salesOrderEntry,
      isFetching: false,
      error: undefined,
    })
    renderPage()
    // Raw ISO strings must not be shown verbatim.
    expect(screen.queryByText('2026-07-01')).not.toBeInTheDocument()
    expect(screen.queryByText('2026-07-01T12:00:00Z')).not.toBeInTheDocument()
    // Formatted values are present.
    expect(screen.getByText(formatDate('2026-07-01'))).toBeInTheDocument()
    expect(screen.getByText(formatDateTime('2026-07-01T12:00:00Z'))).toBeInTheDocument()
  })

  it('formats line cells as currency with em-dash for zero', () => {
    mockUseGetJournalEntryQuery.mockReturnValue({
      data: salesOrderEntry,
      isFetching: false,
      error: undefined,
    })
    renderPage()
    // DataTable renders a native table: Account Code(0), Name(1), Debit(2), Credit(3)
    const line1 = screen.getByText('Cash').closest('tr')!.querySelectorAll('td')
    expect(line1[2]).toHaveTextContent('RM 100.00')
    expect(line1[2]).not.toHaveTextContent('100.0000')
    expect(line1[3]).toHaveTextContent('—')
    expect(line1[3]).not.toHaveTextContent('RM')
    const line2 = screen.getByText('Sales Revenue').closest('tr')!.querySelectorAll('td')
    expect(line2[2]).toHaveTextContent('—')
    expect(line2[2]).not.toHaveTextContent('RM')
    expect(line2[3]).toHaveTextContent('RM 100.00')
    expect(screen.queryByText('100.0000')).not.toBeInTheDocument()
    expect(screen.queryByText('0.0000')).not.toBeInTheDocument()
  })

  it('treats alternate zero formats and non-numeric values as em-dash', () => {
    mockUseGetJournalEntryQuery.mockReturnValue({
      data: zeroFormatsEntry,
      isFetching: false,
      error: undefined,
    })
    renderPage()
    // Debit column (index 2) for each row; all three are zero/invalid → em-dash, never RM.
    const bare = screen.getByText('Bare Zero').closest('tr')!.querySelectorAll('td')
    expect(bare[2]).toHaveTextContent('—')
    expect(bare[2]).not.toHaveTextContent('RM')
    const twoDp = screen.getByText('Two DP Zero').closest('tr')!.querySelectorAll('td')
    expect(twoDp[2]).toHaveTextContent('—')
    expect(twoDp[2]).not.toHaveTextContent('RM')
    const bad = screen.getByText('Bad Value').closest('tr')!.querySelectorAll('td')
    expect(bad[2]).toHaveTextContent('—')
    expect(bad[2]).not.toHaveTextContent('NaN')
  })

  it('renders a spinner while fetching', () => {
    mockUseGetJournalEntryQuery.mockReturnValue({
      data: undefined,
      isFetching: true,
      error: undefined,
    })
    renderPage()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders an error message when the query fails', () => {
    mockUseGetJournalEntryQuery.mockReturnValue({
      data: undefined,
      isFetching: false,
      error: { status: 500 },
    })
    renderPage()
    expect(screen.getByText('Failed to load journal entry.')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
  })

  it('shows totals with formatted values in both the Summary card and the footer', () => {
    mockUseGetJournalEntryQuery.mockReturnValue({
      data: salesOrderEntry,
      isFetching: false,
      error: undefined,
    })
    renderPage()
    // Each total label appears once in the Summary card and once in the footer,
    // and each occurrence's row/field must show the formatted amount.
    const assertBoth = (label: string, formatted: string) => {
      const labels = screen.getAllByText(label)
      expect(labels).toHaveLength(2)
      labels.forEach((el) => {
        // Sibling value: Field caption+value share a parent Box; footer label+value
        // share a flex Box. The nearest common wrapper contains the amount.
        expect(el.parentElement!).toHaveTextContent(formatted)
      })
    }
    assertBoth('Total Debit', 'RM 100.00')
    assertBoth('Total Credit', 'RM 100.00')
    assertBoth('Difference', 'RM 0.00')
  })

  it('renders empty-lines message when there are no lines', () => {
    mockUseGetJournalEntryQuery.mockReturnValue({
      data: emptyLinesEntry,
      isFetching: false,
      error: undefined,
    })
    renderPage()
    expect(screen.getByText('No lines on this journal entry.')).toBeInTheDocument()
  })

  it('SALES_ORDER source shows the reference number as a clickable link with type description', () => {
    mockUseGetJournalEntryQuery.mockReturnValue({
      data: salesOrderEntry,
      isFetching: false,
      error: undefined,
    })
    renderPage()
    const link = screen.getByRole('link', { name: 'SO-001' })
    expect(link).toHaveAttribute('href', '/sales/orders/SO-001/view')
    expect(link).toHaveAccessibleDescription('Sales Order')
  })

  it('labels the source row "Source" (not "Source Type") and omits a separate Source Reference field', () => {
    mockUseGetJournalEntryQuery.mockReturnValue({
      data: salesOrderEntry,
      isFetching: false,
      error: undefined,
    })
    renderPage()
    expect(screen.getByText('Source')).toBeInTheDocument()
    expect(screen.queryByText('Source Type')).not.toBeInTheDocument()
    expect(screen.queryByText('Source Reference')).not.toBeInTheDocument()
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
