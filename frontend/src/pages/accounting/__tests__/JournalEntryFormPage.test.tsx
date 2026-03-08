import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import JournalEntryFormPage from '../JournalEntryFormPage'

const mockedApi = vi.hoisted(() => ({
  useGetJournalEntryQuery: vi.fn(),
  useGetChartOfAccountsQuery: vi.fn(),
  useGetCurrentFiscalPeriodQuery: vi.fn(),
  useCreateJournalEntryMutation: vi.fn(),
  useUpdateJournalEntryMutation: vi.fn(),
}))

const mockNavigate = vi.fn()
const mockParams = { id: undefined as string | undefined }

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => mockParams,
  }
})

const mockShowSuccess = vi.fn()
const mockShowError = vi.fn()

vi.mock('@/store/api/accountingApi', () => ({
  useGetJournalEntryQuery: mockedApi.useGetJournalEntryQuery,
  useGetChartOfAccountsQuery: mockedApi.useGetChartOfAccountsQuery,
  useGetCurrentFiscalPeriodQuery: mockedApi.useGetCurrentFiscalPeriodQuery,
  useCreateJournalEntryMutation: mockedApi.useCreateJournalEntryMutation,
  useUpdateJournalEntryMutation: mockedApi.useUpdateJournalEntryMutation,
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: mockShowSuccess,
    showError: mockShowError,
  }),
}))

vi.mock('@/utils/formatters', () => ({
  formatCurrency: (value: number) => `$${value.toFixed(2)}`,
  formatDate: (date: string | Date) => new Date(date).toLocaleDateString(),
  getCurrentDate: () => '2024-02-04',
}))

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

const renderWithProviders = () =>
  render(
    <BrowserRouter>
      <JournalEntryFormPage />
    </BrowserRouter>
  )

describe('JournalEntryFormPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockParams.id = undefined
    mockedApi.useGetJournalEntryQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: undefined,
    })
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: {
        data: mockChartAccounts,
        meta: { page: 1, limit: 20, total: 4, totalPages: 1 },
      },
      isLoading: false,
    })
    mockedApi.useGetCurrentFiscalPeriodQuery.mockReturnValue({
      data: {
        id: 'fp1',
        code: '2024-02',
        name: 'February 2024',
        startDate: '2024-02-01',
        endDate: '2024-02-29',
        status: 'OPEN',
      },
    })
    mockedApi.useCreateJournalEntryMutation.mockReturnValue([vi.fn()])
    mockedApi.useUpdateJournalEntryMutation.mockReturnValue([vi.fn()])
  })

  it('renders create form with header and fields', () => {
    renderWithProviders()

    expect(screen.getByText('New Journal Entry')).toBeInTheDocument()
    expect(screen.getByLabelText(/Entry Date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Reference Number/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Description/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Fiscal Period/i)).toBeInTheDocument()
  })

  it('displays fiscal period based on current period', () => {
    renderWithProviders()

    expect(screen.getByLabelText(/Fiscal Period/i)).toHaveValue('2024-02 - February 2024')
  })

  it('renders initial two line items', () => {
    renderWithProviders()

    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2)
  })

  it('adds new line when Add Line button is clicked', async () => {
    renderWithProviders()

    fireEvent.click(screen.getByText('Add Line'))

    await waitFor(() => {
      expect(screen.getAllByRole('combobox').length).toBeGreaterThan(2)
    })
  })

  it('calculates totals correctly', async () => {
    renderWithProviders()

    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '100' } })
    fireEvent.change(inputs[3], { target: { value: '100' } })

    await waitFor(() => {
      expect(screen.getByText('Balanced')).toBeInTheDocument()
    })
  })

  it('updates totals and balance status for single-line debit entry', async () => {
    renderWithProviders()

    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '100' } })

    await waitFor(() => {
      expect(inputs[0]).toHaveValue(100)
      expect(screen.getByText(/Entry is out of balance by \$100\.00/i)).toBeInTheDocument()
      expect(screen.getByText('Not Balanced')).toBeInTheDocument()
      expect(screen.getByText('Save and Post')).toBeDisabled()
    })
  })

  it('prevents both debit and credit on same line', async () => {
    renderWithProviders()

    const inputs = screen.getAllByRole('spinbutton')
    fireEvent.change(inputs[0], { target: { value: '100' } })
    fireEvent.change(inputs[1], { target: { value: '50' } })

    await waitFor(() => {
      expect(inputs[0]).toHaveValue(0)
      expect(inputs[1]).toHaveValue(50)
    })
  })

  it('disables remove button when only 2 lines remain', () => {
    renderWithProviders()

    const removeButtons = screen.getAllByTestId('DeleteIcon').map((icon) => icon.closest('button'))
    expect(removeButtons).toHaveLength(2)
    removeButtons.forEach((button) => expect(button).toBeDisabled())
  })

  it('enables remove button when more than 2 lines exist', async () => {
    renderWithProviders()

    fireEvent.click(screen.getByText('Add Line'))

    await waitFor(() => {
      const enabledButtons = screen
        .getAllByTestId('DeleteIcon')
        .map((icon) => icon.closest('button'))
        .filter((button) => button && !button.disabled)
      expect(enabledButtons.length).toBeGreaterThan(0)
    })
  })

  it('navigates back when cancel button is clicked', () => {
    renderWithProviders()

    fireEvent.click(screen.getByText('Cancel'))

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/journal-entries')
  })

  it('navigates back when back arrow is clicked', () => {
    renderWithProviders()

    fireEvent.click(screen.getAllByRole('button')[0])

    expect(mockNavigate).toHaveBeenCalledWith('/accounting/journal-entries')
  })

  it('displays edit mode when id is present', async () => {
    mockParams.id = 'test-id'
    mockedApi.useGetJournalEntryQuery.mockReturnValue({
      data: mockJournalEntry,
      isLoading: false,
      error: undefined,
    })

    renderWithProviders()

    await waitFor(() => {
      expect(screen.getByText('Edit Journal Entry')).toBeInTheDocument()
    })
  })

  it('shows Save and Post button enabled with default balanced state', () => {
    renderWithProviders()

    expect(screen.getByText('Save and Post')).toBeEnabled()
  })

  it('displays current date as default entry date', () => {
    renderWithProviders()

    expect(screen.getByLabelText(/Entry Date/i)).toHaveValue('2024-02-04')
  })

  it('shows helper text for reference number', () => {
    renderWithProviders()

    expect(screen.getByText('Leave empty to auto-generate')).toBeInTheDocument()
  })

  it('shows totals summary card', () => {
    renderWithProviders()

    expect(screen.getByText('Total Debits')).toBeInTheDocument()
    expect(screen.getByText('Total Credits')).toBeInTheDocument()
    expect(screen.getByText('Difference')).toBeInTheDocument()
    expect(screen.getByText('Status')).toBeInTheDocument()
  })
})
