import { render, screen, fireEvent } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SuppliersPage from '../SuppliersPage'

const { useGetSuppliersQuery } = vi.hoisted(() => ({
  useGetSuppliersQuery: vi.fn(() => ({
    data: { data: [], meta: { total: 0 } },
    isLoading: false,
    isFetching: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/purchasingApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/purchasingApi')>()
  return {
    ...actual,
    useGetSuppliersQuery,
    useUpdateSupplierMutation: vi.fn(() => [vi.fn(), {}]),
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

vi.mock('../components/SupplierList', () => ({
  default: ({ suppliers, paginationSlot }: any) => (
    <div data-testid="supplier-list">
      {suppliers.map((supplier: any) => (
        <div key={supplier.id} data-testid={`supplier-item-${supplier.id}`}>
          {supplier.companyName}
        </div>
      ))}
      {paginationSlot}
    </div>
  ),
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({ reducer: { _noop: (state = {}) => state } })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <SuppliersPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('SuppliersPage FilterBar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search by company name/i)).toBeInTheDocument()
  })

  it('restores filters from URL and passes them to query', () => {
    renderPage('/?search=acme&status=inactive')
    expect(useGetSuppliersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'acme', isActive: false }),
    )
  })

  it('passes no isActive when status is unset', () => {
    renderPage('/')
    expect(useGetSuppliersQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ isActive: expect.anything() }),
    )
  })

  it('passes type=local to query when type filter is set', () => {
    renderPage('/?type=local')
    expect(useGetSuppliersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'local' }),
    )
  })

  it('does not pass type when type filter is unset', () => {
    renderPage('/')
    expect(useGetSuppliersQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ type: expect.anything() }),
    )
  })

  it('renders a Sort button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /sort/i })).toBeInTheDocument()
  })

  it('passes default sortBy=companyName and sortOrder=ASC to query', () => {
    renderPage()
    expect(useGetSuppliersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ sortBy: 'companyName', sortOrder: 'ASC' }),
    )
  })

  it('toggles sortOrder to DESC after clicking Sort, then back to ASC on second click', () => {
    renderPage()
    const sortButton = screen.getByRole('button', { name: /sort/i })

    fireEvent.click(sortButton)
    expect(useGetSuppliersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ sortBy: 'companyName', sortOrder: 'DESC' }),
    )

    fireEvent.click(sortButton)
    expect(useGetSuppliersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ sortBy: 'companyName', sortOrder: 'ASC' }),
    )
  })
})
