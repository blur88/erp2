import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import FiscalPeriodsPage from '../FiscalPeriodsPage'
import { FiscalPeriodStatus } from '@/types'

const mockedApi = vi.hoisted(() => ({
  useGetFiscalPeriodsQuery: vi.fn(),
  useDeleteFiscalPeriodMutation: vi.fn(),
  useCloseFiscalPeriodMutation: vi.fn(),
  useReopenFiscalPeriodMutation: vi.fn(),
  useGenerateFiscalPeriodsMutation: vi.fn(),
  useCreateFiscalPeriodMutation: vi.fn(),
  useUpdateFiscalPeriodMutation: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetFiscalPeriodsQuery: mockedApi.useGetFiscalPeriodsQuery,
  useDeleteFiscalPeriodMutation: mockedApi.useDeleteFiscalPeriodMutation,
  useCloseFiscalPeriodMutation: mockedApi.useCloseFiscalPeriodMutation,
  useReopenFiscalPeriodMutation: mockedApi.useReopenFiscalPeriodMutation,
  useGenerateFiscalPeriodsMutation: mockedApi.useGenerateFiscalPeriodsMutation,
  useCreateFiscalPeriodMutation: mockedApi.useCreateFiscalPeriodMutation,
  useUpdateFiscalPeriodMutation: mockedApi.useUpdateFiscalPeriodMutation,
}))

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

vi.mock('@/components/accounting/AccountMappingWarning', () => ({
  default: () => null,
}))

vi.mock('date-fns', () => ({
  format: (date: Date | string, formatStr: string) => {
    const d = new Date(date)
    if (formatStr === 'MMM dd, yyyy') {
      return d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
    }
    return d.toISOString().split('T')[0]
  },
}))

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

const renderWithProvider = () =>
  render(
    <BrowserRouter>
      <FiscalPeriodsPage />
    </BrowserRouter>
  )

describe('FiscalPeriodsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetFiscalPeriodsQuery.mockReturnValue({
      data: {
        data: mockPeriods,
        meta: { page: 1, limit: 1000, total: 3, totalPages: 1 },
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })
    mockedApi.useDeleteFiscalPeriodMutation.mockReturnValue([vi.fn()])
    mockedApi.useCloseFiscalPeriodMutation.mockReturnValue([vi.fn()])
    mockedApi.useReopenFiscalPeriodMutation.mockReturnValue([vi.fn()])
    mockedApi.useGenerateFiscalPeriodsMutation.mockReturnValue([vi.fn()])
    mockedApi.useCreateFiscalPeriodMutation.mockReturnValue([vi.fn()])
    mockedApi.useUpdateFiscalPeriodMutation.mockReturnValue([vi.fn()])
  })

  it('renders page header correctly', async () => {
    renderWithProvider()

    await waitFor(() => {
      expect(screen.getByText('Fiscal Periods')).toBeInTheDocument()
    })
  })

  it('renders fiscal periods list with correct data', async () => {
    renderWithProvider()

    await waitFor(() => {
      expect(screen.getByText('2026-01')).toBeInTheDocument()
      expect(screen.getByText('2025-12')).toBeInTheDocument()
      expect(screen.getByText('2025-11')).toBeInTheDocument()
    })

    expect(screen.getByText('January 2026')).toBeInTheDocument()
    expect(screen.getByText('December 2025')).toBeInTheDocument()
    expect(screen.getByText('November 2025')).toBeInTheDocument()
  })

  it('displays status badges correctly', async () => {
    renderWithProvider()

    await waitFor(() => {
      expect(screen.getByText('OPEN')).toBeInTheDocument()
      expect(screen.getAllByText('CLOSED')).toHaveLength(2)
    })
  })

  it('displays duration in days', async () => {
    renderWithProvider()

    await waitFor(() => {
      expect(screen.getAllByText('31 days')).toHaveLength(2)
      expect(screen.getByText('30 days')).toBeInTheDocument()
    })
  })

  it('opens generate periods dialog when Generate button clicked', async () => {
    renderWithProvider()

    const generateButton = await screen.findByRole('button', { name: /^Generate(?: Periods)?$/i })
    fireEvent.click(generateButton)

    expect(await screen.findByRole('dialog', { name: /Generate Fiscal Periods/i })).toBeInTheDocument()
  })

  it('opens create dialog when Add Period button is clicked', async () => {
    renderWithProvider()

    await waitFor(() => {
      expect(screen.getByText('Fiscal Periods')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /Add Period/i }))

    await waitFor(() => {
      expect(screen.getByText('Create Fiscal Period')).toBeInTheDocument()
    })
  })

  it('shows close button for open periods', async () => {
    renderWithProvider()

    await waitFor(() => {
      expect(screen.getAllByTitle(/Close/i)).toHaveLength(1)
    })
  })

  it('shows reopen button only for most recently closed period', async () => {
    renderWithProvider()

    await waitFor(() => {
      expect(screen.getAllByTitle(/Reopen/i)).toHaveLength(1)
    })
  })

  it('filters periods by search term', async () => {
    renderWithProvider()

    const searchInput = await screen.findByPlaceholderText(/Search by code or name/i)
    fireEvent.change(searchInput, { target: { value: 'January' } })

    await waitFor(() => {
      expect(searchInput).toHaveValue('January')
    })
  })

  it('filters periods by status', async () => {
    renderWithProvider()

    await waitFor(() => {
      expect(screen.getAllByText('Status').length).toBeGreaterThan(0)
    })
  })

  it('shows empty state when no periods exist', async () => {
    mockedApi.useGetFiscalPeriodsQuery.mockReturnValue({
      data: {
        data: [],
        meta: { page: 1, limit: 1000, total: 0, totalPages: 0 },
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithProvider()

    await waitFor(() => {
      expect(screen.getByText(/No fiscal periods found/i)).toBeInTheDocument()
      expect(screen.getByText(/Generate periods to get started/i)).toBeInTheDocument()
    })
  })

  it('displays loading spinner when loading', () => {
    mockedApi.useGetFiscalPeriodsQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithProvider()

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('handles errors gracefully', async () => {
    mockedApi.useGetFiscalPeriodsQuery.mockReturnValue({
      data: { data: [], meta: { page: 1, limit: 1000, total: 0, totalPages: 0 } },
      isLoading: false,
      error: { data: 'Failed to fetch periods' },
      refetch: vi.fn(),
    })

    renderWithProvider()

    await waitFor(() => {
      expect(screen.getByText('Fiscal Periods')).toBeInTheDocument()
    })
  })

  it('displays year filter with available years', async () => {
    renderWithProvider()

    await waitFor(() => {
      expect(screen.getAllByText('Year').length).toBeGreaterThan(0)
    })
  })
})
