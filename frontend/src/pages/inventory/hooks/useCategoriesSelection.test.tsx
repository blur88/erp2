import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useCategoriesSelection } from './categoriesSelection'

import type { Category } from '@/types'

const makeCategory = (id: string, name: string, level = 0): Category => ({
  id,
  name,
  level,
  fullPath: name,
  isRoot: level === 0,
  hasChildren: false,
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
})

describe('useCategoriesSelection', () => {
  it('auto-selects the first category when none is selected', async () => {
    const dispatch = vi.fn()
    const setFocusedCategoryIndex = vi.fn()
    const alpha = makeCategory('1', 'Alpha')
    const beta = makeCategory('2', 'Beta')

    renderHook(() =>
      useCategoriesSelection({
        dispatch: dispatch as never,
        categories: [alpha, beta],
        selectedCategory: null,
        focusedCategoryIndex: -1,
        setFocusedCategoryIndex,
        categoryListRef: { current: null },
      }),
    )

    await waitFor(() => {
      expect(setFocusedCategoryIndex).toHaveBeenCalledWith(0)
    })

    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: alpha }))
  })

  it('does not auto-select when a category is already selected', async () => {
    const dispatch = vi.fn()
    const setFocusedCategoryIndex = vi.fn()
    const alpha = makeCategory('1', 'Alpha')

    renderHook(() =>
      useCategoriesSelection({
        dispatch: dispatch as never,
        categories: [alpha],
        selectedCategory: alpha,
        focusedCategoryIndex: 0,
        setFocusedCategoryIndex,
        categoryListRef: { current: null },
      }),
    )

    await new Promise((resolve) => setTimeout(resolve, 100))

    expect(dispatch).not.toHaveBeenCalled()
  })

  it('deselects when the categories list becomes empty', async () => {
    const dispatch = vi.fn()
    const setFocusedCategoryIndex = vi.fn()
    const alpha = makeCategory('1', 'Alpha')

    const { rerender } = renderHook(
      (props: Parameters<typeof useCategoriesSelection>[0]) => useCategoriesSelection(props),
      {
        initialProps: {
          dispatch: dispatch as never,
          categories: [alpha],
          selectedCategory: alpha,
          focusedCategoryIndex: 0,
          setFocusedCategoryIndex,
          categoryListRef: { current: null },
        },
      },
    )

    rerender({
      dispatch: dispatch as never,
      categories: [],
      selectedCategory: alpha,
      focusedCategoryIndex: 0,
      setFocusedCategoryIndex,
      categoryListRef: { current: null },
    })

    await waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: null }))
    })
    expect(setFocusedCategoryIndex).toHaveBeenCalledWith(-1)
  })

  it('handleCategorySelect selects the clicked category', async () => {
    const dispatch = vi.fn()
    const setFocusedCategoryIndex = vi.fn()
    const alpha = makeCategory('1', 'Alpha')
    const beta = makeCategory('2', 'Beta')

    const { result } = renderHook(() =>
      useCategoriesSelection({
        dispatch: dispatch as never,
        categories: [alpha, beta],
        selectedCategory: alpha,
        focusedCategoryIndex: 0,
        setFocusedCategoryIndex,
        categoryListRef: { current: null },
      }),
    )

    result.current.handleCategorySelect(beta)

    expect(setFocusedCategoryIndex).toHaveBeenCalledWith(1)
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ payload: beta }))
  })
})
