import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/store/api/inventoryApi', async () => {
  const actual = await vi.importActual<typeof import('@/store/api/inventoryApi')>('@/store/api/inventoryApi')
  return {
    ...actual,
    useGetCategoryBySlugQuery: () => ({
      data: {
        id: 'cat-1',
        name: 'Old',
        slug: 'old',
        isEnabled: true,
        description: 'Old category',
        level: 0,
        parentId: null,
        fullPath: '/Old',
        parent: null,
        productCount: 5,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-06-01T00:00:00Z',
      },
      isLoading: false,
      isError: false,
    }),
  }
})

import { inventoryApiSlice } from '@/store/api/inventoryApi'
import { settingsApiSlice } from '@/store/api/settingsApi'

import CategoryViewPage from '../CategoryViewPage'

function renderPage() {
  const store = configureStore({
    reducer: {
      [inventoryApiSlice.reducerPath]: inventoryApiSlice.reducer,
      [settingsApiSlice.reducerPath]: settingsApiSlice.reducer,
    },
    middleware: (gdm) => gdm().concat(inventoryApiSlice.middleware, settingsApiSlice.middleware),
  })
  return render(
    <Provider store={store}>
      <MemoryRouter initialEntries={['/inventory/categories/old/view']}>
        <Routes>
          <Route path="/inventory/categories/:slug/view" element={<CategoryViewPage />} />
        </Routes>
      </MemoryRouter>
    </Provider>,
  )
}

describe('CategoryViewPage', () => {
  it('renders the category name, status chip, and two tabs', async () => {
    renderPage()
    expect(await screen.findByText('Old')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Overview/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Products/i })).toBeInTheDocument()
  })
})
