import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'

import SettlementsPage from '../SettlementsPage'
import accountingReducer, { selectSelectedSettlement } from '@/store/slices/accountingSlice'

const mocked = vi.hoisted(() => ({
  showSuccess: vi.fn(),
  showError: vi.fn(),
  useGetSettlementsQuery: vi.fn(),
  useGetPendingSettlementSummaryQuery: vi.fn(),
  useCreateSettlementMutation: vi.fn(),
  useCancelSettlementMutation: vi.fn(),
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
  return { ...actual, formatCurrency: (value: number) => `$${value}`, formatDate: (value: string) => value }
})
vi.mock('@/store/api/accountingApi', () => mocked)
vi.mock('@/components/accounting/CreateSettlementDialog', () => ({ default: () => null }))

function makeStore() {
  return configureStore({ reducer: { accounting: accountingReducer } })
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
      data: {
        data: [{
          id: 's-1',
          settlementNumber: 'SET-001',
          paymentMethod: { name: 'Cash' },
          settlementDate: '2026-02-26',
          totalAmount: 120,
          paymentCount: 1,
          reference: 'ref',
          notes: null,
          status: 'completed',
        }],
      },
      isLoading: false,
      refetch: vi.fn(),
    })
    mocked.useGetPendingSettlementSummaryQuery.mockReturnValue({})
    mocked.useCreateSettlementMutation.mockReturnValue([vi.fn()])
    mocked.useCancelSettlementMutation.mockReturnValue([vi.fn()])
  })

  it('renders title and settlement row', () => {
    renderPage()
    expect(screen.getByText('Settlements')).toBeInTheDocument()
    expect(screen.getAllByText('SET-001')).toHaveLength(2)
  })

  it('renders create action', () => {
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
