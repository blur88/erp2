import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BrowserRouter, MemoryRouter, Route, Routes } from 'react-router-dom'
import { JournalEntryStatus } from '@/types'

const mockedApi = vi.hoisted(() => ({
  useGetAccountMappingsQuery: vi.fn(),
  useValidateAccountMappingsQuery: vi.fn(),
  useGetPaymentMethodsQuery: vi.fn(),
  useGetChartOfAccountsQuery: vi.fn(),
  useCreateAccountMappingMutation: vi.fn(),
  useUpdateAccountMappingMutation: vi.fn(),
  useDeleteAccountMappingMutation: vi.fn(),
  useGetJournalEntriesQuery: vi.fn(),
  useLazyGetJournalEntryQuery: vi.fn(),
  useDeleteJournalEntryMutation: vi.fn(),
  usePostJournalEntryMutation: vi.fn(),
  useBulkPostJournalEntriesMutation: vi.fn(),
  useBulkDeleteJournalEntriesMutation: vi.fn(),
  useReverseJournalEntryMutation: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetAccountMappingsQuery: mockedApi.useGetAccountMappingsQuery,
  useValidateAccountMappingsQuery: mockedApi.useValidateAccountMappingsQuery,
  useGetPaymentMethodsQuery: mockedApi.useGetPaymentMethodsQuery,
  useGetChartOfAccountsQuery: mockedApi.useGetChartOfAccountsQuery,
  useCreateAccountMappingMutation: mockedApi.useCreateAccountMappingMutation,
  useUpdateAccountMappingMutation: mockedApi.useUpdateAccountMappingMutation,
  useDeleteAccountMappingMutation: mockedApi.useDeleteAccountMappingMutation,
  useGetJournalEntriesQuery: mockedApi.useGetJournalEntriesQuery,
  useLazyGetJournalEntryQuery: mockedApi.useLazyGetJournalEntryQuery,
  useDeleteJournalEntryMutation: mockedApi.useDeleteJournalEntryMutation,
  usePostJournalEntryMutation: mockedApi.usePostJournalEntryMutation,
  useBulkPostJournalEntriesMutation: mockedApi.useBulkPostJournalEntriesMutation,
  useBulkDeleteJournalEntriesMutation: mockedApi.useBulkDeleteJournalEntriesMutation,
  useReverseJournalEntryMutation: mockedApi.useReverseJournalEntryMutation,
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return {
    ...actual,
    formatCurrency: (value: number) => `$${value.toFixed(2)}`,
    formatDate: (date: string | Date) => new Date(date).toLocaleDateString(),
  }
})

const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  }
})

import AccountMappingWarning from '@/components/accounting/AccountMappingWarning'
import AccountingEntryLink from '@/components/accounting/AccountingEntryLink'
import AccountMappingsPage from '@/pages/accounting/AccountMappingsPage'
import JournalEntriesPage from '@/pages/accounting/JournalEntriesPage'

const createUser = () => {
  return (userEvent as any).setup ? (userEvent as any).setup() : userEvent
}

const renderWithRouter = (component: React.ReactElement) => {
  return render(<BrowserRouter>{component}</BrowserRouter>)
}

