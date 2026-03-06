import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

import JournalEntryDetailsPage from './JournalEntryDetailsPage'
import { JournalEntryStatus } from '@/types'

const mockedApi = vi.hoisted(() => ({
  useGetJournalEntryQuery: vi.fn(),
  usePostJournalEntryMutation: vi.fn(),
  useReverseJournalEntryMutation: vi.fn(),
  useDeleteJournalEntryMutation: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetJournalEntryQuery: mockedApi.useGetJournalEntryQuery,
  usePostJournalEntryMutation: mockedApi.usePostJournalEntryMutation,
  useReverseJournalEntryMutation: mockedApi.useReverseJournalEntryMutation,
  useDeleteJournalEntryMutation: mockedApi.useDeleteJournalEntryMutation,
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

const mockEntry = {
  id: 'entry-1',
  entryDate: '2026-01-15',
  referenceNumber: 'JE-2026-001',
  description: 'Test journal entry',
  status: JournalEntryStatus.DRAFT,
  fiscalPeriodId: 'period-1',
  fiscalPeriod: {
    id: 'period-1',
    code: '2026-01',
    name: 'January 2026',
    status: 'OPEN',
  },
  isDraft: true,
  isPosted: false,
  isReversed: false,
  totalDebits: 1000.0,
  totalCredits: 1000.0,
  isBalanced: true,
  lines: [
    {
      id: 'line-1',
      journalEntryId: 'entry-1',
      accountId: 'account-1',
      account: {
        id: 'account-1',
        code: '1010',
        name: 'Cash',
        type: 'ASSET' as any,
      },
      debitAmount: 1000.0,
      creditAmount: 0.0,
      memo: 'Debit memo',
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-15T10:00:00Z',
    },
    {
      id: 'line-2',
      journalEntryId: 'entry-1',
      accountId: 'account-2',
      account: {
        id: 'account-2',
        code: '2010',
        name: 'Accounts Payable',
        type: 'LIABILITY' as any,
      },
      debitAmount: 0.0,
      creditAmount: 1000.0,
      memo: 'Credit memo',
      createdAt: '2026-01-15T10:00:00Z',
      updatedAt: '2026-01-15T10:00:00Z',
    },
  ],
  createdAt: '2026-01-15T10:00:00Z',
  updatedAt: '2026-01-15T10:00:00Z',
}

const renderWithRouter = (route = '/accounting/journal-entries/entry-1') =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/accounting/journal-entries/:id" element={<JournalEntryDetailsPage />} />
      </Routes>
    </MemoryRouter>
  )

describe('JournalEntryDetailsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetJournalEntryQuery.mockReturnValue({
      data: mockEntry,
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })
    mockedApi.usePostJournalEntryMutation.mockReturnValue([vi.fn()])
    mockedApi.useReverseJournalEntryMutation.mockReturnValue([vi.fn()])
    mockedApi.useDeleteJournalEntryMutation.mockReturnValue([vi.fn()])
  })

  it('renders loading state', () => {
    mockedApi.useGetJournalEntryQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithRouter()

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders entry not found message when entry is null', async () => {
    mockedApi.useGetJournalEntryQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Journal entry not found')).toBeInTheDocument()
    })
    expect(screen.getByText('Back to List')).toBeInTheDocument()
  })

  it('renders entry details correctly', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Journal Entry Details')).toBeInTheDocument()
    })

    expect(screen.getAllByText('JE-2026-001').length).toBeGreaterThan(0)
    expect(screen.getByText('Test journal entry')).toBeInTheDocument()
    expect(screen.getByText('2026-01 - January 2026')).toBeInTheDocument()
    expect(screen.getByText(JournalEntryStatus.DRAFT)).toBeInTheDocument()
    expect(screen.getByText('Entry is Balanced')).toBeInTheDocument()
    expect(screen.getByText('1010 - Cash')).toBeInTheDocument()
    expect(screen.getByText('2010 - Accounts Payable')).toBeInTheDocument()
    expect(screen.getByText('Debit memo')).toBeInTheDocument()
    expect(screen.getByText('Credit memo')).toBeInTheDocument()
  })

  it('displays unbalanced warning for unbalanced entry', async () => {
    mockedApi.useGetJournalEntryQuery.mockReturnValue({
      data: { ...mockEntry, totalDebits: 1000, totalCredits: 900, isBalanced: false },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText(/Entry is Unbalanced/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Difference/)).toBeInTheDocument()
  })

  it('shows draft actions for draft entry', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument()
    })
    expect(screen.getByText('Post')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('shows reverse action for posted entry', () => {
    mockedApi.useGetJournalEntryQuery.mockReturnValue({
      data: { ...mockEntry, status: JournalEntryStatus.POSTED, isDraft: false, isPosted: true },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithRouter()

    expect(screen.getByText('Reverse')).toBeInTheDocument()
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
    expect(screen.queryByText('Post')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })

  it('disables post button for unbalanced entry', () => {
    mockedApi.useGetJournalEntryQuery.mockReturnValue({
      data: { ...mockEntry, totalDebits: 1000, totalCredits: 900, isBalanced: false },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithRouter()

    expect(screen.getByText('Post').closest('button')).toBeDisabled()
  })

  it('opens post confirmation dialog when post button is clicked', async () => {
    renderWithRouter()

    fireEvent.click(screen.getByText('Post'))

    await waitFor(() => {
      expect(screen.getByText('Post Journal Entry')).toBeInTheDocument()
      expect(screen.getByText(/Once posted, the entry cannot be edited/)).toBeInTheDocument()
    })
  })

  it('opens delete confirmation dialog when delete button is clicked', async () => {
    renderWithRouter()

    fireEvent.click(screen.getByText('Delete'))

    await waitFor(() => {
      expect(screen.getByText('Delete Journal Entry')).toBeInTheDocument()
      expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument()
    })
  })

  it('opens reverse confirmation dialog when reverse button is clicked', async () => {
    mockedApi.useGetJournalEntryQuery.mockReturnValue({
      data: { ...mockEntry, status: JournalEntryStatus.POSTED, isDraft: false, isPosted: true },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithRouter()

    fireEvent.click(screen.getByText('Reverse'))

    await waitFor(() => {
      expect(screen.getByText('Reverse Journal Entry')).toBeInTheDocument()
      expect(screen.getByText(/create a reversing journal entry/)).toBeInTheDocument()
    })
  })

  it('displays reversal relationship information', () => {
    mockedApi.useGetJournalEntryQuery.mockReturnValue({
      data: {
        ...mockEntry,
        status: JournalEntryStatus.REVERSED,
        isReversed: true,
        reversedBy: { id: 'entry-2', referenceNumber: 'JE-2026-002' },
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithRouter()

    expect(screen.getByText('Reversed By')).toBeInTheDocument()
    expect(screen.getByText('JE-2026-002')).toBeInTheDocument()
  })

  it('displays totals row correctly', async () => {
    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('TOTALS')).toBeInTheDocument()
    })
  })

  it('renders component when error exists with cached data', async () => {
    mockedApi.useGetJournalEntryQuery.mockReturnValue({
      data: mockEntry,
      isLoading: false,
      error: { data: 'Failed to load journal entry' },
      refetch: vi.fn(),
    })

    renderWithRouter()

    await waitFor(() => {
      expect(screen.getByText('Journal Entry Details')).toBeInTheDocument()
    })
  })
})
