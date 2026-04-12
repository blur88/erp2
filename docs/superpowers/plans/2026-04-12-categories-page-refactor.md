# CategoriesPage Master-Detail Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor `CategoriesPage.tsx` from a 700+ line monolith into the standardized Master-Detail pattern, decomposing state, selection, actions, and UI into focused hooks and components.

**Architecture:** Add `selectedCategory` to the Redux inventory slice, extract three hooks (`useCategoriesPageState`, `useCategoriesSelection`, `useCategoriesActions`), build four UI components (`CategoryList`, `CategoryContextHeader`, `CategoryWorkspaceCard`, `CategoryDialogs`), then rewrite `CategoriesPage.tsx` as a thin orchestrator using `MasterDetailWorkspace` and `FilterBar`.

**Tech Stack:** React 19, MUI v7, RTK Query (`useGetCategoriesQuery`, `useGetProductsQuery`), Redux Toolkit, react-hook-form + yup, Vitest + React Testing Library.

---

## File Map

| Action | Path |
|--------|------|
| Modify | `frontend/src/store/slices/inventorySlice.ts` |
| Create | `frontend/src/pages/inventory/hooks/useCategoriesPageState.ts` |
| Create | `frontend/src/pages/inventory/hooks/useCategoriesSelection.ts` |
| Create | `frontend/src/pages/inventory/hooks/useCategoriesSelection.test.tsx` |
| Create | `frontend/src/pages/inventory/hooks/useCategoriesActions.ts` |
| Create | `frontend/src/pages/inventory/components/CategoryList.tsx` |
| Create | `frontend/src/pages/inventory/components/CategoryList.test.tsx` |
| Create | `frontend/src/pages/inventory/components/CategoryContextHeader.tsx` |
| Create | `frontend/src/pages/inventory/components/CategoryWorkspaceCard.tsx` |
| Create | `frontend/src/pages/inventory/components/CategoryDialogs.tsx` |
| Modify | `frontend/src/pages/inventory/CategoriesPage.tsx` |

---

## Task 1: Add `selectedCategory` to Redux inventory slice

**Files:**
- Modify: `frontend/src/store/slices/inventorySlice.ts`

- [ ] **Step 1: Update the slice**

Open `frontend/src/store/slices/inventorySlice.ts`. The current file is:

```ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { Product, StockAdjustment } from '@/types'
import type { RootState } from '@/store'

interface InventoryState {
  selectedProduct: Product | null
  selectedStockAdjustment: StockAdjustment | null
  filters: {
    categories: {
      search: string
    }
  }
}

const initialState: InventoryState = {
  selectedProduct: null,
  selectedStockAdjustment: null,
  filters: {
    categories: {
      search: '',
    },
  },
}

const inventorySlice = createSlice({
  name: 'inventory',
  initialState,
  reducers: {
    setSelectedProduct: (state, action: PayloadAction<Product | null>) => {
      state.selectedProduct = action.payload
    },
    setSelectedStockAdjustment: (state, action: PayloadAction<StockAdjustment | null>) => {
      state.selectedStockAdjustment = action.payload
    },
    setCategoryFilters: (state, action: PayloadAction<Partial<InventoryState['filters']['categories']>>) => {
      state.filters.categories = { ...state.filters.categories, ...action.payload }
    },
  },
})

export const {
  setSelectedProduct,
  setSelectedStockAdjustment,
  setCategoryFilters,
} = inventorySlice.actions

export const selectSelectedProduct = (state: RootState) => state.inventory.selectedProduct
export const selectSelectedStockAdjustment = (state: RootState) => state.inventory.selectedStockAdjustment
export const selectCategoryFilters = (state: RootState) => state.inventory.filters.categories

export default inventorySlice.reducer
```

Replace with:

```ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit'

import type { Category, Product, StockAdjustment } from '@/types'
import type { RootState } from '@/store'

interface InventoryState {
  selectedProduct: Product | null
  selectedCategory: Category | null
  selectedStockAdjustment: StockAdjustment | null
  filters: {
    categories: {
      search: string
    }
  }
}

const initialState: InventoryState = {
  selectedProduct: null,
  selectedCategory: null,
  selectedStockAdjustment: null,
  filters: {
    categories: {
      search: '',
    },
  },
}

const inventorySlice = createSlice({
  name: 'inventory',
  initialState,
  reducers: {
    setSelectedProduct: (state, action: PayloadAction<Product | null>) => {
      state.selectedProduct = action.payload
    },
    setSelectedCategory: (state, action: PayloadAction<Category | null>) => {
      state.selectedCategory = action.payload
    },
    setSelectedStockAdjustment: (state, action: PayloadAction<StockAdjustment | null>) => {
      state.selectedStockAdjustment = action.payload
    },
    setCategoryFilters: (state, action: PayloadAction<Partial<InventoryState['filters']['categories']>>) => {
      state.filters.categories = { ...state.filters.categories, ...action.payload }
    },
  },
})

export const {
  setSelectedProduct,
  setSelectedCategory,
  setSelectedStockAdjustment,
  setCategoryFilters,
} = inventorySlice.actions

export const selectSelectedProduct = (state: RootState) => state.inventory.selectedProduct
export const selectSelectedCategory = (state: RootState) => state.inventory.selectedCategory
export const selectSelectedStockAdjustment = (state: RootState) => state.inventory.selectedStockAdjustment
export const selectCategoryFilters = (state: RootState) => state.inventory.filters.categories

export default inventorySlice.reducer
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/store/slices/inventorySlice.ts
git commit -m "feat(inventory): add selectedCategory to inventory Redux slice"
```

