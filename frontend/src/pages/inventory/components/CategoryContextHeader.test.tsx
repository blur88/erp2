import { render, screen, within } from '@testing-library/react'
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
    // Parent Category row value should show the parent's name
    const cells = screen.getAllByRole('cell')
    const parentLabelIndex = cells.findIndex(cell => cell.textContent === 'Parent Category')
    expect(cells[parentLabelIndex + 1]).toHaveTextContent('Child')
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

  it('renders the category path inside a tooltip-backed trigger for long hierarchies', () => {
    const root = makeCategory({ id: 'a', name: 'Electronics' })
    const l1 = makeCategory({ id: 'b', name: 'Computers', level: 1, parentId: 'a', isRoot: false })
    const l2 = makeCategory({ id: 'c', name: 'Laptops', level: 2, parentId: 'b', isRoot: false })
    const l3 = makeCategory({ id: 'd', name: 'Gaming', level: 3, parentId: 'c', isRoot: false })
    const fullPath = 'Electronics > Computers > Laptops > Gaming'

    render(
      <CategoryContextHeader
        selectedCategory={l3}
        allCategories={[root, l1, l2, l3]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText(fullPath)).toHaveAttribute('aria-label', fullPath)
  })

  it('renders product count as plain text, not a Chip', () => {
    const { container } = render(
      <CategoryContextHeader
        selectedCategory={makeCategory({ productCount: 5 })}
        allCategories={[makeCategory()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('5 items')).toBeInTheDocument()

    const productCountLabel = screen.getByText('Product Count')
    const productCountRow = productCountLabel.closest('tr')

    expect(productCountRow).not.toBeNull()
    expect(within(productCountRow as HTMLTableRowElement).queryByText('5 items')).toBeInTheDocument()
    expect(container.querySelector('.MuiChip-root')).not.toBeInTheDocument()
  })

  it('renders singular "item" for a count of 1', () => {
    render(
      <CategoryContextHeader
        selectedCategory={makeCategory({ productCount: 1 })}
        allCategories={[makeCategory()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('1 item')).toBeInTheDocument()
  })

  it('renders "0 items" for zero product count', () => {
    render(
      <CategoryContextHeader
        selectedCategory={makeCategory({ productCount: 0 })}
        allCategories={[makeCategory()]}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    )

    expect(screen.getByText('0 items')).toBeInTheDocument()
  })
})
