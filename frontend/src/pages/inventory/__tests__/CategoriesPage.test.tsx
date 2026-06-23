import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import CategoriesPage from '../CategoriesPage'

vi.mock('@/store/api/inventoryApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/inventoryApi')>()
  return {
    ...actual,
    useGetCategoriesQuery: () => ({
      data: [],
      isLoading: false,
      isFetching: false,
      error: undefined,
      refetch: vi.fn(),
    }),
  }
})

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  }
})

vi.mock('../components/CategoryList', () => ({ default: () => <div>CategoryList</div> }))

function renderPage() {
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <CategoriesPage />
      </MemoryRouter>
    </Provider>,
  )
}

describe('CategoriesPage', () => {
  it('renders New Category action and no View Deleted', async () => {
    renderPage()
    expect(await screen.findByText('New Category')).toBeInTheDocument()
    expect(screen.queryByText(/View Deleted/i)).not.toBeInTheDocument()
  })
})
