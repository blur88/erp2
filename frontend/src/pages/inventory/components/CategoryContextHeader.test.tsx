import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import CategoryContextHeader from './CategoryContextHeader'

import type { Category } from '@/types'

const makeCategory = (overrides: Partial<Category> = {}): Category => ({
  id: 'root',
  name: 'Root',
  level: 0,
  parentId: null,
  fullPath: 'BROKEN PATH',
  isRoot: true,
  hasChildren: false,
  isActive: true,
  productCount: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

describe('CategoryContextHeader', () => {
  it('builds the category path from the category list and resolves the parent from parentId', () => {
    const root = makeCategory()
    const child = makeCategory({
      id: 'child',
      name: 'Child',
      level: 1,
      parentId: root.id,
      isRoot: false,
      fullPath: 'WRONG CHILD PATH',
    })
    const leaf = makeCategory({
      id: 'leaf',
      name: 'Leaf',
      level: 2,
      parentId: child.id,
      isRoot: false,
      fullPath: 'WRONG LEAF PATH',
    })

    render(
      <CategoryContextHeader
        selectedCategory={leaf}
        allCategories={[root, child, leaf]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('Root > Child > Leaf')).toBeInTheDocument()
    expect(screen.getByText('Child')).toBeInTheDocument()
    expect(screen.queryByText('WRONG LEAF PATH')).not.toBeInTheDocument()
  })

  it('does not render a status row', () => {
    render(
      <CategoryContextHeader
        selectedCategory={makeCategory({ id: 'child', name: 'Child', level: 1, isRoot: false })}
        allCategories={[]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.queryByText('Status')).not.toBeInTheDocument()
  })
})
