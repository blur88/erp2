import { renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useCategoriesPageState } from './useCategoriesPageState'

describe('useCategoriesPageState', () => {
  it('initializes the category page UI state', () => {
    const { result } = renderHook(() => useCategoriesPageState())

    expect(result.current.dialogOpen).toBe(false)
    expect(result.current.editMode).toBe(false)
    expect(result.current.deletedCategoriesDialogOpen).toBe(false)
    expect(result.current.deleteConfirmOpen).toBe(false)
    expect(result.current.categoryToDelete).toBeNull()
    expect(result.current.smartDeleteOpen).toBe(false)
    expect(result.current.deleteError).toBeNull()
    expect(result.current.submitting).toBe(false)
    expect(result.current.focusedCategoryIndex).toBe(-1)
    expect(result.current.categoryListRef.current).toBeNull()
    expect(result.current.searchInputRef.current).toBeNull()
  })
})
