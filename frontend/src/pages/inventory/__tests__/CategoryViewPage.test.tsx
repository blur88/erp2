import { configureStore } from '@reduxjs/toolkit'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { BrowserRouter, MemoryRouter, Route, Routes, useLocation  } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi  } from 'vitest'

const CATEGORY = vi.hoisted(() => ({
  id: 'cat-1',
  name: 'Old',
  slug: 'old',
  isEnabled: true,
  description: 'Old category',
  level: 1,
  parentId: 'cat-parent',
  fullPath: 'Root > Old',
  parent: { id: 'cat-parent', name: 'Root Cat', slug: 'root-cat' },
  productCount: 5,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-06-01T00:00:00Z',
}))

vi.mock('@/store/api/inventoryApi', async () => {
  const actual = await vi.importActual<typeof import('@/store/api/inventoryApi')>('@/store/api/inventoryApi')
  return {
    ...actual,
    useGetCategoryBySlugQuery: () => ({ data: CATEGORY, isLoading: false, isError: false }),
  }
})

import { inventoryApiSlice } from '@/store/api/inventoryApi'
import { settingsApiSlice } from '@/store/api/settingsApi'
import { formatDate } from '@/utils/formatters'

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
  // jsdom persists window.location across cases; BrowserRouter tests below
  // read it, so reset between tests (#1131 review).
  beforeEach(() => {
    window.history.replaceState(null, '', '/')
  })

  it('renders the category name, status chip, and two tabs', async () => {
    renderPage()
    expect(await screen.findByText('Old')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Overview/i })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Products/i })).toBeInTheDocument()
  })

  it('renders the three overview card headings', async () => {
    renderPage()
    expect(await screen.findByText('Hierarchy')).toBeInTheDocument()
    expect(screen.getByText('Details')).toBeInTheDocument()
    expect(screen.getByText('Metadata')).toBeInTheDocument()
  })

  it('renders representative field values', async () => {
    renderPage()
    expect(await screen.findByText('Root > Old')).toBeInTheDocument()
    expect(screen.getByText('Level 1')).toBeInTheDocument()
    expect(screen.getByText('Root Cat')).toBeInTheDocument()
    expect(screen.getByText('Old category')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
  })

  it('formats created/updated dates via formatDate (respects locale setting)', async () => {
    renderPage()
    expect(await screen.findByText(formatDate(CATEGORY.createdAt))).toBeInTheDocument()
    expect(screen.getByText(formatDate(CATEGORY.updatedAt))).toBeInTheDocument()
  })

  it('preserves other query params when the tab changes', async () => {
    function LocationProbe() {
      const location = useLocation()
      return <span data-testid="probe-search">{location.search}</span>
    }

    const store = configureStore({
      reducer: {
        [inventoryApiSlice.reducerPath]: inventoryApiSlice.reducer,
        [settingsApiSlice.reducerPath]: settingsApiSlice.reducer,
      },
      middleware: (gdm) => gdm().concat(inventoryApiSlice.middleware, settingsApiSlice.middleware),
    })
    window.history.replaceState(null, '', '/inventory/categories/old/view?tab=0&probe=keepme')
    render(
      <Provider store={store}>
        <BrowserRouter>
          <Routes>
            <Route path="/inventory/categories/:slug/view" element={<CategoryViewPage />} />
          </Routes>
          <LocationProbe />
        </BrowserRouter>
      </Provider>,
    )

    const user = userEvent.setup()
    const tabs = await screen.findAllByRole('tab')
    await user.click(tabs[1])

    const search = screen.getByTestId('probe-search').textContent ?? ''
    expect(new URLSearchParams(search).get('probe')).toBe('keepme')
    expect(new URLSearchParams(search).get('tab')).toBe('1')
  })
})
