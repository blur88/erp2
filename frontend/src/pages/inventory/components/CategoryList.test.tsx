import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import CategoryList from './CategoryList'

import type { Category } from '@/types'

const makeCategory = (id: string, name: string, level = 0): Category => ({
  id,
  name,
  level,
  fullPath: name,
  isRoot: level === 0,
  hasChildren: false,
  isActive: true,
  productCount: 0,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
})

describe('CategoryList', () => {
  it('shows the category count in the header', () => {
    render(
      <CategoryList
        categories={[makeCategory('1', 'Alpha'), makeCategory('2', 'Beta')]}
        loading={false}
        focusedIndex={-1}
        categoryListRef={{ current: null }}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByText('Categories (2)')).toBeInTheDocument()
  })

  it('shows skeleton rows when loading with no categories', () => {
    render(
      <CategoryList
        categories={[]}
        loading={true}
        focusedIndex={-1}
        categoryListRef={{ current: null }}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.queryByText(/no categories/i)).not.toBeInTheDocument()
  })

  it('shows empty state when not loading and no categories', () => {
    render(
      <CategoryList
        categories={[]}
        loading={false}
        focusedIndex={-1}
        categoryListRef={{ current: null }}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.getByText(/no categories found/i)).toBeInTheDocument()
  })

  it('does not show product count chip in rows', () => {
    const cat = makeCategory('1', 'Alpha')

    render(
      <CategoryList
        categories={[cat]}
        loading={false}
        focusedIndex={-1}
        categoryListRef={{ current: null }}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.queryByText(/item/i)).not.toBeInTheDocument()
  })

  it('does not show creation date in rows', () => {
    const cat = makeCategory('1', 'Alpha')

    render(
      <CategoryList
        categories={[cat]}
        loading={false}
        focusedIndex={-1}
        categoryListRef={{ current: null }}
        onSelect={vi.fn()}
      />,
    )

    expect(screen.queryByText(/2026/)).not.toBeInTheDocument()
  })

  it('calls onSelect when a row is clicked', async () => {
    const onSelect = vi.fn()
    const alpha = makeCategory('1', 'Alpha')

    render(
      <CategoryList
        categories={[alpha]}
        loading={false}
        focusedIndex={-1}
        categoryListRef={{ current: null }}
        onSelect={onSelect}
      />,
    )

    await userEvent.click(screen.getByText('Alpha'))
    expect(onSelect).toHaveBeenCalledWith(alpha)
  })

  it('highlights the selected category row', () => {
    const alpha = makeCategory('1', 'Alpha')

    render(
      <CategoryList
        categories={[alpha]}
        loading={false}
        selectedCategoryId="1"
        focusedIndex={0}
        categoryListRef={{ current: null }}
        onSelect={vi.fn()}
      />,
    )

    expect(document.querySelector('[data-category-index="0"]')).toBeInTheDocument()
  })
})
