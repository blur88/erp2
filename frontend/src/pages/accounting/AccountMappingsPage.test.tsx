import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'

import AccountMappingsPage from './AccountMappingsPage'
import { MappingType } from '@/types/accountMapping'

const mockedApi = vi.hoisted(() => ({
  useGetAccountMappingsQuery: vi.fn(),
  useValidateAccountMappingsQuery: vi.fn(),
  useGetPaymentMethodsQuery: vi.fn(),
  useDeleteAccountMappingMutation: vi.fn(),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useGetAccountMappingsQuery: mockedApi.useGetAccountMappingsQuery,
  useValidateAccountMappingsQuery: mockedApi.useValidateAccountMappingsQuery,
  useGetPaymentMethodsQuery: mockedApi.useGetPaymentMethodsQuery,
  useDeleteAccountMappingMutation: mockedApi.useDeleteAccountMappingMutation,
}))

// Mock notification hook
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

// Mock keyboard shortcuts
vi.mock('@/hooks/useSearchAndFilter', async () => {
  const actual = await vi.importActual('@/hooks/useSearchAndFilter')
  return {
    ...actual,
    useKeyboardShortcuts: vi.fn(),
  }
})

// Mock the AccountMappingDialog component
vi.mock('@/components/accounting/AccountMappingDialog', () => ({
  default: ({ open }: any) =>
    open ? <div data-testid="account-mapping-dialog">Account Mapping Dialog</div> : null,
}))