---

## Task 2: Create `useCategoriesPageState`

**Files:**
- Create: `frontend/src/pages/inventory/hooks/useCategoriesPageState.ts`

- [ ] **Step 1: Create the file**

```ts
// frontend/src/pages/inventory/hooks/useCategoriesPageState.ts
import { useRef, useState } from 'react'

import type { Category } from '@/types'

export function useCategoriesPageState() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [deletedCategoriesDialogOpen, setDeletedCategoriesDialogOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null)
  const [smartDeleteOpen, setSmartDeleteOpen] = useState(false)
  const [deleteError, setDeleteError] = useState<any>(null)
  const [submitting, setSubmitting] = useState(false)
  const [focusedCategoryIndex, setFocusedCategoryIndex] = useState<number>(-1)
  const categoryListRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  return {
    dialogOpen,
    setDialogOpen,
    editMode,
    setEditMode,
    deletedCategoriesDialogOpen,
    setDeletedCategoriesDialogOpen,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    categoryToDelete,
    setCategoryToDelete,
    smartDeleteOpen,
    setSmartDeleteOpen,
    deleteError,
    setDeleteError,
    submitting,
    setSubmitting,
    focusedCategoryIndex,
    setFocusedCategoryIndex,
    categoryListRef,
    searchInputRef,
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/hooks/useCategoriesPageState.ts
git commit -m "feat(inventory): add useCategoriesPageState hook"
```

---

## Task 3: Create `useCategoriesSelection` with tests

