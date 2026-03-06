import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import JournalEntriesPage from '../JournalEntriesPage'
import { JournalEntryStatus } from '@/types'

const mockedApi = vi.hoisted(() => ({
  useGetJournalEntriesQuery: vi.fn(),
  useDeleteJournalEntryMutation: vi.fn(),
  usePostJournalEntryMutation: vi.fn(),
  useBulkPostJournalEntriesMutation: vi.fn(),
  useBulkDeleteJournalEntriesMutation: vi.fn(),
}))

const mockNavigate = vi.fn()
const mockLocation = { search: '', pathname: '/accounting/journal-entries' }

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
  }
})

vi.mock('@/store/api/accountingApi', () => ({
  useGetJournalEntriesQuery: mockedApi.useGetJournalEntriesQuery,
  useDeleteJournalEntryMutation: mockedApi.useDeleteJournalEntryMutation,
  usePostJournalEntryMutation: mockedApi.usePostJournalEntryMutation,
  useBulkPostJournalEntriesMutation: mockedApi.useBulkPostJournalEntriesMutation,
  useBulkDeleteJournalEntriesMutation: mockedApi.useBulkDeleteJournalEntriesMutation,
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/components/accounting/AccountMappingWarning', () => ({
  default: () => null,
}))

vi.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `$${value.toFixed(2)}`,
  formatDate: (date: string | Date) => new Date(date).toLocaleDateString(),
}))

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

const renderWithProviders = () =>
  render(
    <BrowserRouter>
      <JournalEntriesPage />
    </BrowserRouter>
  )

describe('JournalEntriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    mockLocation.search = ''
    mockedApi.useGetJournalEntriesQuery.mockReturnValue({
      data: {
        data: mockJournalEntries,
        meta: { page: 1, limit: 50, total: 3, totalPages: 1 },
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })
    mockedApi.useDeleteJournalEntryMutation.mockReturnValue([vi.fn()])
    mockedApi.usePostJournalEntryMutation.mockReturnValue([vi.fn()])
    mockedApi.useBulkPostJournalEntriesMutation.mockReturnValue([vi.fn()])
    mockedApi.useBulkDeleteJournalEntriesMutation.mockReturnValue([vi.fn()])
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
    mockedApi.useGetJournalEntriesQuery.mockReturnValue({
      data: { data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 0 } },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithProviders()

    await waitFor(() => {
      expect(screen.getByText('No journal entries found')).toBeInTheDocument()
    })
  })

  it('navigates to create page when clicking New Journal Entry button', () => {
    renderWithProviders()

    fireEvent.click(screen.getByText('New Journal Entry'))

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/journal-entries/new')
  })

  it('navigates to details page when clicking a row', async () => {
    renderWithProviders()

    const firstRow = await screen.findByText('JE-2026-001')
    fireEvent.click(firstRow.closest('tr') as HTMLElement)

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
      expect(screen.getByText('Manage and post accounting journal entries (3 total)')).toBeInTheDocument()
    })
  })

  it('shows bulk action buttons when a draft entry is selected', async () => {
    renderWithProviders()

    await waitFor(() => {
      expect(screen.getByText('JE-2026-002')).toBeInTheDocument()
    })

    fireEvent.click(screen.getAllByRole('checkbox')[2])

    await waitFor(() => {
      expect(screen.getByText('Post Selected (1)')).toBeInTheDocument()
      expect(screen.getByText('Delete Selected (1)')).toBeInTheDocument()
    })
  })
})
