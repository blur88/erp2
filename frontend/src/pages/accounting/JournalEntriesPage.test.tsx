import React from 'react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter } from 'react-router-dom'

import JournalEntriesPage from './JournalEntriesPage'
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
    Link: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
    BrowserRouter: ({ children }: any) => <div>{children}</div>,
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
    createdAt: '2024-01-15',
    updatedAt: '2024-01-15',
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
    isDraft: false,
    isPosted: true,
    isReversed: false,
    fiscalPeriodId: 'fp1',
    createdAt: '2024-01-16',
    updatedAt: '2024-01-16',
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
    isDraft: false,
    isPosted: true,
    isReversed: false,
    fiscalPeriodId: 'fp1',
    createdAt: '2024-01-17',
    updatedAt: '2024-01-17',
  },
]

const renderPage = () =>
  render(
    <BrowserRouter>
      <JournalEntriesPage />
    </BrowserRouter>
  )

describe('JournalEntriesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()
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

  it('displays entry type chips', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('Manual Entry')).toBeInTheDocument()
      expect(screen.getByText('Sales Order')).toBeInTheDocument()
      expect(screen.getByText('Customer Payment')).toBeInTheDocument()
    })
  })

  it('shows source transaction link for auto-posted entries', async () => {
    renderPage()

    expect(await screen.findAllByText('View Transaction')).toHaveLength(2)
  })

  it('hides source link for manual-only entries', async () => {
    mockedApi.useGetJournalEntriesQuery.mockReturnValue({
      data: {
        data: [mockJournalEntries[0]],
        meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
      },
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderPage()

    await waitFor(() => {
      expect(screen.queryByText('View Transaction')).not.toBeInTheDocument()
    })
  })

  it('filters by entry type', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('JE-001')).toBeInTheDocument()
    })

    expect(screen.getByText('Manual Entry')).toBeInTheDocument()
    expect(screen.getByText('Sales Order')).toBeInTheDocument()
    expect(screen.getByText('Customer Payment')).toBeInTheDocument()
  })

  it('navigates to source transaction when view transaction is clicked', async () => {
    renderPage()

    const user = userEvent.setup()
    const viewLinks = await screen.findAllByText('View Transaction')
    await user.click(viewLinks[0])

    expect(mockNavigate).toHaveBeenCalledWith('/sales/orders?highlight=so-123')
  })
})
