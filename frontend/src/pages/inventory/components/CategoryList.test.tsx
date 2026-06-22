import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

import CategoryList from './CategoryList'

const mockSetCategoryEnabled = vi.fn()
vi.mock('@/store/api/inventoryApi', () => ({
  useSetCategoryEnabledMutation: () => [mockSetCategoryEnabled, { isLoading: false }],
}))

const cats = [
  { id: '1', name: 'Apparel', slug: 'apparel', level: 0, parentId: null, isEnabled: true, productCount: 3 },
  { id: '2', name: "Men's", slug: 'mens', level: 1, parentId: '1', isEnabled: false, productCount: 1 },
] as any

function renderList(props: Partial<React.ComponentProps<typeof CategoryList>> = {}) {
  return render(
    <MemoryRouter>
      <CategoryList
        categories={cats}
        sortBy="name"
        sortOrder="asc"
        onSort={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  )
}

describe('CategoryList', () => {
  it('renders rows with no Delete action and shows item counts', () => {
    renderList()
    expect(screen.getByText('Apparel')).toBeInTheDocument()
    expect(screen.getByText('3 items')).toBeInTheDocument()
    expect(screen.queryByText(/^Delete$/)).not.toBeInTheDocument()
  })
})
