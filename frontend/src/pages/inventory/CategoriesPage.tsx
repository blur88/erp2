import React, { useCallback, useMemo, useRef, useState } from 'react'

import GenericListPage from '@/components/common/GenericListPage'
import { FilterCategoryLevel } from '@/components/filters'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetCategoriesQuery } from '@/store/api/inventoryApi'
import { selectSelectedCategory } from '@/store/slices/inventorySlice'
import type { FilterBarConfig } from '@/types/filterBar.types'

import CategoryContextHeader from './components/CategoryContextHeader'
import CategoryDialogs from './components/CategoryDialogs'
import CategoryList from './components/CategoryList'
import CategoryWorkspaceCard from './components/CategoryWorkspaceCard'
import { useCategoriesWorkspace } from './hooks/useCategoriesWorkspace'

interface CategoryFilters {
  search: string
}

const CategoriesPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const selectedCategory = useAppSelector(selectSelectedCategory)
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [levelFilter, setLevelFilter] = useState<string | null>(null)

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  const filterConfig = useMemo<FilterBarConfig<CategoryFilters>>(
    () => ({
      search: { placeholder: 'Search categories by name...' },
      fields: [],
      defaults: { search: '' },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const categoryHandlers = useMemo(
    () => ({ ...handlers, onClearAll: () => { handlers.onClearAll(); setLevelFilter(null) } }),
    [handlers],
  )

  const {
    data: categories = [],
    isFetching,
    refetch: refetchCategories,
  } = useGetCategoriesQuery({
    includeProductCount: true,
    search: appliedFilters.search || undefined,
    sortBy,
    sortOrder: sortOrder.toUpperCase(),
  })

  const visibleCategories = levelFilter !== null
    ? categories.filter((category) => String(category.level) === levelFilter)
    : categories

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

  const workspace = useCategoriesWorkspace({
    dispatch,
    categories: visibleCategories,
    selectedCategory,
    isDuplicateName,
    duplicateNameError,
    refetchCategories: () => {
      void refetchCategories()
    },
    resetForm,
  })

  return (
    <GenericListPage
      title="Categories"
      subtitle={`Organize your products with categories (${visibleCategories.length} ${appliedFilters.search || levelFilter ? 'found' : 'total'})`}
      primaryAction={{ label: 'Add Category', onClick: () => workspace.handleAddCategory() }}
      secondaryAction={{
        label: 'View Deleted',
        onClick: () => workspace.setDeletedCategoriesDialogOpen(true),
      }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={categoryHandlers}
      hasActiveFilters={hasActiveFilters || levelFilter !== null}
      searchInputRef={workspace.searchInputRef}
      sort={{ field: 'name', sortBy, sortOrder, onSort: handleSort }}
      filterExtra={(
        <FilterCategoryLevel
          categories={categories}
          value={levelFilter}
          onChange={setLevelFilter}
        />
      )}
      listSlot={(
        <CategoryList
          categories={visibleCategories}
          loading={isFetching}
          selectedCategoryId={selectedCategory?.id}
          focusedIndex={workspace.focusedIndex}
          onSelect={workspace.handleSelect}
          categoryListRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <CategoryContextHeader
          selectedCategory={selectedCategory}
          allCategories={categories}
          onEdit={() => selectedCategory && workspace.handleEditCategory(selectedCategory)}
          onDelete={() => selectedCategory && workspace.handleDeleteCategory(selectedCategory)}
        />
      )}
      workspaceSlot={<CategoryWorkspaceCard selectedCategory={selectedCategory} />}
      dialogs={(
        <CategoryDialogs
          dialogOpen={workspace.dialogOpen}
          editMode={workspace.editMode}
          selectedCategory={selectedCategory}
          submitting={workspace.submitting}
          categories={categories}
          onSubmit={workspace.onSubmit}
          onDialogClose={() => workspace.setDialogOpen(false)}
          onFormReady={handleFormReady}
          onDuplicateStateChange={handleDuplicateStateChange}
          deletedCategoriesDialogOpen={workspace.deletedCategoriesDialogOpen}
          onCloseDeletedCategories={() => workspace.setDeletedCategoriesDialogOpen(false)}
          onCategoryRestored={() => void refetchCategories()}
          deleteConfirmOpen={workspace.deleteConfirmOpen}
          categoryToDelete={workspace.categoryToDelete}
          onConfirmDelete={() => void workspace.handleConfirmDelete(workspace.categoryToDelete)}
          onCancelDelete={workspace.handleCancelDelete}
          smartDeleteOpen={workspace.smartDeleteOpen}
          deleteError={workspace.deleteError}
          onSmartDelete={(moveToUncategorized) =>
            workspace.handleSmartDelete(workspace.categoryToDelete, moveToUncategorized)
          }
          onSmartDeleteClose={workspace.handleSmartDeleteClose}
        />
      )}
    />
  )
}

export default CategoriesPage
