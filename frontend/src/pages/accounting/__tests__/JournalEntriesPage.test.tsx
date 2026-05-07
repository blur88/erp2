import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'

import { JournalEntriesPage } from '../JournalEntriesPage'
import accountingReducer, { selectSelectedJournalEntry } from '@/store/slices/accountingSlice'
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
  useLazyGetJournalEntryQuery: vi.fn(),
}))

const mockNavigate = vi.fn()
let mockLocation = { search: '', pathname: '/accounting/journal-entries' }

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

function renderPage(initialUrl = '/accounting/journal-entries') {
  const [pathname, search = ''] = initialUrl.split('?')
  mockLocation = { pathname, search: search ? `?${search}` : '' }
  const store = makeStore()
  render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <JournalEntriesPage />
      </MemoryRouter>
    </Provider>,
  )
  return { store }
}

describe('JournalEntriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockLocation = { search: '', pathname: '/accounting/journal-entries' }
    mockedApi.useGetJournalEntriesQuery.mockReturnValue({
      data: { data: [mockEntry], meta: { total: 1 } },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useLazyGetJournalEntryQuery.mockReturnValue([vi.fn().mockResolvedValue({ id: '1' })])
  })

  it('renders the page title', () => {
    renderPage()
    expect(screen.getByText('Journal Entries')).toBeInTheDocument()
  })

  it('renders journal entry rows', () => {
    renderPage()
    expect(screen.getAllByText('JE-001').length).toBeGreaterThan(0)
  })

  it('clicking a row selects it instead of navigating', async () => {
    renderPage()
    fireEvent.click(screen.getAllByText('JE-001')[0])
    await waitFor(() => {
      expect(screen.getByText('Journal Entry Details - JE-001')).toBeInTheDocument()
    })
    expect(mockNavigate).not.toHaveBeenCalled()
  })

  it('does not render a New Journal Entry button', () => {
    renderPage()
    expect(screen.queryByText(/new journal entry/i)).not.toBeInTheDocument()
  })

  it('does not render bulk action buttons', () => {
    renderPage()
    expect(screen.queryByText(/post selected/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/delete selected/i)).not.toBeInTheDocument()
  })

  it('shows Reset button when ?sourceId= URL param is present', () => {
    renderPage('/accounting/journal-entries?sourceType=sales_order&sourceId=so-1')
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument()
  })

  it('shows Reset button when ?ids= URL param is present', () => {
    renderPage('/accounting/journal-entries?ids=je-1,je-2')
    expect(screen.getByRole('button', { name: /reset/i })).toBeInTheDocument()
  })

  it('navigates to clean URL when Reset is clicked with URL params active', async () => {
    renderPage('/accounting/journal-entries?ids=je-1,je-2')
    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/accounting/journal-entries', { replace: true })
    })
  })

  it('auto-selects the entry matching the ?highlight= URL param', async () => {
    mockedApi.useGetJournalEntriesQuery.mockReturnValue({
      data: { data: [mockEntry], meta: { total: 1 } },
      isLoading: false,
      refetch: vi.fn(),
    })
    mockedApi.useLazyGetJournalEntryQuery.mockReturnValue([vi.fn().mockResolvedValue(mockEntry)])

    const { store } = renderPage('/accounting/journal-entries?highlight=1')

    await waitFor(() => {
      expect(selectSelectedJournalEntry(store.getState())?.id).toBe('1')
    })
  })
})
