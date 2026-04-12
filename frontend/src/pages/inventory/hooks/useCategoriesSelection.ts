import { useCallback, useEffect, useRef, type RefObject } from 'react'

import type { AppDispatch } from '@/store'
import { setSelectedCategory } from '@/store/slices/inventorySlice'
import type { Category } from '@/types'

interface UseCategoriesSelectionParams {
  dispatch: AppDispatch
  categories: Category[]
  selectedCategory: Category | null
  focusedCategoryIndex: number
  setFocusedCategoryIndex: (index: number) => void
  categoryListRef: RefObject<HTMLDivElement | null>
}

export function useCategoriesSelection({
  dispatch,
  categories,
  selectedCategory,
  focusedCategoryIndex,
  setFocusedCategoryIndex,
  categoryListRef,
}: UseCategoriesSelectionParams) {
  const hasAutoSelected = useRef(false)

  useEffect(() => {
    if (
      categories.length > 0 &&
      !hasAutoSelected.current &&
      focusedCategoryIndex === -1 &&
      !selectedCategory
    ) {
      hasAutoSelected.current = true
      setFocusedCategoryIndex(0)
      dispatch(setSelectedCategory(categories[0]))
    } else if (categories.length === 0) {
      dispatch(setSelectedCategory(null))
      setFocusedCategoryIndex(-1)
    }
  }, [categories, dispatch, focusedCategoryIndex, selectedCategory, setFocusedCategoryIndex])

  useEffect(() => {
    if (selectedCategory && categories.length > 0) {
      const updatedCategory = categories.find((category) => category.id === selectedCategory.id)
      if (updatedCategory) {
        const hasChanged = JSON.stringify(updatedCategory) !== JSON.stringify(selectedCategory)
        if (hasChanged) {
          dispatch(setSelectedCategory(updatedCategory))
        }
      } else {
        dispatch(setSelectedCategory(null))
      }
    }
  }, [dispatch, categories, selectedCategory])

  useEffect(() => {
    if (focusedCategoryIndex >= 0 && categoryListRef.current) {
      const focusedRow = categoryListRef.current.querySelector(
        `[data-category-index="${focusedCategoryIndex}"]`,
      )
      if (focusedRow) {
        focusedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedCategoryIndex, categoryListRef])

  const selectAtIndex = useCallback(
    (index: number) => {
      setFocusedCategoryIndex(index)
      dispatch(setSelectedCategory(categories[index]))
    },
    [dispatch, categories, setFocusedCategoryIndex],
  )

  const handleCategorySelect = useCallback(
    (category: Category) => {
      const index = categories.findIndex((candidate) => candidate.id === category.id)
      setFocusedCategoryIndex(index)
      dispatch(setSelectedCategory(category))
    },
    [dispatch, categories, setFocusedCategoryIndex],
  )

  const handleNavigateUp = useCallback(() => {
    if (focusedCategoryIndex > 0) {
      selectAtIndex(focusedCategoryIndex - 1)
    }
  }, [focusedCategoryIndex, selectAtIndex])

  const handleNavigateDown = useCallback(() => {
    if (focusedCategoryIndex < categories.length - 1) {
      selectAtIndex(focusedCategoryIndex + 1)
    }
  }, [focusedCategoryIndex, categories.length, selectAtIndex])

  const handleNavigateToFirst = useCallback(() => {
    if (categories.length > 0) {
      selectAtIndex(0)
    }
  }, [categories.length, selectAtIndex])

  const handleNavigateToLast = useCallback(() => {
    if (categories.length > 0) {
      selectAtIndex(categories.length - 1)
    }
  }, [categories.length, selectAtIndex])

  const handlePageUpNavigation = useCallback(() => {
    const newIndex = Math.max(0, focusedCategoryIndex - 10)
    if (categories[newIndex]) {
      selectAtIndex(newIndex)
    }
  }, [focusedCategoryIndex, categories, selectAtIndex])

  const handlePageDownNavigation = useCallback(() => {
    const newIndex = Math.min(categories.length - 1, focusedCategoryIndex + 10)
    if (categories[newIndex]) {
      selectAtIndex(newIndex)
    }
  }, [focusedCategoryIndex, categories, selectAtIndex])

  const handleEscapeAction = useCallback(() => {
    setFocusedCategoryIndex(-1)
    dispatch(setSelectedCategory(null))
  }, [dispatch, setFocusedCategoryIndex])

  return {
    handleCategorySelect,
    handleNavigateUp,
    handleNavigateDown,
    handleNavigateToFirst,
    handleNavigateToLast,
    handlePageUpNavigation,
    handlePageDownNavigation,
    handleEscapeAction,
  }
}