**Files:**
- Create: `frontend/src/pages/inventory/hooks/useCategoriesSelection.ts`
- Create: `frontend/src/pages/inventory/hooks/useCategoriesSelection.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/pages/inventory/hooks/useCategoriesSelection.test.tsx
import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useCategoriesSelection } from './useCategoriesSelection'

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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/inventory/hooks/useCategoriesSelection.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the implementation**

```ts
// frontend/src/pages/inventory/hooks/useCategoriesSelection.ts
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

  // Auto-select first category on load
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

  // Keep selected category in sync when list refreshes
  useEffect(() => {
    if (selectedCategory && categories.length > 0) {
      const updated = categories.find((c) => c.id === selectedCategory.id)
      if (updated) {
        const hasChanged = JSON.stringify(updated) !== JSON.stringify(selectedCategory)
        if (hasChanged) {
          dispatch(setSelectedCategory(updated))
        }
      } else {
        dispatch(setSelectedCategory(null))
      }
    }
  }, [dispatch, categories, selectedCategory])

  // Scroll focused row into view
  useEffect(() => {
    if (focusedCategoryIndex >= 0 && categoryListRef.current) {
      const row = categoryListRef.current.querySelector(`[data-category-index="${focusedCategoryIndex}"]`)
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
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
      const index = categories.findIndex((c) => c.id === category.id)
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/inventory/hooks/useCategoriesSelection.test.tsx
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inventory/hooks/useCategoriesSelection.ts \
        frontend/src/pages/inventory/hooks/useCategoriesSelection.test.tsx
git commit -m "feat(inventory): add useCategoriesSelection hook with tests"
```

---

## Task 4: Create `useCategoriesActions`

**Files:**
- Create: `frontend/src/pages/inventory/hooks/useCategoriesActions.ts`

- [ ] **Step 1: Create the file**

```ts
// frontend/src/pages/inventory/hooks/useCategoriesActions.ts
import { useCallback } from 'react'

import type { Category } from '@/types'

interface UseCategoriesActionsParams {
  categories: Category[]
  selectedCategory: Category | null
  editMode: boolean
  isDuplicateName: boolean
  duplicateNameError: string | null
  deleteCategory: (id: string) => { unwrap: () => Promise<any> }
  createCategory: (data: { name: string; parentId: string | null }) => { unwrap: () => Promise<any> }
  updateCategory: (args: { id: string; data: { name: string; parentId?: string | null } }) => { unwrap: () => Promise<any> }
  showSuccess: (message: string) => void
  showError: (message: string) => void
  refetchCategories: () => void
  setDialogOpen: (open: boolean) => void
  setEditMode: (mode: boolean) => void
  setDeleteConfirmOpen: (open: boolean) => void
  setCategoryToDelete: (category: Category | null) => void
  setSmartDeleteOpen: (open: boolean) => void
  setDeleteError: (error: any) => void
  setSubmitting: (submitting: boolean) => void
  resetForm: (values: { name: string; parentId: string | null }) => void
}

export function useCategoriesActions({
  categories,
  selectedCategory,
  editMode,
  isDuplicateName,
  duplicateNameError,
  deleteCategory,
  createCategory,
  updateCategory,
  showSuccess,
  showError,
  refetchCategories,
  setDialogOpen,
  setEditMode,
  setDeleteConfirmOpen,
  setCategoryToDelete,
  setSmartDeleteOpen,
  setDeleteError,
  setSubmitting,
  resetForm,
}: UseCategoriesActionsParams) {
  const handleAddCategory = useCallback(
    (parentId?: string) => {
      resetForm({ name: '', parentId: parentId || null })
      setEditMode(false)
      setDialogOpen(true)
    },
    [resetForm, setEditMode, setDialogOpen],
  )

  const handleEditCategory = useCallback(
    (category: Category) => {
      resetForm({ name: category.name, parentId: category.parentId || null })
      setEditMode(true)
      setDialogOpen(true)
    },
    [resetForm, setEditMode, setDialogOpen],
  )

  const handleDeleteCategory = useCallback(
    (category: Category) => {
      setCategoryToDelete(category)
      setDeleteError(null)
      setDeleteConfirmOpen(true)
    },
    [setCategoryToDelete, setDeleteError, setDeleteConfirmOpen],
  )

  const handleConfirmDelete = useCallback(
    async (categoryToDelete: Category | null) => {
      if (!categoryToDelete) return

      try {
        await deleteCategory(categoryToDelete.id).unwrap()
        showSuccess(`Category "${categoryToDelete.name}" deleted successfully.`)
        setDeleteConfirmOpen(false)
        setCategoryToDelete(null)
      } catch (error: any) {
        console.error('Delete category error:', error)

        if (error?.productCount || (error?.includes && error.includes('contains'))) {
          setDeleteConfirmOpen(false)
          setDeleteError({
            message: error?.message || error,
            productCount: error?.productCount,
            categoryName: categoryToDelete.name,
            suggestions: error?.suggestions,
          })
          setSmartDeleteOpen(true)
        } else {
          showError(error || 'Failed to delete category')
          setDeleteConfirmOpen(false)
          setCategoryToDelete(null)
        }
      }
    },
    [deleteCategory, setDeleteConfirmOpen, setCategoryToDelete, setDeleteError, setSmartDeleteOpen, showError, showSuccess],
  )

  const handleSmartDelete = useCallback(
    async (categoryToDelete: Category | null, moveToUncategorized: boolean) => {
      if (!categoryToDelete) return

      const params = new URLSearchParams()
      params.set('force', 'true')
      if (moveToUncategorized) {
        params.set('moveToUncategorized', 'true')
      }

      const response = await fetch(
        `/api/inventory/categories/${categoryToDelete.id}?${params.toString()}`,
        { method: 'DELETE', headers: { 'Content-Type': 'application/json' } },
      )

      if (!response.ok) {
        throw new Error(`Failed to delete category: ${response.statusText}`)
      }

      const result = await response.json()

      if (result.moved && result.moved > 0) {
        showSuccess(
          `Category "${categoryToDelete.name}" deleted. ${result.moved} product${result.moved === 1 ? '' : 's'} moved to Uncategorized.`,
        )
      } else {
        showSuccess(result.message || `Category "${categoryToDelete.name}" deleted successfully.`)
      }

      void refetchCategories()
    },
    [refetchCategories, showSuccess],
  )

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
    setCategoryToDelete(null)
  }, [setDeleteConfirmOpen, setCategoryToDelete])

  const handleSmartDeleteClose = useCallback(() => {
    setSmartDeleteOpen(false)
    setCategoryToDelete(null)
    setDeleteError(null)
  }, [setSmartDeleteOpen, setCategoryToDelete, setDeleteError])

  const onSubmit = useCallback(
    async (data: { name: string; parentId?: string | null }) => {
      try {
        setSubmitting(true)

        if (isDuplicateName) {
          showError(duplicateNameError || 'Category name already exists')
          return
        }

        if (editMode && selectedCategory) {
          await updateCategory({ id: selectedCategory.id, data }).unwrap()
          showSuccess('Category updated successfully')
        } else {
          await createCategory({ name: data.name, parentId: data.parentId || null }).unwrap()
          showSuccess('Category created successfully')
        }

        setDialogOpen(false)
        resetForm({ name: '', parentId: null })
      } catch (error: any) {
        console.error('Category save error:', error)

        if (error?.response?.status === 409) {
          showError(
            `Duplicate entry detected: A category named "${data.name}" already exists. Please choose a different name.`,
          )
        } else if (error?.response?.status === 400) {
          const message = error?.response?.data?.message || 'Invalid category data'
          showError(`Validation error: ${message}`)
        } else {
          const message = error?.response?.data?.message || error?.message || 'Failed to save category'
          showError(`Failed to save category: ${message}`)
        }
      } finally {
        setSubmitting(false)
      }
    },
    [
      createCategory,
      duplicateNameError,
      editMode,
      isDuplicateName,
      resetForm,
      selectedCategory,
      setDialogOpen,
      setSubmitting,
      showError,
      showSuccess,
      updateCategory,
    ],
  )

  return {
    handleAddCategory,
    handleEditCategory,
    handleDeleteCategory,
    handleConfirmDelete,
    handleSmartDelete,
    handleCancelDelete,
    handleSmartDeleteClose,
    onSubmit,
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/hooks/useCategoriesActions.ts
git commit -m "feat(inventory): add useCategoriesActions hook"
```

---

## Task 5: Create `CategoryList` with tests

**Files:**
- Create: `frontend/src/pages/inventory/components/CategoryList.tsx`
- Create: `frontend/src/pages/inventory/components/CategoryList.test.tsx`

- [ ] **Step 1: Write the failing tests**

```tsx
// frontend/src/pages/inventory/components/CategoryList.test.tsx
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

    // The row with data-category-index="0" should be in the document
    expect(document.querySelector('[data-category-index="0"]')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd frontend && npx vitest run src/pages/inventory/components/CategoryList.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create the implementation**

```tsx
// frontend/src/pages/inventory/components/CategoryList.tsx
import React, { memo } from 'react'
import {
  Box,
  Chip,
  Paper,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import { default as DragIndicatorIcon } from '@mui/icons-material/DragIndicator'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { formatDate } from '@/utils/formatters'
import type { Category } from '@/types'

interface CategoryRowProps {
  category: Category
  index: number
  selectedCategoryId: string | undefined
  focusedIndex: number
  onSelect: (category: Category) => void
  isMobile: boolean
}

const CategoryRow = memo(({ category, index, selectedCategoryId, focusedIndex, onSelect, isMobile }: CategoryRowProps) => {
  const isSelected = selectedCategoryId === category.id
  const isFocused = index === focusedIndex

  return (
    <TableRow
      hover
      onClick={() => onSelect(category)}
      data-category-index={index}
      sx={{
        cursor: 'pointer',
        backgroundColor: isSelected ? 'action.selected' : isFocused ? 'action.focus' : 'inherit',
        '&:hover': {
          backgroundColor: isSelected ? 'action.selected' : 'action.hover',
        },
        transition: 'background-color 0.2s ease',
        height: TABLE_STYLES.row.height,
        ...(isFocused && {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: '-2px',
        }),
      }}
    >
      <TableCell>
        <Box
          sx={{ display: 'flex', alignItems: 'center', ml: category.level * 1.5, gap: 0.5 }}
          aria-level={category.level + 1}
          role="treeitem"
          aria-label={`${category.name} ${category.level === 0 ? 'root category' : `level ${category.level} category`}`}
        >
          <DragIndicatorIcon sx={{ color: 'text.secondary', fontSize: '0.875rem' }} />
          <Typography variant="body2" sx={{ fontSize: '0.8rem', lineHeight: 1.2, fontWeight: 400 }}>
            {category.name}
          </Typography>
        </Box>
      </TableCell>
      <TableCell>
        <Chip
          label={`${category.productCount ?? 0} ${(category.productCount ?? 0) === 1 ? 'item' : 'items'}`}
          size="small"
          color={category.productCount && category.productCount > 0 ? 'primary' : 'default'}
          variant="outlined"
          sx={{
            fontSize: '0.7rem',
            fontWeight: 500,
            height: `${TABLE_STYLES.row.height * 0.65}px`,
            minWidth: `${TABLE_STYLES.row.height * 1.8}px`,
            '& .MuiChip-label': {
              fontSize: `${Math.max(10, TABLE_STYLES.row.height * 0.35)}px`,
              lineHeight: 1,
            },
          }}
        />
      </TableCell>
      {!isMobile && (
        <TableCell>
          <Typography variant="tableCaption" sx={{ color: 'text.secondary', fontSize: '0.7rem' }}>
            {formatDate(category.createdAt)}
          </Typography>
        </TableCell>
      )}
    </TableRow>
  )
})

CategoryRow.displayName = 'CategoryRow'

interface CategoryListProps {
  categories: Category[]
  loading: boolean
  selectedCategoryId?: string
  focusedIndex: number
  onSelect: (category: Category) => void
  categoryListRef: React.RefObject<HTMLDivElement | null>
}

const CategoryList: React.FC<CategoryListProps> = ({
  categories,
  loading,
  selectedCategoryId,
  focusedIndex,
  onSelect,
  categoryListRef,
}) => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  return (
    <Paper sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ p: TABLE_STYLES.cell.padding.px, borderBottom: TABLE_STYLES.cell.border }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Typography
            variant="tableHeader"
            sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            Categories ({categories.length})
          </Typography>
          {loading && categories.length > 0 && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                Searching...
              </Typography>
              <Skeleton variant="circular" width={16} height={16} />
            </Box>
          )}
        </Box>
      </Box>
      <Box sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }} ref={categoryListRef}>
        <TableContainer sx={{ flex: 1, overflow: 'auto' }}>
          <Table
            size={TABLE_STYLES.size}
            role="tree"
            aria-label="Categories hierarchy"
            sx={{
              '& .MuiTableCell-root': {
                borderBottom: TABLE_STYLES.cell.border,
                py: TABLE_STYLES.cell.padding.py * 0.75,
                px: TABLE_STYLES.cell.padding.px * 0.75,
              },
            }}
          >
            <TableBody>
              {loading && categories.length === 0
                ? [...Array(10)].map((_, index) => (
                    <TableRow key={`skeleton-${index}`}>
                      <TableCell><Skeleton height={40} /></TableCell>
                    </TableRow>
                  ))
                : categories.length === 0
                  ? (
                      <TableRow>
                        <TableCell>
                          <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>
                            No categories found
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )
                  : categories.map((category, index) => (
                      <CategoryRow
                        key={category.id}
                        category={category}
                        index={index}
                        selectedCategoryId={selectedCategoryId}
                        focusedIndex={focusedIndex}
                        onSelect={onSelect}
                        isMobile={isMobile}
                      />
                    ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Box>
    </Paper>
  )
}

export default CategoryList
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend && npx vitest run src/pages/inventory/components/CategoryList.test.tsx
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/inventory/components/CategoryList.tsx \
        frontend/src/pages/inventory/components/CategoryList.test.tsx
git commit -m "feat(inventory): add CategoryList component with tests"
```

---

## Task 6: Create `CategoryContextHeader`

**Files:**
- Create: `frontend/src/pages/inventory/components/CategoryContextHeader.tsx`

- [ ] **Step 1: Create the file**

```tsx
// frontend/src/pages/inventory/components/CategoryContextHeader.tsx
import React from 'react'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { default as EditIcon } from '@mui/icons-material/Edit'
import { Box, IconButton, Paper, Typography } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import type { Category } from '@/types'

interface CategoryContextHeaderProps {
  selectedCategory: Category | null
  onEdit: () => void
  onDelete: () => void
}

const actionIconSx = {
  height: `${TABLE_STYLES.row.height * 0.75}px`,
  width: `${TABLE_STYLES.row.height * 0.75}px`,
  minHeight: 20,
  minWidth: 20,
  p: 0.125,
}

const CategoryContextHeader: React.FC<CategoryContextHeaderProps> = ({
  selectedCategory,
  onEdit,
  onDelete,
}) => {
  if (!selectedCategory) {
    return (
      <Paper sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', p: 4 }}>
        <Typography variant="h6" sx={{ color: 'text.secondary' }}>
          Select a category to view details
        </Typography>
      </Paper>
    )
  }

  return (
    <Paper sx={{ overflow: 'hidden' }}>
      <Box
        sx={{
          p: TABLE_STYLES.cell.padding.px,
          borderBottom: TABLE_STYLES.cell.border,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Box>
          <Typography
            variant="tableHeader"
            sx={{ fontWeight: 600, fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}
          >
            Category — {selectedCategory.name}
          </Typography>
          {selectedCategory.fullPath && selectedCategory.fullPath !== selectedCategory.name && (
            <Typography variant="body2" sx={{ color: 'text.secondary', fontSize: '0.75rem', mt: 0.25 }}>
              {selectedCategory.fullPath}
            </Typography>
          )}
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.25 }}>
          <IconButton
            size="small"
            title={`Edit ${selectedCategory.name}`}
            aria-label={`Edit category ${selectedCategory.name}`}
            onClick={onEdit}
            sx={{ ...actionIconSx, color: 'primary.main' }}
          >
            <EditIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
          <IconButton
            size="small"
            title={`Delete ${selectedCategory.name}`}
            aria-label={`Delete category ${selectedCategory.name}`}
            onClick={onDelete}
            sx={{ ...actionIconSx, color: 'error.main' }}
          >
            <DeleteIcon sx={{ fontSize: `${TABLE_STYLES.row.height * 0.5}px` }} />
          </IconButton>
        </Box>
      </Box>
    </Paper>
  )
}

export default CategoryContextHeader
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/components/CategoryContextHeader.tsx
git commit -m "feat(inventory): add CategoryContextHeader component"
```

---

## Task 7: Create `CategoryWorkspaceCard`

**Files:**
- Create: `frontend/src/pages/inventory/components/CategoryWorkspaceCard.tsx`

- [ ] **Step 1: Create the file**

```tsx
// frontend/src/pages/inventory/components/CategoryWorkspaceCard.tsx
import React, { useEffect, useState } from 'react'
import { Box, Paper, Tab, Tabs, Typography, Grid } from '@mui/material'

import { TABLE_STYLES } from '@/constants/tableStyles'
import { formatDate } from '@/utils/formatters'
import { useGetProductsQuery } from '@/store/api/inventoryApi'
import type { Category } from '@/types'

interface CategoryWorkspaceCardProps {
  selectedCategory: Category | null
}

const CategoryWorkspaceCard: React.FC<CategoryWorkspaceCardProps> = ({ selectedCategory }) => {
  const [tabValue, setTabValue] = useState(0)
  const categoryId = selectedCategory?.id ?? ''

  useEffect(() => {
    setTabValue(0)
  }, [categoryId])

  const { data: productsResponse } = useGetProductsQuery(
    { categoryId },
    { skip: !categoryId || tabValue !== 1 },
  )
  const products = productsResponse?.data ?? []

  if (!selectedCategory) {
    return <Paper sx={{ flex: 1 }} />
  }

  const levelLabel = selectedCategory.level === 0 ? 'Root' : `Level ${selectedCategory.level}`
  const parentLabel = selectedCategory.parent?.name ?? (selectedCategory.isRoot ? 'None' : '—')

  return (
    <Paper sx={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, value) => setTabValue(value)}
          sx={{
            minHeight: 40,
            '& .MuiTab-root': { minHeight: 40, fontSize: '0.8rem', textTransform: 'none', fontWeight: 600 },
          }}
        >
          <Tab label="Details" />
          <Tab label="Products" />
        </Tabs>
      </Box>

      {/* Details tab */}
      <Box
        role="tabpanel"
        sx={{ flex: 1, overflow: 'auto', display: tabValue === 0 ? 'block' : 'none', p: TABLE_STYLES.cell.padding.px }}
      >
        {tabValue === 0 && (
          <Grid container spacing={2} sx={{ mt: 0.5 }}>
            {[
              { label: 'Full Path', value: selectedCategory.fullPath },
              { label: 'Level', value: levelLabel },
              { label: 'Parent', value: parentLabel },
              { label: 'Products', value: String(selectedCategory.productCount ?? 0) },
              { label: 'Created', value: formatDate(selectedCategory.createdAt) },
            ].map(({ label, value }) => (
              <Grid key={label} size={{ xs: 12, sm: 6 }}>
                <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {label}
                </Typography>
                <Typography variant="body2" sx={{ fontSize: '0.85rem', mt: 0.25 }}>
                  {value}
                </Typography>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {/* Products tab */}
      <Box
        role="tabpanel"
        sx={{ flex: 1, overflow: 'auto', display: tabValue === 1 ? 'flex' : 'none', flexDirection: 'column' }}
      >
        {tabValue === 1 && (
          <Box sx={{ p: TABLE_STYLES.cell.padding.px }}>
            {products.length === 0 ? (
              <Typography variant="body2" sx={{ color: 'text.secondary', textAlign: 'center', py: 2 }}>
                No products in this category
              </Typography>
            ) : (
              products.map((product) => (
                <Box
                  key={product.id}
                  sx={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    py: 0.75,
                    borderBottom: TABLE_STYLES.cell.border,
                    '&:last-child': { borderBottom: 'none' },
                  }}
                >
                  <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                    {product.name}
                  </Typography>
                  <Typography variant="body2" sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                    {product.stockQuantity} in stock
                  </Typography>
                </Box>
              ))
            )}
          </Box>
        )}
      </Box>
    </Paper>
  )
}

export default CategoryWorkspaceCard
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/components/CategoryWorkspaceCard.tsx
git commit -m "feat(inventory): add CategoryWorkspaceCard component with details and products tabs"
```

---

## Task 8: Create `CategoryDialogs`

**Files:**
- Create: `frontend/src/pages/inventory/components/CategoryDialogs.tsx`

- [ ] **Step 1: Create the file**

```tsx
// frontend/src/pages/inventory/components/CategoryDialogs.tsx
import React, { useEffect } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  TextField,
  Typography,
} from '@mui/material'
import { Controller, useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import CategorySelector from '@/components/inventory/CategorySelector'
import DeletedCategoriesDialog from '@/components/inventory/DeletedCategoriesDialog'
import { SmartCategoryDeleteDialog } from '@/components/inventory/SmartCategoryDeleteDialog'
import { useCategoryDuplicateCheck } from '@/hooks/useCategoryDuplicateCheck'
import type { Category } from '@/types'

interface CategoryFormData {
  name: string
  parentId?: string | null
}

const categorySchema = yup.object({
  name: yup.string().required('Category name is required').min(2, 'Name must be at least 2 characters'),
  parentId: yup.string().optional().nullable(),
})

interface CategoryDialogsProps {
  // Form dialog
  dialogOpen: boolean
  editMode: boolean
  selectedCategory: Category | null
  submitting: boolean
  categories: Category[]
  onSubmit: (data: CategoryFormData) => Promise<void>
  onDialogClose: () => void
  onFormReady: (resetFn: (values: CategoryFormData) => void) => void
  onDuplicateStateChange: (isDuplicate: boolean, error: string | null) => void
  // Deleted categories dialog
  deletedCategoriesDialogOpen: boolean
  onCloseDeletedCategories: () => void
  onCategoryRestored: () => void
  // Delete confirm dialog
  deleteConfirmOpen: boolean
  categoryToDelete: Category | null
  onConfirmDelete: () => void
  onCancelDelete: () => void
  // Smart delete dialog
  smartDeleteOpen: boolean
  deleteError: any
  onSmartDelete: (moveToUncategorized: boolean) => Promise<void>
  onSmartDeleteClose: () => void
}

const CategoryDialogs: React.FC<CategoryDialogsProps> = ({
  dialogOpen,
  editMode,
  selectedCategory,
  submitting,
  categories,
  onSubmit,
  onDialogClose,
  onFormReady,
  onDuplicateStateChange,
  deletedCategoriesDialogOpen,
  onCloseDeletedCategories,
  onCategoryRestored,
  deleteConfirmOpen,
  categoryToDelete,
  onConfirmDelete,
  onCancelDelete,
  smartDeleteOpen,
  deleteError,
  onSmartDelete,
  onSmartDeleteClose,
}) => {
  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CategoryFormData>({
    resolver: yupResolver(categorySchema) as any,
    defaultValues: { name: '', parentId: null },
  })

  const { checkDuplicate, nameError: duplicateNameError, hasNameDuplicate: isDuplicateName } = useCategoryDuplicateCheck()

  const watchedName = watch('name')
  const watchedParentId = watch('parentId')

  // Expose reset to parent so useCategoriesActions can pre-fill the form
  useEffect(() => {
    onFormReady(reset)
  }, [onFormReady, reset])

  // Expose duplicate state to parent so useCategoriesActions.onSubmit can guard
  useEffect(() => {
    onDuplicateStateChange(isDuplicateName, duplicateNameError)
  }, [isDuplicateName, duplicateNameError, onDuplicateStateChange])

  // Real-time duplicate check
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if (watchedName && watchedName.trim().length >= 2) {
        await checkDuplicate({
          name: watchedName.trim(),
          parentId: watchedParentId || undefined,
          excludeId: editMode && selectedCategory ? selectedCategory.id : undefined,
        })
      }
    }, 500)

    return () => clearTimeout(timeoutId)
  }, [watchedName, watchedParentId, editMode, selectedCategory, checkDuplicate])

  const findCategoryById = (id: string): Category | null =>
    categories.find((c) => c.id === id) || null

  const parentCategory = watchedParentId ? findCategoryById(watchedParentId) : null

  return (
    <>
      {/* Form dialog */}
      <Dialog open={dialogOpen} onClose={onDialogClose} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editMode ? 'Edit Category' : 'Add New Category'}
          {parentCategory && (
            <Typography variant="body2" sx={{ color: 'text.secondary', mt: 1 }}>
              Parent: {parentCategory.name}
            </Typography>
          )}
        </DialogTitle>
        <form onSubmit={handleSubmit(onSubmit)}>
          <DialogContent>
            <Grid container spacing={3} sx={{ mt: 1 }}>
              <Grid size={12}>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      fullWidth
                      label="Category Name"
                      error={!!errors.name || isDuplicateName}
                      helperText={errors.name?.message || duplicateNameError || ''}
                    />
                  )}
                />
              </Grid>
              <Grid size={12}>
                <Controller
                  name="parentId"
                  control={control}
                  render={({ field }) => (
                    <CategorySelector
                      value={field.value ? findCategoryById(field.value) : null}
                      onChange={(category) => field.onChange(category?.id || null)}
                      label="Parent Category"
                      placeholder="Select parent category (optional)"
                      allowRoot
                      excludeCategories={editMode && selectedCategory ? [selectedCategory.id] : []}
                    />
                  )}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={onDialogClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? 'Saving...' : editMode ? 'Update' : 'Create'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Deleted categories dialog */}
      <DeletedCategoriesDialog
        open={deletedCategoriesDialogOpen}
        onClose={onCloseDeletedCategories}
        onCategoryRestored={onCategoryRestored}
      />

      {/* Simple delete confirmation */}
      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete the category "${categoryToDelete?.name}"?`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        severity="warning"
      />

      {/* Smart delete dialog */}
      <SmartCategoryDeleteDialog
        open={smartDeleteOpen}
        category={categoryToDelete}
        error={deleteError}
        onClose={onSmartDeleteClose}
        onConfirm={onSmartDelete}
      />
    </>
  )
}

export default CategoryDialogs
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/components/CategoryDialogs.tsx
git commit -m "feat(inventory): add CategoryDialogs component"
```

---

## Task 9: Rewrite `CategoriesPage.tsx`

**Files:**
- Modify: `frontend/src/pages/inventory/CategoriesPage.tsx`

- [ ] **Step 1: Rewrite the file**

Replace the entire contents of `frontend/src/pages/inventory/CategoriesPage.tsx` with:

```tsx
// frontend/src/pages/inventory/CategoriesPage.tsx
import React, { useCallback, useRef, useState, useMemo } from 'react'
import { Box, useMediaQuery, useTheme } from '@mui/material'

import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useCreateCategoryMutation,
  useDeleteCategoryMutation,
  useGetCategoriesQuery,
  useUpdateCategoryMutation,
} from '@/store/api/inventoryApi'
import {
  selectSelectedCategory,
} from '@/store/slices/inventorySlice'
import type { FilterBarConfig } from '@/types/filterBar.types'

import CategoryContextHeader from './components/CategoryContextHeader'
import CategoryDialogs from './components/CategoryDialogs'
import CategoryList from './components/CategoryList'
import CategoryWorkspaceCard from './components/CategoryWorkspaceCard'
import { useCategoriesActions } from './hooks/useCategoriesActions'
import { useCategoriesPageState } from './hooks/useCategoriesPageState'
import { useCategoriesSelection } from './hooks/useCategoriesSelection'

interface CategoryFilters {
  search: string
}

const CategoriesPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const selectedCategory = useAppSelector(selectSelectedCategory)
  const pageState = useCategoriesPageState()

  const filterConfig = useMemo<FilterBarConfig<CategoryFilters>>(
    () => ({
      search: { placeholder: 'Search categories by name...' },
      fields: [],
      defaults: { search: '' },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const {
    data: categories = [],
    isFetching,
    refetch: refetchCategories,
  } = useGetCategoriesQuery({
    includeProductCount: true,
    search: appliedFilters.search || undefined,
  })

  const [createCategory] = useCreateCategoryMutation()
  const [updateCategory] = useUpdateCategoryMutation()
  const [deleteCategory] = useDeleteCategoryMutation()

  // Duplicate state surfaced from CategoryDialogs
  const [isDuplicateName, setIsDuplicateName] = useState(false)
  const [duplicateNameError, setDuplicateNameError] = useState<string | null>(null)

  // resetForm ref — set by CategoryDialogs via onFormReady callback
  const resetFormRef = useRef<((values: { name: string; parentId: string | null }) => void) | null>(null)

  const handleFormReady = useCallback((resetFn: (values: { name: string; parentId: string | null }) => void) => {
    resetFormRef.current = resetFn
  }, [])

  const handleDuplicateStateChange = useCallback((isDuplicate: boolean, error: string | null) => {
    setIsDuplicateName(isDuplicate)
    setDuplicateNameError(error)
  }, [])

  const resetForm = useCallback((values: { name: string; parentId: string | null }) => {
    resetFormRef.current?.(values)
  }, [])

  const selection = useCategoriesSelection({
    dispatch,
    categories,
    selectedCategory,
    focusedCategoryIndex: pageState.focusedCategoryIndex,
    setFocusedCategoryIndex: pageState.setFocusedCategoryIndex,
    categoryListRef: pageState.categoryListRef,
  })

  const actions = useCategoriesActions({
    categories,
    selectedCategory,
    editMode: pageState.editMode,
    isDuplicateName,
    duplicateNameError,
    deleteCategory,
    createCategory,
    updateCategory,
    showSuccess,
    showError,
    refetchCategories,
    setDialogOpen: pageState.setDialogOpen,
    setEditMode: pageState.setEditMode,
    setDeleteConfirmOpen: pageState.setDeleteConfirmOpen,
    setCategoryToDelete: pageState.setCategoryToDelete,
    setSmartDeleteOpen: pageState.setSmartDeleteOpen,
    setDeleteError: pageState.setDeleteError,
    setSubmitting: pageState.setSubmitting,
    resetForm,
  })

  useKeyboardShortcuts({
    onSearch: () => {
      pageState.searchInputRef.current?.focus()
      pageState.searchInputRef.current?.select()
    },
    onArrowUp: selection.handleNavigateUp,
    onArrowDown: selection.handleNavigateDown,
    onHome: selection.handleNavigateToFirst,
    onEnd: selection.handleNavigateToLast,
    onPageUp: selection.handlePageUpNavigation,
    onPageDown: selection.handlePageDownNavigation,
    onEscape: selection.handleEscapeAction,
  })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        variant="workflow"
        title="Categories"
        subtitle={`Organize your products with categories (${categories.length} ${appliedFilters.search ? 'found' : 'total'})`}
        primaryAction={{ label: 'Add Category', onClick: () => actions.handleAddCategory() }}
        secondaryAction={{
          label: 'View Deleted',
          onClick: () => pageState.setDeletedCategoriesDialogOpen(true),
        }}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
          />
        )}
      />

      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={(
          <CategoryList
            categories={categories}
            loading={isFetching}
            selectedCategoryId={selectedCategory?.id}
            focusedIndex={pageState.focusedCategoryIndex}
            onSelect={selection.handleCategorySelect}
            categoryListRef={pageState.categoryListRef}
          />
        )}
        headerSlot={(
          <CategoryContextHeader
            selectedCategory={selectedCategory}
            onEdit={() => selectedCategory && actions.handleEditCategory(selectedCategory)}
            onDelete={() => selectedCategory && actions.handleDeleteCategory(selectedCategory)}
          />
        )}
        workspaceSlot={<CategoryWorkspaceCard selectedCategory={selectedCategory} />}
      />

      <CategoryDialogs
        dialogOpen={pageState.dialogOpen}
        editMode={pageState.editMode}
        selectedCategory={selectedCategory}
        submitting={pageState.submitting}
        categories={categories}
        onSubmit={actions.onSubmit}
        onDialogClose={() => pageState.setDialogOpen(false)}
        onFormReady={handleFormReady}
        onDuplicateStateChange={handleDuplicateStateChange}
        deletedCategoriesDialogOpen={pageState.deletedCategoriesDialogOpen}
        onCloseDeletedCategories={() => pageState.setDeletedCategoriesDialogOpen(false)}
        onCategoryRestored={() => void refetchCategories()}
        deleteConfirmOpen={pageState.deleteConfirmOpen}
        categoryToDelete={pageState.categoryToDelete}
        onConfirmDelete={() => void actions.handleConfirmDelete(pageState.categoryToDelete)}
        onCancelDelete={actions.handleCancelDelete}
        smartDeleteOpen={pageState.smartDeleteOpen}
        deleteError={pageState.deleteError}
        onSmartDelete={(moveToUncategorized) =>
          actions.handleSmartDelete(pageState.categoryToDelete, moveToUncategorized)
        }
        onSmartDeleteClose={actions.handleSmartDeleteClose}
      />
    </Box>
  )
}

