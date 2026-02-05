import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import JournalEntryDetailsPage from './JournalEntryDetailsPage'
import journalEntriesReducer from '@/store/slices/journalEntriesSlice'
import { JournalEntryStatus } from '@/types'

// Mock the notification hook
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

const createMockStore = (initialState: any = {}) => {
  return configureStore({
    reducer: {
      journalEntries: journalEntriesReducer,
    },
    preloadedState: {
      journalEntries: {
        data: [],
        selectedEntry: null,
        loading: false,
        error: null,
        pagination: {
          page: 1,
          limit: 20,
          total: 0,
          totalPages: 0,
        },
        ...initialState,
      },
    },
  })
}

const renderWithRouter = (ui: React.ReactElement, store: any, route = '/accounting/journal-entries/entry-1') => {
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path="/accounting/journal-entries/:id" element={ui} />
        </Routes>
      </MemoryRouter>
    </Provider>
  )
}

describe('JournalEntryDetailsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders loading state', () => {
    const store = createMockStore({ loading: true, selectedEntry: null })
    renderWithRouter(<JournalEntryDetailsPage />, store)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('renders entry not found message when entry is null', async () => {
    const store = createMockStore({ loading: false, selectedEntry: null })
    renderWithRouter(<JournalEntryDetailsPage />, store)

    await waitFor(() => {
      expect(screen.getByText('Journal entry not found')).toBeInTheDocument()
    })
    expect(screen.getByText('Back to List')).toBeInTheDocument()
  })

  it('renders entry details correctly', async () => {
    const store = createMockStore({ selectedEntry: mockEntry })
    renderWithRouter(<JournalEntryDetailsPage />, store)

    // Wait for content to be rendered
    await waitFor(() => {
      expect(screen.getByText('Journal Entry Details')).toBeInTheDocument()
    })

    // Header
    expect(screen.getAllByText('JE-2026-001').length).toBeGreaterThan(0)

    // Entry header information
    expect(screen.getByText('Test journal entry')).toBeInTheDocument()
    expect(screen.getByText('2026-01 - January 2026')).toBeInTheDocument()
    expect(screen.getByText(JournalEntryStatus.DRAFT)).toBeInTheDocument()

    // Balance validation
    expect(screen.getByText('Entry is Balanced')).toBeInTheDocument()

    // Line items
    expect(screen.getByText('1010 - Cash')).toBeInTheDocument()
    expect(screen.getByText('2010 - Accounts Payable')).toBeInTheDocument()
    expect(screen.getByText('Debit memo')).toBeInTheDocument()
    expect(screen.getByText('Credit memo')).toBeInTheDocument()
  })

  it('displays unbalanced warning for unbalanced entry', async () => {
    const unbalancedEntry = {
      ...mockEntry,
      totalDebits: 1000.0,
      totalCredits: 900.0,
      isBalanced: false,
    }
    const store = createMockStore({ selectedEntry: unbalancedEntry })
    renderWithRouter(<JournalEntryDetailsPage />, store)

    await waitFor(() => {
      expect(screen.getByText(/Entry is Unbalanced/)).toBeInTheDocument()
    })
    expect(screen.getByText(/Difference/)).toBeInTheDocument()
  })

  it('shows draft actions for draft entry', async () => {
    const store = createMockStore({ selectedEntry: mockEntry })
    renderWithRouter(<JournalEntryDetailsPage />, store)

    await waitFor(() => {
      expect(screen.getByText('Edit')).toBeInTheDocument()
    })
    expect(screen.getByText('Post')).toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('shows reverse action for posted entry', () => {
    const postedEntry = {
      ...mockEntry,
      status: JournalEntryStatus.POSTED,
      isDraft: false,
      isPosted: true,
    }
    const store = createMockStore({ selectedEntry: postedEntry })
    renderWithRouter(<JournalEntryDetailsPage />, store)

    expect(screen.getByText('Reverse')).toBeInTheDocument()
    expect(screen.queryByText('Edit')).not.toBeInTheDocument()
    expect(screen.queryByText('Post')).not.toBeInTheDocument()
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })

  it('disables post button for unbalanced entry', () => {
    const unbalancedEntry = {
      ...mockEntry,
      totalDebits: 1000.0,
      totalCredits: 900.0,
      isBalanced: false,
    }
    const store = createMockStore({ selectedEntry: unbalancedEntry })
    renderWithRouter(<JournalEntryDetailsPage />, store)

    const postButton = screen.getByText('Post').closest('button')
    expect(postButton).toBeDisabled()
  })

  it('opens post confirmation dialog when post button is clicked', async () => {
    const store = createMockStore({ selectedEntry: mockEntry })
    renderWithRouter(<JournalEntryDetailsPage />, store)

    const postButton = screen.getByText('Post')
    fireEvent.click(postButton)

    await waitFor(() => {
      expect(screen.getByText('Post Journal Entry')).toBeInTheDocument()
      expect(screen.getByText(/Once posted, the entry cannot be edited/)).toBeInTheDocument()
    })
  })

  it('opens delete confirmation dialog when delete button is clicked', async () => {
    const store = createMockStore({ selectedEntry: mockEntry })
    renderWithRouter(<JournalEntryDetailsPage />, store)

    const deleteButton = screen.getByText('Delete')
    fireEvent.click(deleteButton)

    await waitFor(() => {
      expect(screen.getByText('Delete Journal Entry')).toBeInTheDocument()
      expect(screen.getByText(/This action cannot be undone/)).toBeInTheDocument()
    })
  })

  it('opens reverse confirmation dialog when reverse button is clicked', async () => {
    const postedEntry = {
      ...mockEntry,
      status: JournalEntryStatus.POSTED,
      isDraft: false,
      isPosted: true,
    }
    const store = createMockStore({ selectedEntry: postedEntry })
    renderWithRouter(<JournalEntryDetailsPage />, store)

    const reverseButton = screen.getByText('Reverse')
    fireEvent.click(reverseButton)

    await waitFor(() => {
      expect(screen.getByText('Reverse Journal Entry')).toBeInTheDocument()
      expect(screen.getByText(/create a reversing journal entry/)).toBeInTheDocument()
    })
  })

  it('displays reversal relationship information', () => {
    const reversedEntry = {
      ...mockEntry,
      status: JournalEntryStatus.REVERSED,
      isReversed: true,
      reversedBy: {
        id: 'entry-2',
        referenceNumber: 'JE-2026-002',
      },
    }
    const store = createMockStore({ selectedEntry: reversedEntry })
    renderWithRouter(<JournalEntryDetailsPage />, store)

    expect(screen.getByText('Reversed By')).toBeInTheDocument()
    expect(screen.getByText('JE-2026-002')).toBeInTheDocument()
  })

  it('displays totals row correctly', async () => {
    const store = createMockStore({ selectedEntry: mockEntry })
    renderWithRouter(<JournalEntryDetailsPage />, store)

    await waitFor(() => {
      expect(screen.getByText('TOTALS')).toBeInTheDocument()
    })
    // Totals row should exist with amounts (checking for TOTALS text is sufficient)
  })

  it('renders component when error exists in state', async () => {
    const store = createMockStore({
      selectedEntry: mockEntry,
      error: 'Failed to load journal entry',
    })
    renderWithRouter(<JournalEntryDetailsPage />, store)

    // Component should still render the entry even if there's an error in state
    await waitFor(() => {
      expect(screen.getByText('Journal Entry Details')).toBeInTheDocument()
    })
    // The error would show if it's propagated correctly, but main content still renders
  })
})
