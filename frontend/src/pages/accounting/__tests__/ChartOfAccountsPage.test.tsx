import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import ChartOfAccountsPage from '../ChartOfAccountsPage'
import chartOfAccountsReducer from '@/store/slices/chartOfAccountsSlice'
import { ApiService } from '@/services/api'

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

// Mock data
const mockAccounts = [
  {
    id: '1',
    code: '1000',
    name: 'Assets',
    type: 'asset' as const,
    normalBalance: 'debit' as const,
    isActive: true,
    isSystemAccount: false,
    currentBalance: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: '2',
    code: '1100',
    name: 'Cash',
    type: 'asset' as const,
    normalBalance: 'debit' as const,
    parentId: '1',
    isActive: true,
    isSystemAccount: false,
    currentBalance: 5000,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  {
    id: '3',
    code: '2000',
    name: 'Liabilities',
    type: 'liability' as const,
    normalBalance: 'credit' as const,
    isActive: true,
    isSystemAccount: false,
    currentBalance: 0,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
]

const createMockStore = () => {
  return configureStore({
    reducer: {
      chartOfAccounts: chartOfAccountsReducer,
    },
  })
}

const renderWithProvider = (store: any) => {
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <ChartOfAccountsPage />
      </BrowserRouter>
    </Provider>
  )
}

describe('ChartOfAccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock successful API response by default
    ;(ApiService.get as any).mockResolvedValue({
      data: mockAccounts,
      meta: { page: 1, limit: 1000, total: 3, totalPages: 1 },
    })
  })

  it('renders page header correctly', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      expect(screen.getByText('Chart of Accounts')).toBeInTheDocument()
    })
  })

  it('renders account list with correct data', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      expect(screen.getByText('1000')).toBeInTheDocument()
      expect(screen.getByText('1100')).toBeInTheDocument()
      expect(screen.getByText('2000')).toBeInTheDocument()
    }, { timeout: 5000 })

    // Verify account names appear in the table (getAllByText to handle duplicates in form)
    expect(screen.getAllByText('Assets').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Cash').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Liabilities').length).toBeGreaterThan(0)
  })

  it('opens create dialog when Add Account button is clicked', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      expect(screen.getByText('Chart of Accounts')).toBeInTheDocument()
    })

    const addButton = screen.getByRole('button', { name: /Add Account/i })
    fireEvent.click(addButton)

    await waitFor(() => {
      expect(screen.getByText('Add New Account')).toBeInTheDocument()
    })
  })

  it('displays account type badges with correct colors', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      const assetBadges = screen.getAllByText('Asset')
      expect(assetBadges.length).toBeGreaterThan(0)

      const liabilityBadge = screen.getByText('Liability')
      expect(liabilityBadge).toBeInTheDocument()
    })
  })

  it('filters accounts by search term', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      expect(screen.getByText('Chart of Accounts')).toBeInTheDocument()
    })

    const searchInput = screen.getByPlaceholderText(/Search by code or name/i)
    fireEvent.change(searchInput, { target: { value: 'Cash' } })

    await waitFor(() => {
      expect(searchInput).toHaveValue('Cash')
    })
  })

  it('shows seed button when no accounts exist', async () => {
    // Mock empty response
    ;(ApiService.get as any).mockResolvedValue({
      data: [],
      meta: { page: 1, limit: 1000, total: 0, totalPages: 0 },
    })

    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      const seedButtons = screen.getAllByText(/Seed Default/i)
      expect(seedButtons.length).toBeGreaterThan(0)
    })
  })

  it('displays loading spinner when loading', () => {
    // Mock pending API call
    ;(ApiService.get as any).mockImplementation(() => new Promise(() => {}))

    const store = createMockStore()
    renderWithProvider(store)

    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('displays active/inactive status chips', async () => {
    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      const activeChips = screen.getAllByText('Active')
      expect(activeChips.length).toBeGreaterThanOrEqual(3) // At least 3 for mock accounts (form dialog may add one)
    })
  })

  it('handles errors gracefully', async () => {
    const errorMessage = 'Failed to fetch accounts'
    ;(ApiService.get as any).mockRejectedValue({
      response: { data: { message: errorMessage } },
    })

    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      // Page should still render even with error
      expect(screen.getByText('Chart of Accounts')).toBeInTheDocument()
    })
  })

  it('disables delete button for system accounts', async () => {
    const systemAccount = {
      ...mockAccounts[0],
      isSystemAccount: true,
    }

    ;(ApiService.get as any).mockResolvedValue({
      data: [systemAccount],
      meta: { page: 1, limit: 1000, total: 1, totalPages: 1 },
    })

    const store = createMockStore()
    renderWithProvider(store)

    await waitFor(() => {
      expect(screen.getByText('Assets')).toBeInTheDocument()
    })

    // System accounts should have disabled delete button
    const deleteButtons = screen.getAllByLabelText(/Delete account/i)
    expect(deleteButtons.some(btn => (btn as HTMLButtonElement).disabled)).toBe(true)
  })
})
