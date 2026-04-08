import React, { useEffect, useMemo, useState } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetSuppliersQuery } from '@/store/api/purchasingApi'
import { selectSelectedSupplier } from '@/store/slices/purchasingSlice'
import type { FilterBarConfig } from '@/types/filterBar.types'

import SupplierContextHeader from './components/SupplierContextHeader'
import SuppliersDialogs from './components/SuppliersDialogs'
import SupplierList from './components/SupplierList'
import SupplierWorkspaceCard from './components/SupplierWorkspaceCard'
import { useSuppliersActions } from './hooks/useSuppliersActions'
import { useSuppliersPageState } from './hooks/useSuppliersPageState'
import { useSuppliersSelection } from './hooks/useSuppliersSelection'

interface SupplierFilters {
  search: string
  status: 'active' | 'inactive' | null
}

const SuppliersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const selectedSupplier = useAppSelector(selectSelectedSupplier)
  const [pageError, setPageError] = useState<string | null>(null)

  const pageState = useSuppliersPageState()

  const filterConfig = useMemo<FilterBarConfig<SupplierFilters>>(
    () => ({
      search: { placeholder: 'Search by company name...' },
      fields: [
        {
          field: 'status',
          label: 'Status',
          type: 'select',
          options: [
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Inactive' },
          ],
        },
      ],
      defaults: { search: '', status: null },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      pageState.setShouldPreserveSearchFocus(true)
      handlers.onSearchChange(value)
    },
  }), [handlers, pageState])

  const supplierQueryParams = useMemo(
    () => ({
      search: appliedFilters.search || undefined,
      isActive:
        appliedFilters.status === 'active'
          ? true
          : appliedFilters.status === 'inactive'
            ? false
            : undefined,
    }),
    [appliedFilters],
  )

  const { data: suppliersResponse, isLoading, isFetching, error, refetch } = useGetSuppliersQuery(supplierQueryParams)
  const suppliers = suppliersResponse?.data ?? []
  const loading = isLoading || isFetching

  useEffect(() => {
    if (
      pageState.shouldPreserveSearchFocus &&
      pageState.searchInputRef.current &&
      document.activeElement !== pageState.searchInputRef.current
    ) {
      const timer = setTimeout(() => {
        pageState.searchInputRef.current?.focus()
        pageState.setShouldPreserveSearchFocus(false)
      }, 0)
      return () => clearTimeout(timer)
    }

    if (pageState.shouldPreserveSearchFocus) {
      pageState.setShouldPreserveSearchFocus(false)
    }
  }, [loading, pageState])

  const selection = useSuppliersSelection({
    dispatch,
    suppliers,
    selectedSupplier,
    focusedSupplierIndex: pageState.focusedSupplierIndex,
    setFocusedSupplierIndex: pageState.setFocusedSupplierIndex,
    navigate,
    supplierListRef: pageState.supplierListRef,
    setDeleteConfirmOpen: pageState.setDeleteConfirmOpen,
    setDeletedSuppliersDialogOpen: pageState.setDeletedSuppliersDialogOpen,
  })

  const actions = useSuppliersActions({
    dispatch,
    selectedSupplier,
    refetchSuppliers: () => {
      void refetch()
    },
    showSuccess,
    showError,
    setDeleteConfirmOpen: pageState.setDeleteConfirmOpen,
    setPageError,
  })

  useKeyboardShortcuts({
    onSearch: () => {
      pageState.searchInputRef.current?.focus()
      pageState.searchInputRef.current?.select()
    },
    onArrowUp: selection.handleNavigateUp,
    onArrowDown: selection.handleNavigateDown,
    onEnter: selection.handleEnterAction,
    onPageUp: selection.handlePageUpNavigation,
    onPageDown: selection.handlePageDownNavigation,
    onHome: selection.handleNavigateToFirst,
    onEnd: selection.handleNavigateToLast,
    onEscape: selection.handleEscapeAction,
  })

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title="Suppliers"
        subtitle="Manage your suppliers and vendor relationships"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedSuppliersDialogOpen(true) }}
        primaryAction={{ label: 'New Supplier', onClick: () => navigate('/purchasing/suppliers/create') }}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={filterHandlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
          />
        )}
      />

      {(pageError || error) && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPageError(null)}>
          {pageError || 'Failed to load suppliers.'}
        </Alert>
      )}

      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={(
          <SupplierList
            suppliers={suppliers}
            loading={loading}
            total={suppliers.length}
            selectedSupplierId={selectedSupplier?.id}
            focusedIndex={pageState.focusedSupplierIndex}
            onSelect={selection.handleSupplierSelect}
            supplierListRef={pageState.supplierListRef}
          />
        )}
        headerSlot={(
          <SupplierContextHeader
            selectedSupplier={selectedSupplier}
            onEdit={() => navigate(`/purchasing/suppliers/${selectedSupplier!.id}/edit`)}
            onDelete={() => pageState.setDeleteConfirmOpen(true)}
          />
        )}
        workspaceSlot={<SupplierWorkspaceCard selectedSupplier={selectedSupplier} />}
      />

      <SuppliersDialogs
        selectedSupplier={selectedSupplier}
        deleteConfirmOpen={pageState.deleteConfirmOpen}
        onConfirmDelete={actions.handleDelete}
        onCancelDelete={actions.handleCancelDelete}
        deletedSuppliersDialogOpen={pageState.deletedSuppliersDialogOpen}
        onCloseDeletedSuppliersDialog={() => pageState.setDeletedSuppliersDialogOpen(false)}
      />
    </Box>
  )
}

export default SuppliersPage