export default CategoriesPage
```

- [ ] **Step 2: Type-check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/inventory/CategoriesPage.tsx
git commit -m "feat(inventory): rewrite CategoriesPage using Master-Detail pattern (closes #344)"
```

---

## Task 10: Verification

- [ ] **Step 1: Run the component and hook tests**

```bash
cd frontend && npx vitest run src/pages/inventory/hooks/useCategoriesSelection.test.tsx src/pages/inventory/components/CategoryList.test.tsx
```

Expected: all 9 tests pass.

- [ ] **Step 2: Run the full frontend type check**

```bash
cd frontend && npm run type-check
```

Expected: no errors.

- [ ] **Step 3: Manual verification in the browser**

Start the dev server:

```bash
cd frontend && npm run dev
```

Navigate to the Categories page and verify each item:

- [ ] Hierarchical indentation is correct (child categories indented under parents)
- [ ] Clicking a category shows its name + path in the context header with Edit/Delete buttons
- [ ] Workspace card Details tab shows full path, level, parent, product count, created date
- [ ] Workspace card Products tab shows products in the selected category (or "No products" if empty)
- [ ] Edit button in context header opens the form dialog pre-filled with the category's data
- [ ] Delete button triggers confirm dialog; for a category with products, escalates to smart delete dialog
- [ ] Smart delete dialog allows moving products to Uncategorized before deleting
- [ ] FilterBar search filters the category list
- [ ] Arrow keys navigate the list; Escape deselects; Home/End jump to first/last
- [ ] "Add Category" opens a blank form dialog
- [ ] "View Deleted" opens the deleted categories dialog; restoring a category refreshes the list
- [ ] Real-time duplicate name validation shows an error in the form when a duplicate name is typed

- [ ] **Step 4: Final commit (if any manual fixes were made)**

```bash
git add -p
git commit -m "fix(inventory): address post-review issues in CategoriesPage refactor"
```
