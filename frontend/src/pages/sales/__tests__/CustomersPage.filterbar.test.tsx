import { render, screen } from '@testing-library/react'
import { configureStore } from '@reduxjs/toolkit'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { salesApiSlice } from '@/store/api/salesApi'
import salesReducer from '@/store/slices/salesSlice'

import CustomersPage from '../CustomersPage'

const { useGetCustomersQuery } = vi.hoisted(() => ({
  useGetCustomersQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0, page: 1, limit: 25 } },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/salesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/salesApi')>()
  return {
    ...actual,
    useGetCustomersQuery,
    useUpdateCustomerMutation: vi.fn(() => [vi.fn(), {}]),
  }
})

vi.mock('@/store/api/priceListApi', () => ({
  useGetPriceListsQuery: vi.fn(() => ({ data: { data: [] } })),
}))

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('../components/CustomerList', () => ({
  default: () => <div data-testid="customer-list" />,
}))

function makeStore() {
  return configureStore({
    reducer: {
      sales: salesReducer,
      [salesApiSlice.reducerPath]: salesApiSlice.reducer,
    },
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware().concat(salesApiSlice.middleware),
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

describe('CustomersPage filterbar', () => {
  beforeEach(() => {
    useGetCustomersQuery.mockReturnValue({
      data: { data: [], meta: { total: 0, page: 1, limit: 25 } },
      isLoading: false,
      isFetching: false,
      refetch: vi.fn(),
    })
  })

  it('renders the page with filter bar', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by name or phone/i)).toBeInTheDocument()
  })

  it('renders the CustomerList', () => {
    renderPage()
    expect(screen.getByTestId('customer-list')).toBeInTheDocument()
  })

  it('renders pagination', () => {
    renderPage()
    expect(screen.getByText(/showing/i)).toBeInTheDocument()
  })
})
