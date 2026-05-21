import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'

import SettlementsPage from '../SettlementsPage'
import accountingReducer, { selectSelectedSettlement } from '@/store/slices/accountingSlice'
import authReducer from '@/store/slices/authSlice'

const mocked = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  useGetSettlementsQuery: vi.fn(),
  useGetPendingSettlementSummaryQuery: vi.fn(),
  useCreateSettlementMutation: vi.fn(),
  useUpdateSettlementMutation: vi.fn(),
  usePostSettlementMutation: vi.fn(),
  useReverseSettlementMutation: vi.fn(),
  useDeleteSettlementMutation: vi.fn(),
  useRestoreSettlementMutation: vi.fn(),
  usePermanentDeleteSettlementMutation: vi.fn(),
  useGetDeletedSettlementsQuery: vi.fn(),
  useLazyGetSettlementQuery: vi.fn(),
  useLazyGetJournalEntriesQuery: vi.fn(),
}))

const mockNavigate = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => ({ search: '', pathname: '/accounting/settlements', state: null }),
  }
})

vi.mock('@/hooks/useNotification', () => ({ useNotification: () => ({ showSuccess: mocked.showSuccess, showError: mocked.showError }) }))
vi.mock('@/utils/dateRange', () => ({ getPeriodDateRange: () => ({ from: undefined, to: undefined }), getStartOfWeek: () => 0 }))
vi.mock('@/utils/formatters', async () => {
  const actual = await vi.importActual<typeof import('@/utils/formatters')>('@/utils/formatters')
  return { ...actual, formatCurrency: (value: number) => `$${value}`, formatDate: (value: string) => value, getCurrentDate: () => '2026-05-21' }
})
vi.mock('@/store/api/accountingApi', () => mocked)
vi.mock('@/components/accounting/CreateSettlementDialog', () => ({ default: () => null }))
vi.mock('@/components/accounting/DeletedSettlementsDialog', () => ({ default: () => null }))

const mockSettlement = {
  id: 's-1',
  settlementNumber: 'SET-001',
  paymentMethodId: 'pm-1',
  paymentMethod: { id: 'pm-1', code: 'SHOPEE', name: 'Shopee' },
  settlementDate: '2026-02-26',
  totalAmount: 120,
  paymentCount: 1,
  reference: 'ref',
  notes: null,
  status: 'draft' as const,
  deletedAt: null,
  createdAt: '2026-02-26T00:00:00Z',
  updatedAt: '2026-02-26T00:00:00Z',
}

function makeStore() {
  return configureStore({
    reducer: { accounting: accountingReducer, auth: authReducer },
    preloadedState: {
      auth: {
        user: {
          id: 'u-1',
          username: 'manager',
          email: 'manager@example.com',
          firstName: 'Manager',
          lastName: 'User',
          role: 'manager',
          status: 'active',
          isActive: true,
          failedLoginAttempts: 0,
          createdAt: '2026-05-21T00:00:00Z',
          updatedAt: '2026-05-21T00:00:00Z',
        },
        accessToken: null,
        refreshToken: null,
        isAuthenticated: true,
        loading: false,
        error: null,
        lastActivityTime: null,
        inactivityTimeoutMinutes: 30,
        rememberMe: false,
      },
    },
  })
}

function renderPage(initialUrl = '/accounting/settlements') {
  const store = makeStore()
  const view = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <SettlementsPage />
      </MemoryRouter>
    </Provider>,
  )
  return { ...view, store }
}

describe('SettlementsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocked.useGetSettlementsQuery.mockReturnValue({
      data: { data: [mockSettlement] },
      isLoading: false,
      refetch: vi.fn(),
    })
    mocked.useGetPendingSettlementSummaryQuery.mockReturnValue({})
    mocked.useCreateSettlementMutation.mockReturnValue([vi.fn(), {}])
    mocked.useUpdateSettlementMutation.mockReturnValue([vi.fn(), { isLoading: false }])
    mocked.usePostSettlementMutation.mockReturnValue([vi.fn()])
    mocked.useReverseSettlementMutation.mockReturnValue([vi.fn()])
    mocked.useDeleteSettlementMutation.mockReturnValue([vi.fn()])
    mocked.useRestoreSettlementMutation.mockReturnValue([vi.fn()])
    mocked.usePermanentDeleteSettlementMutation.mockReturnValue([vi.fn()])
    mocked.useGetDeletedSettlementsQuery.mockReturnValue({ data: [] })
    mocked.useLazyGetSettlementQuery.mockReturnValue([vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue(mockSettlement) })])
    mocked.useLazyGetJournalEntriesQuery.mockReturnValue([vi.fn().mockReturnValue({ unwrap: vi.fn().mockResolvedValue({ data: [] }) })])
  })

  it('renders title and settlement row', () => {
    renderPage()
    expect(screen.getByText('Settlements')).toBeInTheDocument()
    expect(screen.getAllByText('SET-001')).toHaveLength(2)
  })

  it('renders create action for managers', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Create Settlement' })).toBeInTheDocument()
  })

  it('auto-selects the settlement matching the ?highlight= URL param', async () => {
    const { store } = renderPage('/accounting/settlements?highlight=s-1')
    await waitFor(() => {
      expect(selectSelectedSettlement(store.getState())?.id).toBe('s-1')
    })
  })
})
