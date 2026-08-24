import { render, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'

import CategoriesPage from '../CategoriesPage'

const fixtureRef: { data: any[] } = { data: [] }
vi.mock('@/store/api/inventoryApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/inventoryApi')>()
  return {
    ...actual,
    useGetCategoriesQuery: () => ({
      data: fixtureRef.data, isLoading: false, isFetching: false, error: undefined, refetch: vi.fn(),
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

const listProps: { categories?: any[]; flat?: boolean; sortOrder?: string } = {}
vi.mock('../components/CategoryList', () => ({
  default: (props: any) => {
    listProps.categories = props.categories
    listProps.flat = props.flat
    listProps.sortOrder = props.sortOrder
    return <div data-testid="category-list" />
  },
}))

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

function makeCat(p: any) {
  return {
    id: p.id, name: p.name, slug: p.name.toLowerCase(), isEnabled: p.isEnabled ?? true,
    level: p.level ?? 0, parentId: p.parentId ?? null, fullPath: p.name,
    isRoot: (p.level ?? 0) === 0, hasChildren: false, isActive: true,
    createdAt: '', updatedAt: '', productCount: 0,
  }
}

const HARDWARE = makeCat({ id: 'h', name: 'Hardware', isEnabled: true, level: 0 })
const SCREWS = makeCat({ id: 's', name: 'Screws', parentId: 'h', isEnabled: false, level: 1 })
const PAINT = makeCat({ id: 'p', name: 'Paint', isEnabled: true, level: 0 })

describe('CategoriesPage', () => {
  it('renders New Category action and no View Deleted', async () => {
    renderPage()
    expect(await screen.findByText('New Category')).toBeInTheDocument()
    expect(screen.queryByText(/View Deleted/i)).not.toBeInTheDocument()
  })
})

describe('CategoriesPage status filter', () => {
  beforeEach(() => {
    fixtureRef.data = [HARDWARE, SCREWS, PAINT]
    listProps.categories = undefined
    listProps.flat = undefined
  })

  async function selectStatus(label: string) {
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('Status'))
    await user.click(await screen.findByRole('option', { name: label }))
  }

  it('Inactive shows only inactive rows and does not leak active ancestor', async () => {
    renderPage()
    await selectStatus('Inactive')
    const names = listProps.categories!.map((c) => c.name)
    expect(names).toEqual(['Screws'])
    expect(names).not.toContain('Hardware')
    expect(listProps.flat).toBe(true)
  })

  it('Active shows only active rows', async () => {
    renderPage()
    await selectStatus('Active')
    const names = listProps.categories!.map((c) => c.name).sort()
    expect(names).toEqual(['Hardware', 'Paint'])
    expect(listProps.categories!.map((c) => c.name)).not.toContain('Screws')
    expect(listProps.flat).toBe(true)
  })

  it('no status filter keeps ancestor injection (search keeps non-matching parent)', async () => {
    renderPage()
    const user = userEvent.setup()
    await user.type(screen.getByPlaceholderText('Search categories by name...'), 'Screws')
    await screen.findByTestId('category-list')
    await vi.waitFor(() => {
      const names = listProps.categories!.map((c) => c.name)
      expect(names).toContain('Screws')
      expect(names).toContain('Hardware')
    })
    expect(listProps.flat).toBe(false)
  })

  it('clearing the status filter restores tree behavior (flat=false)', async () => {
    renderPage()
    await selectStatus('Inactive')
    expect(listProps.flat).toBe(true)
    const user = userEvent.setup()
    await user.click(screen.getByLabelText('Status'))
    await user.click(await screen.findByRole('option', { name: 'All' }))
    await vi.waitFor(() => {
      expect(listProps.flat).toBe(false)
      const names = listProps.categories!.map((c) => c.name).sort()
      expect(names).toEqual(['Hardware', 'Paint', 'Screws'])
    })
  })
})

describe('CategoriesPage sort hydration', () => {
  beforeEach(() => {
    fixtureRef.data = [HARDWARE, SCREWS, PAINT]
    listProps.categories = undefined
    listProps.flat = undefined
    listProps.sortOrder = undefined
  })

  afterEach(() => {
    // useListUrlState hydrates from the live window.location, which jsdom
    // persists across tests in this file.
    window.history.replaceState(null, '', '/')
  })

  it('hydrates sort order from the URL', async () => {
    // The page sorts CLIENT-SIDE inside CategoryList (which this suite mocks),
    // so URL hydration is observable in the sortOrder prop handed to the list —
    // not in any query args. Descending ordering itself is covered by
    // CategoryList.flat.test.tsx ("flat mode honors descending order").
    window.history.replaceState(null, '', '/inventory/categories?sortOrder=desc')
    renderPage()

    await screen.findByTestId('category-list')
    expect(listProps.sortOrder).toBe('desc')
  })
})
