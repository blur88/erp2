import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Provider } from 'react-redux'
import { configureStore } from '@reduxjs/toolkit'
import { describe, expect, it, vi, beforeEach } from 'vitest'

import CategoryList from './CategoryList'
import type { Category } from '@/types'

const captured: { rows?: any[]; columns?: any[] } = {}
vi.mock('@/components/common/EntityTable', () => ({
  __esModule: true,
  default: (props: any) => {
    captured.rows = props.rows
    captured.columns = props.columns
    return <div data-testid="entity-table" />
  },
}))

vi.mock('@/store/api/inventoryApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/api/inventoryApi')>()
  return { ...actual, useSetCategoryEnabledMutation: () => [vi.fn(), { isLoading: false }] }
})

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({ showSuccess: vi.fn(), showError: vi.fn() }),
}))

function cat(partial: Partial<Category>): Category {
  return {
    id: partial.id!, name: partial.name!, slug: partial.slug ?? partial.name!.toLowerCase(),
    isEnabled: partial.isEnabled ?? true, level: partial.level ?? 0, parentId: partial.parentId ?? null,
    fullPath: partial.name!, isRoot: (partial.level ?? 0) === 0, hasChildren: false,
    isActive: true, createdAt: '', updatedAt: '', productCount: partial.productCount ?? 0,
  } as Category
}

function renderList(categories: Category[], extra: Partial<React.ComponentProps<typeof CategoryList>> = {}) {
  const store = configureStore({ reducer: { empty: (s = null) => s } })
  return render(
    <Provider store={store}>
      <MemoryRouter>
        <CategoryList categories={categories} sortBy="name" sortOrder="asc" onSort={vi.fn()} {...extra} />
      </MemoryRouter>
    </Provider>,
  )
}

describe('CategoryList flat mode', () => {
  beforeEach(() => { captured.rows = undefined; captured.columns = undefined })

  it('flat mode sorts rows by name asc', () => {
    renderList([cat({ id: 'b', name: 'Beta' }), cat({ id: 'a', name: 'Alpha' })], { flat: true })
    expect(captured.rows!.map((r) => r.name)).toEqual(['Alpha', 'Beta'])
  })

  it('flat mode honors descending order', () => {
    renderList([cat({ id: 'a', name: 'Alpha' }), cat({ id: 'b', name: 'Beta' })], { flat: true, sortOrder: 'desc' })
    expect(captured.rows!.map((r) => r.name)).toEqual(['Beta', 'Alpha'])
  })

  it('flat mode renders an orphan whose parent is absent', () => {
    renderList([cat({ id: 'child', name: 'Orphan', parentId: 'missing', level: 1 })], { flat: true })
    expect(captured.rows!.map((r) => r.name)).toEqual(['Orphan'])
  })

  it('flat mode renders name cell with no indentation (sx.pl === 0)', () => {
    renderList([cat({ id: 'child', name: 'Deep', parentId: 'missing', level: 2 })], { flat: true })
    const nameCol = captured.columns!.find((c) => c.key === 'name')
    const el = nameCol.render(captured.rows![0]) as React.ReactElement
    expect((el.props as any).sx.pl).toBe(0)
  })

  it('tree mode keeps level indentation (sx.pl === level * 3)', () => {
    const parent = cat({ id: 'p', name: 'Parent', level: 0 })
    const child = cat({ id: 'c', name: 'Child', parentId: 'p', level: 1 })
    renderList([parent, child])
    const nameCol = captured.columns!.find((c) => c.key === 'name')
    const childRow = captured.rows!.find((r) => r.id === 'c')!
    const el = nameCol.render(childRow) as React.ReactElement
    expect((el.props as any).sx.pl).toBe(3)
  })
})
