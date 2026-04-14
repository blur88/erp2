import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import CategoriesPage from '../CategoriesPage'
import inventoryReducer from '@/store/slices/inventorySlice'

const { useGetCategoriesQuery } = vi.hoisted(() => ({
  useGetCategoriesQuery: vi.fn(() => ({
    data: [],
    isFetching: false,
    refetch: vi.fn(),
  })),
}))

vi.mock('@/store/api/inventoryApi', () => ({
  useGetCategoriesQuery,
  useCreateCategoryMutation: vi.fn(() => [vi.fn()]),
  useUpdateCategoryMutation: vi.fn(() => [vi.fn()]),
  useDeleteCategoryMutation: vi.fn(() => [vi.fn()]),
}))

vi.mock('../components/CategoryList', () => ({ default: () => <div>CategoryList</div> }))
vi.mock('../components/CategoryContextHeader', () => ({ default: () => <div>CategoryContextHeader</div> }))
vi.mock('../components/CategoryWorkspaceCard', () => ({ default: () => <div>CategoryWorkspaceCard</div> }))
vi.mock('../components/CategoryDialogs', () => ({ default: () => <div>CategoryDialogs</div> }))
vi.mock('../hooks/useCategoriesActions', () => ({
  useCategoriesActions: () => ({
    handleAddCategory: vi.fn(),
    handleEditCategory: vi.fn(),
    handleDeleteCategory: vi.fn(),
    handleConfirmDelete: vi.fn(),
    handleCancelDelete: vi.fn(),
    handleSmartDelete: vi.fn(),
    handleSmartDeleteClose: vi.fn(),
    onSubmit: vi.fn(),
  }),
}))
vi.mock('../hooks/useCategoriesSelection', () => ({
  useCategoriesSelection: () => ({
    handleCategorySelect: vi.fn(),
    handleNavigateUp: vi.fn(),
    handleNavigateDown: vi.fn(),
    handleNavigateToFirst: vi.fn(),
    handleNavigateToLast: vi.fn(),
    handlePageUpNavigation: vi.fn(),
    handlePageDownNavigation: vi.fn(),
    handleEscapeAction: vi.fn(),
  }),
}))
vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

function renderPage(initialUrl = '/') {
  const store = configureStore({
    reducer: {
      inventory: inventoryReducer,
    },
  })

  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <CategoriesPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('CategoriesPage FilterBar integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useGetCategoriesQuery.mockReturnValue({
      data: [{ id: 'cat-1', name: 'Electronics', level: 0 }],
      isFetching: false,
      refetch: vi.fn(),
    })
  })

  it('renders the shared filter search input', () => {
    renderPage()
    expect(screen.getByPlaceholderText(/search categories by name/i)).toBeInTheDocument()
  })

  it('passes search from URL into the categories query', () => {
    renderPage('/?search=elect')
    expect(useGetCategoriesQuery).toHaveBeenLastCalledWith(
      expect.objectContaining({ search: 'elect' }),
    )
  })

  it('renders the category level filter', () => {
    renderPage()
    expect(screen.getAllByText('Level')[0]).toBeInTheDocument()
  })
})
