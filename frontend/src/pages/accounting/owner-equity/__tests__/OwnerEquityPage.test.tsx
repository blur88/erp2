import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import type { OwnerEquityDocument } from '@/types'

import OwnerEquityPage from '../OwnerEquityPage'

const { mockNavigate, mockRows } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
  mockRows: [
    {
      id: 'eq-1',
      referenceNumber: 'EQ-26-001',
      equityDate: '2026-08-01',
      type: 'CAPITAL_INJECTION',
      description: 'Initial capital contribution',
      notes: null,
      documentStatus: 'COMPLETED',
      settlementStatus: 'SETTLED',
      totalAmount: '5000.0000',
      settledAmount: '5000.0000',
      balance: '0.0000',
      productId: null,
      quantity: null,
      unitCost: null,
      totalCost: null,
      completedAt: '2026-08-02T00:00:00Z',
      completedBy: null,
      createdAt: '2026-08-01T00:00:00Z',
      updatedAt: '2026-08-02T00:00:00Z',
      settlements: [],
      product: null,
    },
  ] as OwnerEquityDocument[],
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => mockNavigate }
})

vi.mock('@/store/api/accountingApi', () => ({
  useGetOwnerEquityListQuery: vi.fn().mockReturnValue({
    data: { data: mockRows, meta: { total: 1, page: 1, limit: 25 } },
    isFetching: false,
    error: undefined,
  }),
  useGetOwnerEquityQuery: vi.fn().mockReturnValue({ data: undefined, isFetching: false }),
  useCreateOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useUpdateOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useCompleteOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useUncompleteOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useCancelOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useUncancelOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useSettleOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
  useRefundOwnerEquityMutation: vi.fn().mockReturnValue([vi.fn(), { isLoading: false }]),
}))

vi.mock('@/store/api/paymentMethodsApi', () => ({
  useGetActivePaymentMethodsForPurchasesQuery: () => ({ data: [] }),
  // Capital Injection accepts any active method, Cash Drawing only
  // purchase-enabled ones — both hooks are mounted, one is always skipped.
  useGetActivePaymentMethodsQuery: () => ({ data: [] }),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

import { useGetOwnerEquityListQuery } from '@/store/api/accountingApi'

function renderPage() {
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/accounting/owner-equity']}>
        <OwnerEquityPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('OwnerEquityPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('navigates to the detail route on row click', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByText('EQ-26-001'))
    expect(mockNavigate).toHaveBeenCalledWith('/accounting/owner-equity/EQ-26-001/view')
  })

  it('renders the reference number and description', () => {
    renderPage()
    expect(screen.getByText('EQ-26-001')).toBeInTheDocument()
    expect(screen.getByText('Initial capital contribution')).toBeInTheDocument()
  })

  it('renders type, document status and settlement status chips', () => {
    renderPage()
    expect(screen.getByText('Capital Injection')).toBeInTheDocument()
    expect(screen.getByText('Completed')).toBeInTheDocument()
    expect(screen.getByText('Settled')).toBeInTheDocument()
  })

  it('offers "+ New Owner Equity" primary action', () => {
    renderPage()
    expect(screen.getByText('+ New Owner Equity')).toBeInTheDocument()
  })

  it('requests referenceNumber descending by default', () => {
    renderPage()
    const calls = vi.mocked(useGetOwnerEquityListQuery).mock.calls
    expect(calls[calls.length - 1][0]).toMatchObject({
      sortBy: 'referenceNumber',
      sortOrder: 'DESC',
    })
  })
})
