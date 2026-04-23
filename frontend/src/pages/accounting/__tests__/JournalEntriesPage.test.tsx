import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { BrowserRouter } from 'react-router-dom'

import JournalEntriesPage from '../JournalEntriesPage'
import accountingReducer from '@/store/slices/accountingSlice'
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
    getCurrentDate: () => '2026-04-22',
  }
})
vi.mock('@/utils/dateRange', () => ({
  getPeriodDateRange: () => ({ from: undefined, to: undefined }),
  getStartOfWeek: () => 0,
}))

const mockedApi = vi.hoisted(() => ({
  useGetJournalEntriesQuery: vi.fn(),
  useLazyGetJournalEntryQuery: vi.fn(),
  useDeleteJournalEntryMutation: vi.fn(),
  usePostJournalEntryMutation: vi.fn(),
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

function makeStore() {
  return configureStore({ reducer: { accounting: accountingReducer } })
}

function renderPage() {
  return render(
    <Provider store={makeStore()}>
      <BrowserRouter>
        <JournalEntriesPage />
      </BrowserRouter>
    </Provider>,
  )
}

describe('JournalEntriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetJournalEntriesQuery.mockReturnValue({
      data: { data: [mockEntry], meta: { total: 1 } },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useLazyGetJournalEntryQuery.mockReturnValue([
      vi.fn().mockResolvedValue({ data: mockEntry }),
      { data: mockEntry, isLoading: false, isFetching: false },
    ])
    mockedApi.useDeleteJournalEntryMutation.mockReturnValue([vi.fn()])
    mockedApi.usePostJournalEntryMutation.mockReturnValue([vi.fn()])
    mockedApi.useReverseJournalEntryMutation.mockReturnValue([vi.fn()])
  })

  it('renders the page title', () => {
    renderPage()
    expect(screen.getByText('Journal Entries')).toBeInTheDocument()
  })

  it('renders journal entry rows', () => {
    renderPage()
    expect(screen.getByText('JE-001')).toBeInTheDocument()
  })

  it('clicking a row selects it and shows details in the context header', async () => {
    renderPage()

    fireEvent.click(screen.getByText('JE-001'))

    await waitFor(() => {
      expect(screen.getByText('JE Details - JE-001')).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('renders journal entry details without chip styling', async () => {
    const { container } = renderPage()

    fireEvent.click(screen.getByText('JE-001'))

    await waitFor(() => {
      expect(screen.getByText('JE Details - JE-001')).toBeInTheDocument()
    })

    expect(container.querySelector('.MuiChip-root')).not.toBeInTheDocument()
  })
})
