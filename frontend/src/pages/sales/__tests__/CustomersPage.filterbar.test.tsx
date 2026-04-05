import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CustomersPage from '../CustomersPage'
import salesReducer from '@/store/slices/salesSlice'

const { useGetCustomersQuery } = vi.hoisted(() => ({
  useGetCustomersQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
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
    useCreateCustomerMutation: vi.fn(() => [vi.fn(), {}]),
    useDeleteCustomerMutation: vi.fn(() => [vi.fn(), {}]),
    useUpdateCustomerMutation: vi.fn(() => [vi.fn(), {}]),
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/components/sales/DeletedCustomersDialog', () => ({
  default: () => <div>DeletedCustomersDialog</div>,
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({ reducer: { sales: salesReducer } })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <CustomersPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('CustomersPage FilterBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by name or phone/i)).toBeInTheDocument()
  })

  it('restores filters from URL and passes them to query', () => {
    renderPage('/?search=acme&status=active')
    expect(useGetCustomersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'acme', isActive: true }),
    )
  })

  it('passes no isActive when status is unset', () => {
    renderPage('/')
    expect(useGetCustomersQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ isActive: expect.anything() }),
    )
  })

  it('does not pass a limit override to the customers query', () => {
    renderPage('/')
    expect(useGetCustomersQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ limit: expect.anything() }),
    )
  })
})
