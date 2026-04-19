import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import JournalEntriesPage from '../JournalEntriesPage'
import { JournalEntryStatus } from '@/types'

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))
vi.mock('@/components/accounting/AccountMappingWarning', () => ({ default: () => null }))
vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return {
    ...actual,
    formatCurrency: (value: number) => `$${value}`,
    formatDate: (date: string) => date,
    getCurrentDate: () => '2026-04-19',
  }
})
vi.mock('@/utils/dateRange', () => ({
  getPeriodDateRange: () => ({ from: undefined, to: undefined }),
  getStartOfWeek: () => 0,
}))

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
  }
})

vi.mock('@/store/api/accountingApi', () => mockedApi)

const mockEntry = {
  id: '1',
  referenceNumber: 'JE-001',
  entryDate: '2026-01-01',
  description: 'Test',
  status: JournalEntryStatus.POSTED,
  totalDebits: 100,
  totalCredits: 100,
  isBalanced: true,
  isDraft: false,
  isPosted: true,
  isReversed: false,
  fiscalPeriodId: 'fp1',
  lines: [],
  createdAt: '2026-01-01',
  updatedAt: '2026-01-01',
}

describe('JournalEntriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetJournalEntriesQuery.mockReturnValue({
      data: { data: [mockEntry], meta: { total: 1 } },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useDeleteJournalEntryMutation.mockReturnValue([vi.fn()])
    mockedApi.usePostJournalEntryMutation.mockReturnValue([vi.fn()])
    mockedApi.useBulkPostJournalEntriesMutation.mockReturnValue([vi.fn()])
    mockedApi.useBulkDeleteJournalEntriesMutation.mockReturnValue([vi.fn()])
    mockedApi.useReverseJournalEntryMutation.mockReturnValue([vi.fn()])
  })

  it('renders the page title', () => {
    render(<BrowserRouter><JournalEntriesPage /></BrowserRouter>)
    expect(screen.getByText('Journal Entries')).toBeInTheDocument()
  })

  it('renders journal entry rows', () => {
    render(<BrowserRouter><JournalEntriesPage /></BrowserRouter>)
    expect(screen.getByText('JE-001')).toBeInTheDocument()
  })

  it('clicking a row selects it instead of navigating', async () => {
    render(<BrowserRouter><JournalEntriesPage /></BrowserRouter>)

    fireEvent.click(screen.getByText('JE-001'))

    await waitFor(() => {
      expect(screen.getAllByText('JE-001').length).toBeGreaterThan(1)
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })
})
