import React, { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useDeleteSupplierMutation,
  useGetSuppliersQuery,
} from '@/store/api/purchasingApi'
import {
  selectSelectedSupplier,
  setSelectedSupplier,
} from '@/store/slices/purchasingSlice'
import type { FilterBarConfig } from '@/types/filterBar.types'

import SupplierContextHeader from './components/SupplierContextHeader'
import SupplierList from './components/SupplierList'
import SuppliersDialogs from './components/SuppliersDialogs'
import SupplierWorkspaceCard from './components/SupplierWorkspaceCard'

interface SupplierFilters {
  search: string
  status: 'active' | 'inactive' | null
  type: 'local' | 'international' | null
}

const filterConfig: FilterBarConfig<SupplierFilters> = {
  search: { placeholder: 'Search by company name...' },
  fields: [
    { field: 'status', label: 'Status', type: 'status' },
    { field: 'type', label: 'Supplier Type', type: 'supplier-type' },
  ],
  defaults: { search: '', status: null, type: null },
}

const SuppliersPage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const selectedSupplier = useAppSelector(selectSelectedSupplier)
  const [pageError, setPageError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState('companyName')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  const queryParams = useMemo(() => ({
    search: appliedFilters.search || undefined,
    isActive:
      appliedFilters.status === 'active'
        ? true
        : appliedFilters.status === 'inactive'
          ? false
          : undefined,
    type: appliedFilters.type ?? undefined,
    sortBy,
    sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
  }), [appliedFilters, sortBy, sortOrder])

  const { data: suppliersResponse, isLoading, isFetching, error, refetch } = useGetSuppliersQuery(queryParams)
  const [deleteSupplier] = useDeleteSupplierMutation()
  const suppliers = suppliersResponse?.data ?? []

  const workspace = useEntityWorkspace({
    entities: suppliers,
    selectedEntity: selectedSupplier,
    selectEntity: (supplier) => {
      dispatch(setSelectedSupplier(supplier))
    },
    refetch: () => {
      void refetch()
    },
    navigate,
    routes: {
      create: '/purchasing/suppliers/create',
      edit: (id) => `/purchasing/suppliers/${id}/edit`,
    },
    notifications: {
      showSuccess,
      showError: (message) => {
        setPageError(message)
        showError(message)
      },
    },
    deleteMutation: (id) => deleteSupplier(id).unwrap(),
  })

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      workspace.setShouldPreserveSearchFocus(true)
      handlers.onSearchChange(value)
    },
  }), [handlers, workspace])

  return (
    <GenericListPage
      title="Suppliers"
      subtitle="Manage your suppliers and vendor relationships"
      primaryAction={{ label: 'New Supplier', onClick: () => navigate('/purchasing/suppliers/create') }}
      secondaryAction={{ label: 'View Deleted', onClick: () => workspace.setDeletedEntitiesDialogOpen(true) }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={filterHandlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{ field: 'companyName', sortBy, sortOrder, onSort: handleSort }}
      error={pageError || (error ? 'Failed to load suppliers.' : null)}
      onErrorClose={() => setPageError(null)}
      listSlot={(
        <SupplierList
          suppliers={suppliers}
          loading={isLoading || isFetching}
          total={suppliers.length}
          selectedSupplierId={selectedSupplier?.id}
          focusedIndex={workspace.focusedIndex}
          onSelect={workspace.handleSelect}
          supplierListRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <SupplierContextHeader
          selectedSupplier={selectedSupplier}
          onEdit={() => navigate(`/purchasing/suppliers/${selectedSupplier!.id}/edit`)}
          onDelete={() => workspace.setDeleteConfirmOpen(true)}
        />
      )}
      workspaceSlot={<SupplierWorkspaceCard selectedSupplier={selectedSupplier} />}
      dialogs={(
        <SuppliersDialogs
          selectedSupplier={selectedSupplier}
          deleteConfirmOpen={workspace.deleteConfirmOpen}
          onConfirmDelete={workspace.handleDelete}
          onCancelDelete={workspace.handleCancelDelete}
          deletedSuppliersDialogOpen={workspace.deletedEntitiesDialogOpen}
          onCloseDeletedSuppliersDialog={() => workspace.setDeletedEntitiesDialogOpen(false)}
        />
      )}
    />
  )
}

export default SuppliersPage
