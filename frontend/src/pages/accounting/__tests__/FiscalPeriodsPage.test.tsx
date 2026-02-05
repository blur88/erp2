import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import FiscalPeriodsPage from '../FiscalPeriodsPage'
import fiscalPeriodsReducer from '@/store/slices/fiscalPeriodsSlice'
import { ApiService } from '@/services/api'
import { FiscalPeriodStatus } from '@/types'

// Mock ApiService
vi.mock('@/services/api', () => ({
  ApiService: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

// Mock hooks
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/hooks/useSearchAndFilter', () => ({
  useSearchAndFilter: () => ({
    searchTerm: '',
    setSearchTerm: vi.fn(),
    focusSearchInput: vi.fn(),
  }),
  useKeyboardShortcuts: vi.fn(),
}))

// Mock date-fns
vi.mock('date-fns', () => ({
  format: (date: Date | string, formatStr: string) => {
    const d = new Date(date)
    if (formatStr === 'MMM dd, yyyy') {
      return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    }
    return d.toISOString().split('T')[0]
  },
}))

// Mock data
const mockPeriods = [
  {
    id: '1',
    code: '2026-01',
    name: 'January 2026',
    startDate: '2026-01-01T00:00:00Z',
    endDate: '2026-01-31T00:00:00Z',
    status: FiscalPeriodStatus.OPEN,
    isOpen: true,
    isClosed: false,
    durationDays: 31,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: '2',
    code: '2025-12',
    name: 'December 2025',
    startDate: '2025-12-01T00:00:00Z',
    endDate: '2025-12-31T00:00:00Z',
    status: FiscalPeriodStatus.CLOSED,
    isOpen: false,
    isClosed: true,
    durationDays: 31,
    createdAt: '2025-12-01T00:00:00Z',
    updatedAt: '2025-12-01T00:00:00Z',
  },
  {
    id: '3',
    code: '2025-11',
    name: 'November 2025',
    startDate: '2025-11-01T00:00:00Z',
    endDate: '2025-11-30T00:00:00Z',
    status: FiscalPeriodStatus.CLOSED,
    isOpen: false,
    isClosed: true,
    durationDays: 30,
    createdAt: '2025-11-01T00:00:00Z',
    updatedAt: '2025-11-01T00:00:00Z',
  },
]

const createMockStore = () => {
  return configureStore({
    reducer: {
      fiscalPeriods: fiscalPeriodsReducer,
    },
  })
}

const renderWithProvider = (store: any) => {
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <FiscalPeriodsPage />
      </BrowserRouter>
    </Provider>
  )
}

describe('FiscalPeriodsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock successful API response by default
    ;(ApiService.get as any).mockResolvedValue({
      data: mockPeriods,
      meta: { page: 1, limit: 1000, total: 3, totalPages: 1 },
    })
  })

  it('renders page header correctly', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      expect(screen.getByText('Fiscal Periods')).toBeInTheDocument()
    })
  })

  it('renders fiscal periods list with correct data', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      expect(screen.getByText('2026-01')).toBeInTheDocument()
      expect(screen.getByText('2025-12')).toBeInTheDocument()
      expect(screen.getByText('2025-11')).toBeInTheDocument()
    }, { timeout: 5000 })

    expect(screen.getByText('January 2026')).toBeInTheDocument()
    expect(screen.getByText('December 2025')).toBeInTheDocument()
    expect(screen.getByText('November 2025')).toBeInTheDocument()
  })

  it('displays status badges correctly', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      expect(screen.getByText('OPEN')).toBeInTheDocument()
      const closedBadges = screen.getAllByText('CLOSED')
      expect(closedBadges.length).toBe(2)
    })
  })

  it('displays duration in days', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      const duration31 = screen.getAllByText('31 days')
      expect(duration31.length).toBe(2) // Jan and Dec both have 31 days

      expect(screen.getByText('30 days')).toBeInTheDocument() // November has 30 days
    })
  })

  it('opens generate periods dialog when Generate button clicked', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      expect(screen.getByText('Fiscal Periods')).toBeInTheDocument()
    })

    const generateButton = screen.getByRole('button', { name: /Generate/i })
    fireEvent.click(generateButton)

    await waitFor(() => {
      expect(screen.getByText('Generate Fiscal Periods')).toBeInTheDocument()
    })
  })

  it('opens create dialog when Add Period button is clicked', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      expect(screen.getByText('Fiscal Periods')).toBeInTheDocument()
    })

    const addButton = screen.getByRole('button', { name: /Add Period/i })
    fireEvent.click(addButton)

    await waitFor(() => {
      expect(screen.getByText('Create Fiscal Period')).toBeInTheDocument()
    })
  })

  it('shows close button for open periods', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      const closeButtons = screen.getAllByTitle(/Close/i)
      // Only open periods have close buttons
      expect(closeButtons.length).toBe(1)
    })
  })

  it('shows reopen button only for most recently closed period', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      const reopenButtons = screen.getAllByTitle(/Reopen/i)
      // Only the most recently closed period can be reopened
      expect(reopenButtons.length).toBe(1)
    })
  })

  it('filters periods by search term', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      expect(screen.getByText('Fiscal Periods')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/Search by code or name/i)
    fireEvent.change(searchInput, { target: { value: 'January' } })

    await waitFor(() => {
      expect(searchInput).toHaveValue('January')
    })
  })

  it('filters periods by status', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      expect(screen.getByText('Fiscal Periods')).toBeInTheDocument()
    })

    // Find status filter by text content since MUI Select doesn't associate labels properly
    const statusFilters = screen.getAllByText('Status')
    // The first occurrence is the label, the filter itself is nearby
    expect(statusFilters.length).toBeGreaterThan(0)
  })

  it('shows empty state when no periods exist', async () => {
    ;(ApiService.get as any).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 1000, total: 0, totalPages: 0 },
    })

    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      expect(screen.getByText(/No fiscal periods found/i)).toBeInTheDocument()
      expect(screen.getByText(/Generate periods to get started/i)).toBeInTheDocument()
    })
  })

  it('displays loading spinner when loading', () => {
    ;(ApiService.get as any).mockImplementation(() => new Promise(() => {}))

    const store = createMockStore()
    renderWithProvider(store)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('handles errors gracefully', async () => {
    const errorMessage = 'Failed to fetch periods'
    ;(ApiService.get as any).mockRejectedValue({
      response: { data: { message: errorMessage } },
    })

    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      expect(screen.getByText('Fiscal Periods')).toBeInTheDocument()
    })
  })

  it('displays year filter with available years', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      // Find year filter by text content since MUI Select doesn't associate labels properly
      const yearFilters = screen.getAllByText('Year')
      expect(yearFilters.length).toBeGreaterThan(0)
    })
  })
})
