import { render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import { salesApiSlice } from '@/store/api/salesApi'
import salesReducer from '@/store/slices/salesSlice'

import CustomersPage from '../CustomersPage'

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('@/store/api/salesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/salesApi')>()
  return {
    ...actual,
    useGetCustomersQuery: vi.fn(() => ({
      data: { data: [], meta: { total: 0, page: 1, limit: 25 } },
      isLoading: false,
      isFetching: false,
      error: null,
    })),
    useUpdateCustomerMutation: vi.fn(() => [vi.fn(), {}]),
  }
})

vi.mock('@/store/api/priceListApi', () => ({
  useGetPriceListsQuery: vi.fn(() => ({ data: { data: [] } })),
}))

vi.mock('../components/CustomerList', () => ({
  default: ({ customers, total, paginationSlot }: any) => (
    <div data-testid="customer-list">
      <span data-testid="customer-count">{total}</span>
      {customers.map((c: any) => (
        <div key={c.id}>{c.name}</div>
      ))}
      {paginationSlot}
    </div>
  ),
}))

function makeStore() {
  return configureStore({
    reducer: {
      sales: salesReducer,
      [salesApiSlice.reducerPath]: salesApiSlice.reducer,
    },
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(salesApiSlice.middleware),
  })
}

function renderPage() {
  return render(
    <Provider store={makeStore()}>
      <MemoryRouter>
        <CustomersPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('CustomersPage filters', () => {
  it('renders the page title', () => {
    renderPage()
    expect(screen.getByText('Customers')).toBeInTheDocument()
  })

  it('renders the search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by name or phone/i)).toBeInTheDocument()
  })

  it('renders the Status filter', () => {
    renderPage()
    expect(screen.getAllByText('Status').length).toBeGreaterThan(0)
  })

  it('renders the Customer Type filter', () => {
    renderPage()
    expect(screen.getAllByText('Customer Type').length).toBeGreaterThan(0)
  })

  it('renders the Price List filter', () => {
    renderPage()
    expect(screen.getAllByText('Price List').length).toBeGreaterThan(0)
  })

  it('renders the CustomerList slot', () => {
    renderPage()
    expect(screen.getByTestId('customer-list')).toBeInTheDocument()
  })

  it('renders pagination controls', () => {
    renderPage()
    expect(screen.getByText(/showing/i)).toBeInTheDocument()
  })

  it('renders the New Customer button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /new customer/i })).toBeInTheDocument()
  })
})
