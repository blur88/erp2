import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import JournalEntriesPage from '../JournalEntriesPage'
import journalEntriesReducer from '@/store/slices/journalEntriesSlice'
import { JournalEntryStatus } from '@/types'
import { ApiService } from '@/services/api'

// Mock ApiService
vi.mock('@/services/api', () => ({
  ApiService: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

// Mock navigation
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

// Mock notification hook
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

// Mock formatters
vi.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `$${value.toFixed(2)}`,
  formatDate: (date: string | Date) => new Date(date).toLocaleDateString(),
}))

// Sample journal entries
const mockJournalEntries = [
  {
    id: '1',
    referenceNumber: 'JE-2026-001',
    entryDate: '2026-01-15',
    description: 'Opening balance entry',
    status: JournalEntryStatus.POSTED,
    totalDebits: 10000,
    totalCredits: 10000,
    isBalanced: true,
    isDraft: false,
    isPosted: true,
    isReversed: false,
    fiscalPeriodId: 'fp1',
    createdAt: '2026-01-15',
    updatedAt: '2026-01-15',
  },
  {
    id: '2',
    referenceNumber: 'JE-2026-002',
    entryDate: '2026-01-20',
    description: 'Expense adjustment',
    status: JournalEntryStatus.DRAFT,
    totalDebits: 5000,
    totalCredits: 5000,
    isBalanced: true,
    isDraft: true,
    isPosted: false,
    isReversed: false,
    fiscalPeriodId: 'fp1',
    createdAt: '2026-01-20',
    updatedAt: '2026-01-20',
  },
  {
    id: '3',
    referenceNumber: 'JE-2026-003',
    entryDate: '2026-01-25',
    description: 'Reversed entry for correction',
    status: JournalEntryStatus.REVERSED,
    totalDebits: 3000,
    totalCredits: 3000,
    isBalanced: true,
    isDraft: false,
    isPosted: false,
    isReversed: true,
    fiscalPeriodId: 'fp1',
    createdAt: '2026-01-25',
    updatedAt: '2026-01-25',
  },
]

const createMockStore = () => {
  return configureStore({
    reducer: {
      journalEntries: journalEntriesReducer,
    },
  })
}

const renderWithProviders = () => {
  const store = createMockStore()
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <JournalEntriesPage />
      </BrowserRouter>
    </Provider>
  )
}

describe('JournalEntriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()

    // Mock successful API response by default
    ;(ApiService.get as any).mockResolvedValue({
      data: mockJournalEntries,
      meta: {
        page: 1,
        limit: 50,
        total: 3,
        totalPages: 1,
      },
    })
  })

  it('renders the page with journal entries', async () => {
    renderWithProviders()

    expect(screen.getByText('Journal Entries')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('JE-2026-001')).toBeInTheDocument()
      expect(screen.getByText('JE-2026-002')).toBeInTheDocument()
      expect(screen.getByText('JE-2026-003')).toBeInTheDocument()
    })
  })

  it('displays status badges with correct colors', async () => {
    renderWithProviders()

    await waitFor(() => {
      expect(screen.getByText('POSTED')).toBeInTheDocument()
      expect(screen.getByText('DRAFT')).toBeInTheDocument()
      expect(screen.getByText('REVERSED')).toBeInTheDocument()
    })
  })

  it('shows empty state when no entries', async () => {
    ;(ApiService.get as any).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
    })

    renderWithProviders()

    await waitFor(() => {
      expect(screen.getByText('No journal entries found')).toBeInTheDocument()
    })
  })

  it('navigates to create page when clicking New Journal Entry button', () => {
    renderWithProviders()

    const createButton = screen.getByText('New Journal Entry')
    fireEvent.click(createButton)

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/journal-entries/new')
  })

  it('navigates to details page when clicking a row', async () => {
    renderWithProviders()

    await waitFor(() => {
      expect(screen.getByText('JE-2026-001')).toBeInTheDocument()
    })

    const firstRow = screen.getByText('JE-2026-001').closest('tr')
    if (firstRow) {
      fireEvent.click(firstRow)
    }

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/journal-entries/1')
  })

  it('filters entries by search term', () => {
    renderWithProviders()

    const searchInput = screen.getByPlaceholderText('Search by reference or description...')
    fireEvent.change(searchInput, { target: { value: 'JE-2026-001' } })

    expect(searchInput).toHaveValue('JE-2026-001')
  })

  it('filters entries by date range', () => {
    renderWithProviders()

    const startDateInput = screen.getByLabelText('Start Date')
    const endDateInput = screen.getByLabelText('End Date')

    fireEvent.change(startDateInput, { target: { value: '2026-01-01' } })
    fireEvent.change(endDateInput, { target: { value: '2026-01-31' } })

    expect(startDateInput).toHaveValue('2026-01-01')
    expect(endDateInput).toHaveValue('2026-01-31')
  })

  it('displays pagination information', async () => {
    renderWithProviders()

    await waitFor(() => {
      expect(screen.getByText('Showing 3 of 3 entries')).toBeInTheDocument()
    })
  })

  it('shows bulk action buttons when a draft entry is selected', async () => {
    renderWithProviders()

    await waitFor(() => {
      expect(screen.getByText('JE-2026-002')).toBeInTheDocument()
    })

    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[2])

    await waitFor(() => {
      expect(screen.getByText('Post Selected (1)')).toBeInTheDocument()
      expect(screen.getByText('Delete Selected (1)')).toBeInTheDocument()
    })
  })
})
