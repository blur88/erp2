import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import JournalEntriesPage from './JournalEntriesPage'
import { JournalEntryStatus } from '@/types'

const mockedApi = vi.hoisted(() => ({
  useGetJournalEntriesQuery: vi.fn(),
  useDeleteJournalEntryMutation: vi.fn(),
  usePostJournalEntryMutation: vi.fn(),
  useBulkPostJournalEntriesMutation: vi.fn(),
  useBulkDeleteJournalEntriesMutation: vi.fn(),
  useReverseJournalEntryMutation: vi.fn(),
}))

const mockNavigate = vi.fn()
const mockLocation = { search: '', pathname: '/accounting/journal-entries' }

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
    BrowserRouter: ({ children }: any) => <div>{children}</div>,
  }
})

vi.mock('@/store/api/accountingApi', () => mockedApi)

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/components/accounting/AccountMappingWarning', () => ({
  default: () => null,
}))

vi.mock('@/utils/dateRange', () => ({
  getPeriodDateRange: () => ({ from: undefined, to: undefined }),
  getStartOfWeek: () => 0,
}))

vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return {
    ...actual,
    formatCurrency: (value: number) => `$${value.toFixed(2)}`,
    formatDate: (date: string | Date) => String(date),
    getCurrentDate: () => '2026-04-19',
  }
})

const mockJournalEntries = [
  {
    id: '1',
    referenceNumber: 'JE-001',
    entryDate: '2024-01-15',
    description: 'Manual journal entry',
    sourceType: undefined,
    sourceId: undefined,
    status: JournalEntryStatus.DRAFT,
    totalDebits: 1000,
    totalCredits: 1000,
    isBalanced: true,
    isDraft: true,
    isPosted: false,
    isReversed: false,
    fiscalPeriodId: 'fp1',
    lines: [],
    createdAt: '2024-01-15',
    updatedAt: '2024-01-15',
  },
]

const renderPage = () =>
  render(
    <BrowserRouter>
      <JournalEntriesPage />
    </BrowserRouter>,
  )

describe('JournalEntriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
    mockedApi.useGetJournalEntriesQuery.mockReturnValue({
      data: {
        data: mockJournalEntries,
        meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
      },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useDeleteJournalEntryMutation.mockReturnValue([vi.fn()])
    mockedApi.usePostJournalEntryMutation.mockReturnValue([vi.fn()])
    mockedApi.useBulkPostJournalEntriesMutation.mockReturnValue([vi.fn()])
    mockedApi.useBulkDeleteJournalEntriesMutation.mockReturnValue([vi.fn()])
    mockedApi.useReverseJournalEntryMutation.mockReturnValue([vi.fn()])
  })

  it('renders entry type chips', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Manual Entry')).toBeInTheDocument()
    })
  })

  it('shows workspace placeholder before a selection', () => {
    renderPage()
    expect(screen.getByText('Select a journal entry to view details')).toBeInTheDocument()
  })

  it('selects an entry in the workspace without navigating', async () => {
    renderPage()

    fireEvent.click(screen.getByText('JE-001'))

    await waitFor(() => {
      expect(screen.getAllByText('JE-001').length).toBeGreaterThan(1)
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
