import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import PaymentsPage from '../PaymentsPage'
import salesReducer from '@/store/slices/salesSlice'

const { useGetPaymentsQuery } = vi.hoisted(() => ({
  useGetPaymentsQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/salesApi', () => ({
  useGetPaymentsQuery,
  useGetCustomersQuery: vi.fn(() => ({
    data: { data: [{ id: 'cust-1', name: 'Acme Corp' }], meta: { total: 1 } },
  })),
}))

vi.mock('@/store/api/accountingApi', () => ({
  useLazyGetJournalEntriesQuery: vi.fn(() => [vi.fn(), {}]),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/components/sales/DeletedPaymentsDialog', () => ({
  default: () => <div>DeletedPaymentsDialog</div>,
}))

vi.mock('@/components/print', () => ({
  PaymentReceiptPrint: () => <div>PaymentReceiptPrint</div>,
}))

function renderPage(initialUrl = '/', state?: unknown) {
  const store = configureStore({ reducer: { sales: salesReducer } })
  const url = new URL(initialUrl, 'http://localhost')

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[{ pathname: url.pathname, search: url.search, state }]}>
        <PaymentsPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('PaymentsPage FilterBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by payment number or customer/i)).toBeInTheDocument()
  })

  it('restores date range from URL and passes to query', () => {
    renderPage('/?paymentDate_from=2026-01-01&paymentDate_to=2026-03-31')
    expect(useGetPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ fromDate: '2026-01-01', toDate: '2026-03-31' }),
    )
  })

  it('presets customerId from URL when navigated from customer profile', () => {
    renderPage('/?customerId=cust-1')
    expect(useGetPaymentsQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ customerId: 'cust-1' }),
    )
  })

  it('renders locked chip (no × button) when customerId is preset via location state', () => {
    renderPage('/', { customerId: 'cust-1' })
    const chip = screen.getByText(/customer: acme corp/i)
    expect(chip).toBeInTheDocument()
    const chipEl = chip.closest('[class*="MuiChip"]')
    expect(chipEl?.querySelector('[data-testid="CancelIcon"]')).not.toBeInTheDocument()
  })
})
