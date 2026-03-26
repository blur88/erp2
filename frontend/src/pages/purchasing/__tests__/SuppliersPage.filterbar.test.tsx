import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import SuppliersPage from '../SuppliersPage'
import purchasingReducer from '@/store/slices/purchasingSlice'

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
    useCreateSupplierMutation: vi.fn(() => [vi.fn(), {}]),
    useDeleteSupplierMutation: vi.fn(() => [vi.fn(), {}]),
    useUpdateSupplierMutation: vi.fn(() => [vi.fn(), {}]),
    useLazyCheckDuplicateCompanyNameQuery: vi.fn(() => [vi.fn(), {}]),
  }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

vi.mock('@/components/purchasing/DeletedSuppliersDialog', () => ({
  default: () => <div>DeletedSuppliersDialog</div>,
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({ reducer: { purchasing: purchasingReducer } })

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
    renderPage('/?search=acme&status=inactive&type=international')
    expect(useGetSuppliersQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'acme', isActive: false, type: 'international' }),
    )
  })

  it('passes no isActive when status is unset', () => {
    renderPage('/')
    expect(useGetSuppliersQuery).toHaveBeenLastCalledWith(
      expect.not.objectContaining({ isActive: expect.anything() }),
    )
  })
})