const renderJournalEntriesPage = (initialEntryUrl = '/accounting/journal-entries') => {
  return render(
    <MemoryRouter initialEntries={[initialEntryUrl]}>
      <Routes>
        <Route path="*" element={<JournalEntriesPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Accounting Auto-Posting Integration Tests', () => {
  const mockRefetch = vi.fn()
  const mockCreateMapping = vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(undefined) }))
  const mockUpdateMapping = vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(undefined) }))
  const mockDeleteMapping = vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(undefined) }))
  const mockDeleteJournalEntry = vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(undefined) }))
  const mockPostJournalEntry = vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue(undefined) }))
  const mockBulkPostJournalEntries = vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue({ succeeded: [], failed: [] }) }))
  const mockBulkDeleteJournalEntries = vi.fn(() => ({ unwrap: vi.fn().mockResolvedValue({ succeeded: [], failed: [] }) }))

  beforeEach(() => {
    vi.clearAllMocks()
    mockNavigate.mockClear()

    mockedApi.useGetAccountMappingsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: undefined,
      refetch: mockRefetch,
    })
    mockedApi.useValidateAccountMappingsQuery.mockReturnValue({
      data: {
        isValid: true,
        missingMappings: [],
        configuredMappings: [],
      },
      refetch: mockRefetch,
    })
    mockedApi.useGetPaymentMethodsQuery.mockReturnValue({
      data: {
        data: [],
        meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
      },
    })
    mockedApi.useGetChartOfAccountsQuery.mockReturnValue({
      data: {
        data: [],
        meta: { page: 1, limit: 100, total: 0, totalPages: 0 },
      },
      isLoading: false,
    })
    mockedApi.useCreateAccountMappingMutation.mockReturnValue([mockCreateMapping])
    mockedApi.useUpdateAccountMappingMutation.mockReturnValue([mockUpdateMapping])
    mockedApi.useDeleteAccountMappingMutation.mockReturnValue([mockDeleteMapping])
    mockedApi.useGetJournalEntriesQuery.mockReturnValue({
      data: {
        data: [],
        meta: { page: 1, limit: 50, total: 0, totalPages: 0 },
      },
      isLoading: false,
      error: undefined,
      refetch: mockRefetch,
    })
    mockedApi.useLazyGetJournalEntryQuery.mockReturnValue([vi.fn().mockResolvedValue({})])
    mockedApi.useDeleteJournalEntryMutation.mockReturnValue([mockDeleteJournalEntry])
    mockedApi.usePostJournalEntryMutation.mockReturnValue([mockPostJournalEntry])
    mockedApi.useBulkPostJournalEntriesMutation.mockReturnValue([mockBulkPostJournalEntries])
    mockedApi.useBulkDeleteJournalEntriesMutation.mockReturnValue([mockBulkDeleteJournalEntries])
    mockedApi.useReverseJournalEntryMutation.mockReturnValue([vi.fn()])
  })

  describe('End-to-End User Flow: Configuring Account Mappings', () => {
    it('loads account mappings page successfully', async () => {
      mockedApi.useValidateAccountMappingsQuery.mockReturnValue({
        data: {
          isValid: false,
          missingMappings: ['sales_revenue', 'sales_ar'],
          configuredMappings: [],
        },
        refetch: mockRefetch,
      })

      renderWithRouter(<AccountMappingsPage />)

      await waitFor(() => {
        expect(screen.getByText('Account Mappings')).toBeInTheDocument()
      })
    })

    it('shows account mappings when configured', async () => {
      const configuredMappings = [
        {
          id: 'map1',
          mappingType: 'sales_revenue',
          accountId: 'acc1',
          isActive: true,
          account: { id: 'acc1', accountCode: '4000', accountName: 'Sales Revenue' },
        },
        {
          id: 'map2',
          mappingType: 'sales_ar',
          accountId: 'acc2',
          isActive: true,
          account: { id: 'acc2', accountCode: '1200', accountName: 'Accounts Receivable' },
        },
      ]

      mockedApi.useGetAccountMappingsQuery.mockReturnValue({
        data: configuredMappings,
        isLoading: false,
        error: undefined,
        refetch: mockRefetch,
      })

      renderWithRouter(<AccountMappingsPage />)

      await waitFor(() => {
        expect(screen.getByText('Sales Revenue')).toBeInTheDocument()
      })

      expect(screen.getByText('Accounts Receivable (Sales)')).toBeInTheDocument()
    })

    it('renders account mappings page without errors', async () => {
      renderWithRouter(<AccountMappingsPage />)

      await waitFor(() => {
        expect(screen.getByText('Account Mappings')).toBeInTheDocument()
      })

      expect(mockedApi.useGetAccountMappingsQuery).toHaveBeenCalled()
      expect(mockedApi.useValidateAccountMappingsQuery).toHaveBeenCalled()
    })
  })

  describe('Transaction to Journal Entry Navigation Flow', () => {
    it('navigates from AccountingEntryLink to Journal Entries page with filters', async () => {
      render(
        <BrowserRouter>
          <AccountingEntryLink sourceType="sales_order" sourceId="so-123" variant="button" />
        </BrowserRouter>
      )

      fireEvent.click(screen.getByText('View Journal Entry'))

      expect(mockNavigate).toHaveBeenCalledWith('/accounting/journal-entries?sourceType=sales_order&sourceId=so-123')
    })

    it('shows AccountingEntryLink in different variants', () => {
      const { rerender } = render(
        <BrowserRouter>
          <AccountingEntryLink sourceType="payment" sourceId="pay-456" variant="button" />
        </BrowserRouter>
      )

      expect(screen.getByText('View Journal Entry')).toBeInTheDocument()

      rerender(
        <BrowserRouter>
          <AccountingEntryLink sourceType="payment" sourceId="pay-456" variant="inline" />
        </BrowserRouter>
      )

      expect(screen.getByText('View Journal Entry')).toBeInTheDocument()

      rerender(
        <BrowserRouter>
          <AccountingEntryLink sourceType="payment" sourceId="pay-456" variant="alert" />
        </BrowserRouter>
      )

      expect(screen.getByText('Accounting Information')).toBeInTheDocument()
      expect(screen.getByText('This transaction has been posted to the accounting system.')).toBeInTheDocument()
    })
  })

  describe('Journal Entry List with Auto-Posted Entries', () => {
    const mockJournalEntries = [
      {
        id: 'je-1',
        referenceNumber: 'JE-2026-001',
        entryDate: '2026-02-01',
        description: 'Manual entry',
        sourceType: null,
        sourceId: null,
        status: JournalEntryStatus.DRAFT,
        totalDebits: 1000,
        totalCredits: 1000,
      },
      {
        id: 'je-2',
        referenceNumber: 'JE-2026-002',
        entryDate: '2026-02-02',
        description: 'Sales order SO-123 fulfillment',
        sourceType: 'sales_order',
        sourceId: 'so-123',
        status: JournalEntryStatus.POSTED,
        totalDebits: 5000,
        totalCredits: 5000,
      },
      {
        id: 'je-3',
        referenceNumber: 'JE-2026-003',
        entryDate: '2026-02-03',
        description: 'Customer payment PAY-456',
        sourceType: 'payment',
        sourceId: 'pay-456',
        status: JournalEntryStatus.POSTED,
        totalDebits: 3000,
        totalCredits: 3000,
      },
    ]

    beforeEach(() => {
      mockedApi.useGetJournalEntriesQuery.mockReturnValue({
        data: {
          data: mockJournalEntries,
          meta: { page: 1, limit: 50, total: 3, totalPages: 1 },
        },
        isLoading: false,
        error: undefined,
        refetch: mockRefetch,
      })
    })

    it('displays all entries as reference numbers in the list', async () => {
      renderJournalEntriesPage()

      await waitFor(() => {
        expect(screen.getByText('JE-2026-001')).toBeInTheDocument()
        expect(screen.getByText('JE-2026-002')).toBeInTheDocument()
        expect(screen.getByText('JE-2026-003')).toBeInTheDocument()
      })
    })

    it('shows source link in context header when an auto-posted entry is selected', async () => {
      const user = createUser()

      renderJournalEntriesPage()

      await waitFor(() => {
        expect(screen.getByText('JE-2026-002')).toBeInTheDocument()
      })

      await user.click(screen.getByText('JE-2026-002'))

      await waitFor(() => {
        expect(screen.getByText('View Sales Order')).toBeInTheDocument()
      })
    })

    it('navigates to source transaction when clicking source link in context header', async () => {
      const user = createUser()

      renderJournalEntriesPage()

      await waitFor(() => {
        expect(screen.getByText('JE-2026-002')).toBeInTheDocument()
      })

      await user.click(screen.getByText('JE-2026-002'))

      await waitFor(() => {
        expect(screen.getByText('View Sales Order')).toBeInTheDocument()
      })

      await user.click(screen.getByText('View Sales Order'))

      expect(mockNavigate).toHaveBeenCalledWith('/sales/orders?highlight=so-123')
    })
  })

  describe('Validation Warning Component', () => {
    it('renders AccountMappingWarning component without errors when mappings are valid', () => {
      const { container } = render(
        <BrowserRouter>
          <AccountMappingWarning context="system" />
        </BrowserRouter>
      )

      expect(container).toBeTruthy()
    })

    it('can render transaction-specific warning component when mappings are invalid', () => {
      mockedApi.useValidateAccountMappingsQuery.mockReturnValue({
        data: {
          isValid: false,
          missingMappings: ['sales_revenue'],
          configuredMappings: [],
        },
        refetch: mockRefetch,
      })

      render(
        <BrowserRouter>
          <AccountMappingWarning context="transaction" action="complete this sale" />
        </BrowserRouter>
      )

      expect(screen.getByText(/accounting entry will not be created automatically/i)).toBeInTheDocument()
    })
  })

  describe('Journal Entry Filtering', () => {
    it('filters journal entries by source type', async () => {
      mockedApi.useGetJournalEntriesQuery.mockReturnValue({
        data: {
          data: [
            {
              id: 'je-1',
              referenceNumber: 'JE-2026-001',
              entryDate: '2026-02-01',
              description: 'Sales order entry',
              sourceType: 'sales_order',
              sourceId: 'so-123',
              status: JournalEntryStatus.POSTED,
              totalDebits: 5000,
              totalCredits: 5000,
            },
          ],
          meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
        },
        isLoading: false,
        error: undefined,
        refetch: mockRefetch,
      })

      renderJournalEntriesPage()

      await waitFor(() => {
        expect(screen.getByText('JE-2026-001')).toBeInTheDocument()
      })

      expect(mockedApi.useGetJournalEntriesQuery).toHaveBeenCalled()
    })

    it('handles URL query parameters for filtering (sourceType and sourceId)', async () => {
      renderJournalEntriesPage('/accounting/journal-entries?sourceType=sales_order&sourceId=so-123')

      await waitFor(() => {
        expect(screen.getByText('Journal Entries')).toBeInTheDocument()
      })

      expect(mockedApi.useGetJournalEntriesQuery).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceType: 'sales_order',
          sourceId: 'so-123',
        }),
      )
    })
  })
})
