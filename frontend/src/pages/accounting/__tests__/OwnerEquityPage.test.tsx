import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import OwnerEquityPage from '../OwnerEquityPage'
import ownerEquityReducer from '@/store/slices/ownerEquitySlice'
import paymentMethodsReducer from '@/store/slices/paymentMethodsSlice'
import { ApiService } from '@/services/api'

vi.mock('@/services/api', () => ({
  ApiService: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: vi.fn(),
    showError: vi.fn(),
  }),
}))

vi.mock('@/hooks/useSearchAndFilter', async () => {
  const actual = await vi.importActual('@/hooks/useSearchAndFilter')
  return {
    ...actual,
    useKeyboardShortcuts: vi.fn(),
  }
})

const createMockStore = () =>
  configureStore({
    reducer: {
      ownerEquity: ownerEquityReducer,
      paymentMethods: paymentMethodsReducer,
    },
  })

const renderPage = () => {
  const store = createMockStore()
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <OwnerEquityPage />
      </BrowserRouter>
    </Provider>,
  )
}

describe('OwnerEquityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ApiService.get).mockImplementation((url: string) => {
      if (url.includes('/accounting/owner-equity')) {
        return Promise.resolve({
          data: [
            {
              id: 'tx-1',
              referenceNumber: 'EQ-001',
              transactionDate: '2026-02-15',
              type: 'capital_injection',
              amount: 500,
              paymentMethodId: 'pm-1',
              paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
              description: 'Initial owner capital',
              status: 'draft',
              createdAt: '2026-02-15',
              updatedAt: '2026-02-15',
            },
          ],
          meta: { page: 1, limit: 100, total: 1, totalPages: 1 },
        } as any)
      }

      if (url.includes('/settings/payment-methods')) {
        return Promise.resolve({
          data: [{ id: 'pm-1', code: 'CASH', name: 'Cash', isActive: true }],
          meta: { page: 1, limit: 200, total: 1, totalPages: 1 },
        } as any)
      }

      return Promise.resolve({ data: [], meta: {} } as any)
    })
  })

  it('renders the page title', async () => {
    renderPage()
    expect(screen.getByText("Owner's Equity Transactions")).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('EQ-001')).toBeInTheDocument()
    })
  })

  it('shows loading state', () => {
    vi.mocked(ApiService.get).mockImplementation(() => new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('displays transaction data in table', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('EQ-001')).toBeInTheDocument()
    })

    expect(screen.getByText('Capital Injection')).toBeInTheDocument()
    expect(screen.getByText('Initial owner capital')).toBeInTheDocument()
    expect(screen.getByText('Cash')).toBeInTheDocument()
  })

  it('shows filter controls', () => {
    renderPage()

    expect(screen.getAllByText('Type').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument()
    expect(screen.getByLabelText('End Date')).toBeInTheDocument()
  })
})
