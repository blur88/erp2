import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import JournalEntryFormPage from '../JournalEntryFormPage'
import journalEntriesReducer from '@/store/slices/journalEntriesSlice'
import chartOfAccountsReducer from '@/store/slices/chartOfAccountsSlice'
import fiscalPeriodsReducer from '@/store/slices/fiscalPeriodsSlice'

const mockChartAccounts = [
  { id: '1', code: '1000', name: 'Cash', type: 'asset', normalBalance: 'debit', isActive: true },
  { id: '2', code: '2000', name: 'Accounts Payable', type: 'liability', normalBalance: 'credit', isActive: true },
  { id: '3', code: '4000', name: 'Sales Revenue', type: 'revenue', normalBalance: 'credit', isActive: true },
  { id: '4', code: '5000', name: 'Cost of Goods Sold', type: 'expense', normalBalance: 'debit', isActive: true },
]

const mockJournalEntry = {
  id: 'test-id',
  referenceNumber: 'JE-001',
  entryDate: '2024-02-04',
  description: 'Test Entry',
  status: 'DRAFT',
  lines: [
    { id: '1', accountId: '1', debitAmount: 100, creditAmount: 0, memo: 'Test' },
    { id: '2', accountId: '2', debitAmount: 0, creditAmount: 100, memo: '' },
  ],
}

// Mock react-router-dom hooks
const mockNavigate = vi.fn()
const mockParams = { id: undefined }

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams,
  }
})

// Mock notification hook
const mockShowSuccess = vi.fn()
const mockShowError = vi.fn()

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
  }),
}))

// Mock formatters
vi.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `$${value.toFixed(2)}`,
  getCurrentDate: () => '2024-02-04',
}))

// Mock API service to prevent real API calls
vi.mock('@/services/api', () => ({
  ApiService: {
    get: vi.fn((url: string) => {
      if (url.includes('/accounting/chart-of-accounts?')) {
        return Promise.resolve({
          data: mockChartAccounts,
          meta: { page: 1, limit: 20, total: mockChartAccounts.length, totalPages: 1 },
        })
      }

      if (url.includes('/accounting/journal-entries/')) {
        return Promise.resolve(mockJournalEntry)
      }

      return Promise.resolve({ data: [], meta: {} })
    }),
    post: vi.fn().mockResolvedValue({}),
    patch: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
  },
}))

const createMockStore = (initialState = {}) => {
  return configureStore({
    reducer: {
      journalEntries: journalEntriesReducer,
      chartOfAccounts: chartOfAccountsReducer,
      fiscalPeriods: fiscalPeriodsReducer,
    },
    preloadedState: {
      journalEntries: {
        data: [],
        selectedEntry: null,
        loading: false,
        error: null,
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      },
      chartOfAccounts: {
        data: mockChartAccounts,
        hierarchy: [],
        loading: false,
        error: null,
        pagination: { page: 1, limit: 20, total: 4, totalPages: 1 },
      },
      fiscalPeriods: {
        data: [],
        currentPeriod: {
          id: 'fp1',
          code: '2024-02',
          name: 'February 2024',
          startDate: '2024-02-01',
          endDate: '2024-02-29',
          status: 'OPEN',
        },
        selectedPeriod: null,
        loading: false,
        error: null,
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      },
      ...initialState,
    },
  })
}

const renderWithProviders = (component: React.ReactElement, store = createMockStore()) => {
  return render(
    <Provider store={store}>
      <BrowserRouter>{component}</BrowserRouter>
    </Provider>
  )
}