const mockMappings = [
  {
    id: '1',
    mappingType: MappingType.SALES_REVENUE,
    accountId: 'acc-1',
    description: 'Sales revenue account',
    isActive: true,
    account: {
      id: 'acc-1',
      code: '4000',
      name: 'Sales Revenue',
      accountType: 'Revenue',
    },
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: '2',
    mappingType: MappingType.SALES_AR,
    accountId: 'acc-2',
    description: 'Accounts receivable',
    isActive: true,
    account: {
      id: 'acc-2',
      code: '1200',
      name: 'Accounts Receivable',
      accountType: 'Asset',
    },
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
]

const dynamicPaymentMapping = {
  id: 'dyn-1',
  mappingType: 'payment_custom',
  accountId: 'acc-9',
  description: 'Custom payment method mapping',
  isActive: true,
  account: {
    id: 'acc-9',
    code: '1170',
    name: 'Custom Receivable',
    accountType: 'Asset',
  },
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
}

const defaultValidationResult = {
  isValid: false,
  missingMappings: [],
  configuredMappings: [],
  totalRequired: 0,
  totalConfigured: 0,
}

const renderWithProviders = (ui: React.ReactElement) => {
  return render(<BrowserRouter>{ui}</BrowserRouter>)
}

describe('AccountMappingsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockedApi.useGetAccountMappingsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })
    mockedApi.useValidateAccountMappingsQuery.mockReturnValue({
      data: defaultValidationResult,
      refetch: vi.fn(),
    })
    mockedApi.useGetPaymentMethodsQuery.mockReturnValue({
      data: { data: [] },
    })
    mockedApi.useDeleteAccountMappingMutation.mockReturnValue([vi.fn()])
  })

  it('renders without crashing', async () => {
    renderWithProviders(<AccountMappingsPage />)
    await waitFor(() => {
      expect(screen.getByText('Account Mappings Configuration')).toBeInTheDocument()
    })
  })

  it('displays loading state', () => {
    mockedApi.useGetAccountMappingsQuery.mockReturnValue({
      data: [],
      isLoading: true,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithProviders(<AccountMappingsPage />)
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('displays validation warning when mappings incomplete', async () => {
    mockedApi.useGetAccountMappingsQuery.mockReturnValue({
      data: mockMappings,
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })
    mockedApi.useValidateAccountMappingsQuery.mockReturnValue({
      data: {
        isValid: false,
        isComplete: false,
        missingMappings: [MappingType.SALES_COGS, MappingType.SALES_INVENTORY],
        configuredMappings: [MappingType.SALES_REVENUE, MappingType.SALES_AR],
      },
      refetch: vi.fn(),
    })

    renderWithProviders(<AccountMappingsPage />)
    await waitFor(() => {
      expect(screen.getByText(/Configuration Incomplete/i)).toBeInTheDocument()
      expect(screen.getAllByText(/Cost of Goods Sold/i).length).toBeGreaterThan(0)
    })
  })

  it('displays success message when all mappings configured', async () => {
    mockedApi.useGetAccountMappingsQuery.mockReturnValue({
      data: mockMappings,
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })
    mockedApi.useValidateAccountMappingsQuery.mockReturnValue({
      data: {
        isValid: true,
        isComplete: true,
        missingMappings: [],
        configuredMappings: Object.values(MappingType),
      },
      refetch: vi.fn(),
    })

    renderWithProviders(<AccountMappingsPage />)
    await waitFor(() => {
      expect(screen.getByText(/All required account mappings are configured/i)).toBeInTheDocument()
    })
  })

  it('shows all fixed mapping types in table including equity mappings', async () => {
    mockedApi.useGetAccountMappingsQuery.mockReturnValue({
      data: mockMappings,
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithProviders(<AccountMappingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Sales Revenue')).toBeInTheDocument()
    })
    expect(screen.getByText('Accounts Receivable (Sales)')).toBeInTheDocument()
    expect(screen.getByText('Cost of Goods Sold')).toBeInTheDocument()
    expect(screen.getByText("Owner's Equity")).toBeInTheDocument()
    expect(screen.getByText('Owner Drawings')).toBeInTheDocument()
    expect(screen.getByText('Inventory Asset')).toBeInTheDocument()
  })

  it('opens dialog when clicking configure button for unmapped type', async () => {
    renderWithProviders(<AccountMappingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Account Mappings Configuration')).toBeInTheDocument()
    })

    const configureButtons = screen.getAllByRole('button', { name: /configure/i })
    fireEvent.click(configureButtons[0])

    await waitFor(() => {
      expect(screen.getByTestId('account-mapping-dialog')).toBeInTheDocument()
    })
  })

  it('renders clear action for configured mappings', async () => {
    mockedApi.useGetAccountMappingsQuery.mockReturnValue({
      data: mockMappings,
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithProviders(<AccountMappingsPage />)

    await waitFor(() => {
      expect(screen.getAllByRole('button', { name: /clear/i }).length).toBeGreaterThan(0)
    })
  })

  it('displays configured mappings with account details', async () => {
    mockedApi.useGetAccountMappingsQuery.mockReturnValue({
      data: mockMappings,
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithProviders(<AccountMappingsPage />)

    await waitFor(() => {
      expect(screen.getByText(/4000 - Sales Revenue/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/1200 - Accounts Receivable/i)).toBeInTheDocument()
  })

  it('displays "Not configured" chip for unmapped types', async () => {
    mockedApi.useGetAccountMappingsQuery.mockReturnValue({
      data: mockMappings,
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithProviders(<AccountMappingsPage />)

    await waitFor(() => {
      const notConfiguredChips = screen.getAllByText('Not configured')
      expect(notConfiguredChips.length).toBeGreaterThan(0)
    })
  })

  it('handles API errors gracefully', async () => {
    mockedApi.useGetAccountMappingsQuery.mockReturnValue({
      data: [],
      isLoading: false,
      error: { data: 'Failed to load account mappings' },
      refetch: vi.fn(),
    })

    renderWithProviders(<AccountMappingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Failed to load account mappings')).toBeInTheDocument()
    })
  })

  it('displays category chips for grouping', async () => {
    mockedApi.useGetAccountMappingsQuery.mockReturnValue({
      data: mockMappings,
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })

    renderWithProviders(<AccountMappingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Sales')).toBeInTheDocument()
    })
    expect(screen.getByText('Purchasing')).toBeInTheDocument()
    expect(screen.getByText('Payments')).toBeInTheDocument()
    expect(screen.getByText('Equity')).toBeInTheDocument()
    expect(screen.getByText('Inventory')).toBeInTheDocument()
  })

  it('shows dynamic payment mappings returned by API', async () => {
    mockedApi.useGetAccountMappingsQuery.mockReturnValue({
      data: [...mockMappings, dynamicPaymentMapping],
      isLoading: false,
      error: undefined,
      refetch: vi.fn(),
    })
    mockedApi.useGetPaymentMethodsQuery.mockReturnValue({
      data: {
        data: [{ code: 'CUSTOM', name: 'Custom', requiresSettlement: false }],
      },
    })

    renderWithProviders(<AccountMappingsPage />)

    await waitFor(() => {
      expect(screen.getByText('Custom Payment Account')).toBeInTheDocument()
    })
    expect(screen.getByText(/1170 - Custom Receivable/i)).toBeInTheDocument()
  })

  it('displays info alert about account mappings', async () => {
    renderWithProviders(<AccountMappingsPage />)

    await waitFor(() => {
      expect(screen.getByText(/About Account Mappings/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Account mappings define which GL accounts/i)).toBeInTheDocument()
  })
})
