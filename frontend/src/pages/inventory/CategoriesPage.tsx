import React, { useCallback, useMemo, useRef, useState } from 'react'
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
import { selectSelectedCategory } from '@/store/slices/inventorySlice'
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
  const [isDuplicateName, setIsDuplicateName] = useState(false)
  const [duplicateNameError, setDuplicateNameError] = useState<string | null>(null)
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
    refetchCategories: () => {
      void refetchCategories()
    },
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
            allCategories={categories}
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