describe('JournalEntryFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParams.id = undefined
  })

  it('renders create form with header and fields', () => {
    renderWithProviders(<JournalEntryFormPage />)

    expect(screen.getByText('New Journal Entry')).toBeInTheDocument()
    expect(screen.getByLabelText(/Entry Date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Reference Number/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Fiscal Period/i)).toBeInTheDocument()
  })

  it('displays fiscal period based on current period', () => {
    renderWithProviders(<JournalEntryFormPage />)

    const fiscalPeriodField = screen.getByLabelText(/Fiscal Period/i)
    expect(fiscalPeriodField).toHaveValue('2024-02 - February 2024')
  })

  it('renders initial two line items', () => {
    renderWithProviders(<JournalEntryFormPage />)

    const accountSelects = screen.getAllByRole('combobox')
    expect(accountSelects.length).toBeGreaterThanOrEqual(2)
  })

  it('adds new line when Add Line button is clicked', async () => {
    renderWithProviders(<JournalEntryFormPage />)

    const addButton = screen.getByText('Add Line')
    fireEvent.click(addButton)

    await waitFor(() => {
      const accountSelects = screen.getAllByRole('combobox')
      expect(accountSelects.length).toBeGreaterThan(2)
    })
  })

  it('calculates totals correctly', async () => {
    renderWithProviders(<JournalEntryFormPage />)

    // Get debit and credit inputs for first two lines
    const debitInputs = screen.getAllByRole('spinbutton')
    const debitInput1 = debitInputs[0]
    const creditInput1 = debitInputs[1]
    const debitInput2 = debitInputs[2]
    const creditInput2 = debitInputs[3]

    // Enter balanced amounts
    fireEvent.change(debitInput1, { target: { value: '100' } })
    fireEvent.change(creditInput2, { target: { value: '100' } })

    await waitFor(() => {
      expect(screen.getByText('Balanced')).toBeInTheDocument()
    })
  })

  it('updates totals and balance status for single-line debit entry', async () => {
    renderWithProviders(<JournalEntryFormPage />)

    const debitInputs = screen.getAllByRole('spinbutton')
    const debitInput1 = debitInputs[0]

    fireEvent.change(debitInput1, { target: { value: '100' } })

    await waitFor(() => {
      expect(debitInput1).toHaveValue(100)
      expect(screen.getByText(/Entry is out of balance by \$100\.00/i)).toBeInTheDocument()
      expect(screen.getByText('Not Balanced')).toBeInTheDocument()
      expect(screen.getByText('Save and Post')).toBeDisabled()
    })
  })

  it('prevents both debit and credit on same line', async () => {
    renderWithProviders(<JournalEntryFormPage />)

    const inputs = screen.getAllByRole('spinbutton')
    const debitInput = inputs[0]
    const creditInput = inputs[1]

    // Enter debit
    fireEvent.change(debitInput, { target: { value: '100' } })

    // Try to enter credit on same line
    fireEvent.change(creditInput, { target: { value: '50' } })

    await waitFor(() => {
      // Credit should clear debit
      expect(debitInput).toHaveValue(0)
      expect(creditInput).toHaveValue(50)
    })
  })

  it('disables remove button when only 2 lines remain', () => {
    renderWithProviders(<JournalEntryFormPage />)

    const deleteIcons = screen.getAllByTestId('DeleteIcon')
    const removeButtons = deleteIcons.map((icon) => icon.closest('button')).filter(Boolean)
    expect(removeButtons.length).toBe(2)
    removeButtons.forEach((button) => {
      expect(button).toBeDisabled()
    })
  })

  it('enables remove button when more than 2 lines exist', async () => {
    renderWithProviders(<JournalEntryFormPage />)

    // Add a third line
    const addButton = screen.getByText('Add Line')
    fireEvent.click(addButton)

    await waitFor(() => {
      const deleteIcons = screen.getAllByTestId('DeleteIcon')
      const enabledRemoveButtons = deleteIcons
        .map((icon) => icon.closest('button'))
        .filter((button) => button && !button.disabled)
      expect(enabledRemoveButtons.length).toBeGreaterThan(0)
    })
  })

  it('navigates back when cancel button is clicked', () => {
    renderWithProviders(<JournalEntryFormPage />)

    const cancelButton = screen.getByText('Cancel')
    fireEvent.click(cancelButton)

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/journal-entries')
  })

  it('navigates back when back arrow is clicked', () => {
    renderWithProviders(<JournalEntryFormPage />)

    const backButton = screen.getAllByRole('button')[0] // First button is back arrow
    fireEvent.click(backButton)

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/journal-entries')
  })

  it('displays edit mode when id is present', async () => {
    mockParams.id = 'test-id'
    const mockStore = createMockStore({
      journalEntries: {
        data: [],
        selectedEntry: mockJournalEntry,
        loading: false,
        error: null,
        pagination: { page: 1, limit: 20, total: 0, totalPages: 0 },
      },
    })

    renderWithProviders(<JournalEntryFormPage />, mockStore)

    await waitFor(() => {
      expect(screen.getByText('Edit Journal Entry')).toBeInTheDocument()
    })
  })

  it('shows Save and Post button enabled with default balanced state', () => {
    renderWithProviders(<JournalEntryFormPage />)

    const saveAndPostButton = screen.getByText('Save and Post')
    expect(saveAndPostButton).toBeEnabled()
  })

  it('shows account selectors in dropdown column', () => {
    renderWithProviders(<JournalEntryFormPage />)

    const accountSelects = screen.getAllByRole('combobox')
    expect(accountSelects.length).toBeGreaterThanOrEqual(2)
  })

  it('displays current date as default entry date', () => {
    renderWithProviders(<JournalEntryFormPage />)

    const dateInput = screen.getByLabelText(/Entry Date/i)
    expect(dateInput).toHaveValue('2024-02-04')
  })

  it('shows helper text for reference number', () => {
    renderWithProviders(<JournalEntryFormPage />)

    expect(screen.getByText('Leave empty to auto-generate')).toBeInTheDocument()
  })

  it('shows totals summary card', () => {
    renderWithProviders(<JournalEntryFormPage />)

    expect(screen.getByText('Total Debits')).toBeInTheDocument()
    expect(screen.getByText('Total Credits')).toBeInTheDocument()
    expect(screen.getByText('Difference')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })
})
