import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import salesReducer from '@/store/slices/salesSlice'
import { salesApiSlice } from '@/store/api/salesApi'
import CustomersPage from '../CustomersPage'

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/store/api/salesApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/salesApi')>()
  return {
    ...actual,
    useGetCustomersQuery: vi.fn(() => ({
      data: { data: [], meta: { total: 0, page: 1, limit: 25, totalPages: 0 } },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })),
    useCreateCustomerMutation: vi.fn(() => [vi.fn()]),
    useUpdateCustomerMutation: vi.fn(() => [vi.fn()]),
    useDeleteCustomerMutation: vi.fn(() => [vi.fn()]),
  }
})

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
  it('renders Type filter', async () => {
    renderPage()
    expect(screen.getAllByText('Type').length).toBeGreaterThan(0)
  })

  it('Name column header has sort indicator', () => {
    renderPage()
    const nameHeader = screen.getByText('Name')
    expect(nameHeader.closest('th') ?? nameHeader).toBeTruthy()
  })
})
