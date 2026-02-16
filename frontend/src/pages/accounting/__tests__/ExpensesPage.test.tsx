import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { Provider } from 'react-redux'
import { BrowserRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import ExpensesPage from '../ExpensesPage'
import expenseReducer from '@/store/slices/expenseSlice'
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
      expenses: expenseReducer,
      paymentMethods: paymentMethodsReducer,
    },
  })

const renderPage = () => {
  const store = createMockStore()
  return render(
    <Provider store={store}>
      <BrowserRouter>
        <ExpensesPage />
      </BrowserRouter>
    </Provider>,
  )
}

describe('ExpensesPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(ApiService.get).mockImplementation((url: string) => {
      if (url.includes('/accounting/expenses')) {
        return Promise.resolve({
          data: [
            {
              id: 'ex-1',
              referenceNumber: 'EXP-001',
              expenseDate: '2026-02-15',
              expenseAccountId: 'coa-1',
              expenseAccount: { id: 'coa-1', code: '6000', name: 'Office Supplies' },
              amount: 225.5,
              paymentMethodId: 'pm-1',
              paymentMethod: { id: 'pm-1', code: 'CASH', name: 'Cash' },
              vendor: 'Stationery Hub',
              description: 'Printer paper and ink',
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

      if (url.includes('/accounting/chart-of-accounts')) {
        return Promise.resolve({
          data: [{ id: 'coa-1', code: '6000', name: 'Office Supplies', type: 'EXPENSE', isActive: true }],
          meta: { page: 1, limit: 200, total: 1, totalPages: 1 },
        } as any)
      }

      return Promise.resolve({ data: [], meta: {} } as any)
    })
  })

  it('renders the page title', async () => {
    renderPage()
    expect(screen.getByText('Expenses')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('EXP-001')).toBeInTheDocument()
    })
  })

  it('shows loading state', () => {
    vi.mocked(ApiService.get).mockImplementation(() => new Promise(() => {}))
    renderPage()
    expect(screen.getByRole('progressbar')).toBeInTheDocument()
  })

  it('displays expense data in table', async () => {
    renderPage()

    await waitFor(() => {
      expect(screen.getByText('EXP-001')).toBeInTheDocument()
    })

    expect(screen.getByText('Stationery Hub')).toBeInTheDocument()
    expect(screen.getByText('Printer paper and ink')).toBeInTheDocument()
    expect(screen.getByText('6000 - Office Supplies')).toBeInTheDocument()
  })

  it('shows filter controls', () => {
    renderPage()

    expect(screen.getAllByText('Expense Account').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Payment Method').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Start Date')).toBeInTheDocument()
    expect(screen.getByLabelText('End Date')).toBeInTheDocument()
  })
})
