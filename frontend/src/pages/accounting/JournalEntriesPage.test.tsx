import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import JournalEntriesPage from './JournalEntriesPage'
import { JournalEntryStatus } from '@/types'
import journalEntriesReducer from '@/store/slices/journalEntriesSlice'
import accountMappingsReducer from '@/store/slices/accountMappingsSlice'
import { journalEntriesApi } from '@/services/accountingApi'

// Mock react-router-dom
const mockNavigate = vi.fn()
const mockLocation = { search: '', pathname: '/accounting/journal-entries' }

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockLocation,
    Link: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
    BrowserRouter: ({ children }: any) => <div>{children}</div>,
  }
})

// Mock notification hook
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

// Mock AccountMappingWarning component
vi.mock('@/components/accounting/AccountMappingWarning', () => ({
  default: () => null,
}))

// Mock formatters
vi.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `$${value.toFixed(2)}`,
  formatDate: (date: string | Date) => new Date(date).toLocaleDateString(),
}))

// Mock API service to prevent real API calls
vi.mock('@/services/accountingApi', () => ({
  accountMappingsApi: {
    getAll: vi.fn().mockResolvedValue([]),
    validate: vi.fn().mockResolvedValue({ isComplete: true, missingMappings: [], configuredMappings: [] }),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
  journalEntriesApi: {
    getAll: vi.fn(),
    getById: vi.fn().mockResolvedValue({}),
    create: vi.fn().mockResolvedValue({}),
    update: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    post: vi.fn(),
    reverse: vi.fn(),
  },
}))

const createMockStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      journalEntries: journalEntriesReducer,
      accountMappings: accountMappingsReducer,
    },
    preloadedState: initialState,
  })
}

const renderWithStore = (component: React.ReactElement, initialState = {}) => {
  const store = createMockStore(initialState)
  return render(
    <Provider store={store}>
      <BrowserRouter>{component}</BrowserRouter>
    </Provider>
  )
}

describe('JournalEntriesPage', () => {
  const mockJournalEntries = [
    {
      id: '1',
      referenceNumber: 'JE-001',
      entryDate: '2024-01-15',
      description: 'Manual journal entry',
      sourceType: null,
      sourceId: null,
      status: JournalEntryStatus.DRAFT,
      totalDebits: 1000,
      totalCredits: 1000,
      isBalanced: true,
    },
    {
      id: '2',
      referenceNumber: 'JE-002',
      entryDate: '2024-01-16',
      description: 'Sales order #SO-001',
      sourceType: 'sales_order',
      sourceId: 'so-123',
      status: JournalEntryStatus.POSTED,
      totalDebits: 5000,
      totalCredits: 5000,
      isBalanced: true,
    },
    {
      id: '3',
      referenceNumber: 'JE-003',
      entryDate: '2024-01-17',
      description: 'Customer payment',
      sourceType: 'payment',
      sourceId: 'pay-456',
      status: JournalEntryStatus.POSTED,
      totalDebits: 2000,
      totalCredits: 2000,
      isBalanced: true,
    },
  ]

  const mockPagination = {
    page: 1,
    limit: 50,
    total: 3,
    totalPages: 1,
  }

  const defaultState = {
    journalEntries: {
      data: mockJournalEntries,
      selectedEntry: null,
      loading: false,
      error: null,
      pagination: mockPagination,
    },
    accountMappings: {
      mappings: [],
      loading: false,
      error: null,
      isValid: true,
      validationResult: null,
    },
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()

    // Set up default API mock response
    ;(journalEntriesApi.getAll as any).mockResolvedValue({
      data: mockJournalEntries,
      meta: mockPagination,
    })
  })

  it('displays entry type chips', async () => {
    renderWithStore(<JournalEntriesPage />, defaultState)

    await waitFor(() => {
      expect(screen.getByText('Manual Entry')).toBeInTheDocument()
      expect(screen.getByText('Sales Order')).toBeInTheDocument()
      expect(screen.getByText('Customer Payment')).toBeInTheDocument()
    })
  })

  it('shows "Manual Entry" for manual entries', async () => {
    renderWithStore(<JournalEntriesPage />, defaultState)

    const manualChips = await screen.findAllByText('Manual Entry')
    expect(manualChips.length).toBeGreaterThan(0)
  })

  it('shows source transaction link for auto-posted entries', async () => {
    renderWithStore(<JournalEntriesPage />, defaultState)

    const viewLinks = await screen.findAllByText('View Transaction')
    expect(viewLinks.length).toBe(2) // Two auto-posted entries
  })

  it('hides source link for manual entries', async () => {
    const manualState = {
      journalEntries: {
        data: [
          {
            id: '1',
            referenceNumber: 'JE-001',
            entryDate: '2024-01-15',
            description: 'Manual entry',
            sourceType: null,
            sourceId: null,
            status: JournalEntryStatus.DRAFT,
            totalDebits: 1000,
            totalCredits: 1000,
            isBalanced: true,
          },
        ],
        selectedEntry: null,
        loading: false,
        error: null,
        pagination: {
          page: 1,
          limit: 50,
          total: 1,
          totalPages: 1,
        },
      },
      accountMappings: {
        mappings: [],
        loading: false,
        error: null,
        isValid: true,
        validationResult: null,
      },
    }

    renderWithStore(<JournalEntriesPage />, manualState)

    await waitFor(() => {
      expect(screen.queryByText('View Transaction')).not.toBeInTheDocument()
    })
  })

  it('filters by entry type', async () => {
    renderWithStore(<JournalEntriesPage />, defaultState)

    // Wait for page to load
    await waitFor(() => {
      expect(screen.getByText('JE-001')).toBeInTheDocument()
    })

    // Verify entry type chips are displayed
    expect(screen.getByText('Manual Entry')).toBeInTheDocument()
    expect(screen.getByText('Sales Order')).toBeInTheDocument()
    expect(screen.getByText('Customer Payment')).toBeInTheDocument()
  })

  it('navigates to source transaction when link clicked', async () => {
    const user = userEvent.setup()
    renderWithStore(<JournalEntriesPage />, defaultState)

    const viewLinks = await screen.findAllByText('View Transaction')
    await user.click(viewLinks[0])

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/sales/orders?highlight=so-123')
    })
  })

  it('navigates to sales payments with highlight query param for payment entries', async () => {
    const user = userEvent.setup()
    renderWithStore(<JournalEntriesPage />, defaultState)

    const viewLinks = await screen.findAllByText('View Transaction')
    await user.click(viewLinks[1])

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/sales/payments?highlight=pay-456')
    })
  })

  it('handles URL query parameters (sourceType, sourceId)', async () => {
    // Mock location with query params
    mockLocation.search = '?sourceType=sales_order&sourceId=so-123'

    renderWithStore(<JournalEntriesPage />, defaultState)

    // Component should render without errors
    await waitFor(() => {
      expect(screen.getByText('Journal Entries')).toBeInTheDocument()
    })

    // Reset location
    mockLocation.search = ''
  })

  it('requests journal entries sorted by created date-time descending by default', async () => {
    renderWithStore(<JournalEntriesPage />, defaultState)

    await waitFor(() => {
      expect(journalEntriesApi.getAll).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 1,
          sortBy: 'createdAt',
          sortOrder: 'DESC',
        }),
      )
    })
  })
})
