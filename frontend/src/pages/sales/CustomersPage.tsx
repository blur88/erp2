import React, { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useDeleteCustomerMutation,
  useGetCustomersQuery,
} from '@/store/api/salesApi'
import {
  selectSelectedCustomer,
  setSelectedCustomer,
} from '@/store/slices/salesSlice'
import type { FilterBarConfig } from '@/types/filterBar.types'

import CustomerContextHeader from './components/CustomerContextHeader'
import CustomersDialogs from './components/CustomersDialogs'
import CustomerList from './components/CustomerList'
import CustomerWorkspaceCard from './components/CustomerWorkspaceCard'

interface CustomerFilters {
  search: string
  status: 'active' | 'inactive' | null
  type: 'individual' | 'business' | null
  priceListId: string | null
}

const filterConfig: FilterBarConfig<CustomerFilters> = {
  search: { placeholder: 'Search by name or phone...' },
  fields: [
    { field: 'status', label: 'Status', type: 'status' },
    { field: 'type', label: 'Customer Type', type: 'customer-type' },
    { field: 'priceListId', label: 'Price List', type: 'price-list' },
  ],
  defaults: { search: '', status: null, type: null, priceListId: null },
}

const CustomersPage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const selectedCustomer = useAppSelector(selectSelectedCustomer)
  const [pageError, setPageError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState('name')
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
    priceListId: appliedFilters.priceListId ?? undefined,
    sortBy,
    sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
  }), [appliedFilters, sortBy, sortOrder])

  const { data: customersResponse, isLoading, isFetching, error, refetch } = useGetCustomersQuery(queryParams)
  const [deleteCustomer] = useDeleteCustomerMutation()
  const customers = customersResponse?.data ?? []

  const workspace = useEntityWorkspace({
    entities: customers,
    selectedEntity: selectedCustomer,
    selectEntity: (customer) => {
      dispatch(setSelectedCustomer(customer))
    },
    refetch: () => {
      void refetch()
    },
    navigate,
    routes: {
      create: '/sales/customers/create',
      edit: (id) => {
        const customer = customers.find((item) => item.id === id)
        if (!customer?.slug) throw new Error(`Customer ${id} not found in list`)
        return `/sales/customers/${customer.slug}/edit`
      },
    },
    highlightParam: 'highlight',
    notifications: {
      showSuccess,
      showError: (message) => {
        setPageError(message)
        showError(message)
      },
    },
    deleteMutation: (id) => deleteCustomer(id).unwrap(),
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
      title="Customers"
      subtitle="View customer profiles and client account details"
      primaryAction={{ label: 'New Customer', onClick: () => navigate('/sales/customers/create') }}
      secondaryAction={{ label: 'View Deleted', onClick: () => workspace.setDeletedEntitiesDialogOpen(true) }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={filterHandlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{ field: 'name', sortBy, sortOrder, onSort: handleSort }}
      error={pageError || (error ? 'Failed to load customers.' : null)}
      onErrorClose={() => setPageError(null)}
      listSlot={(
        <CustomerList
          customers={customers}
          loading={isLoading || isFetching}
          total={customers.length}
          selectedCustomerId={selectedCustomer?.id}
          focusedIndex={workspace.focusedIndex}
          onSelect={workspace.handleSelect}
          customerListRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <CustomerContextHeader
          selectedCustomer={selectedCustomer}
          onEdit={() => navigate(`/sales/customers/${selectedCustomer!.slug}/edit`)}
          onDelete={() => workspace.setDeleteConfirmOpen(true)}
        />
      )}
      workspaceSlot={<CustomerWorkspaceCard selectedCustomer={selectedCustomer} />}
      dialogs={(
        <CustomersDialogs
          selectedCustomer={selectedCustomer}
          deleteConfirmOpen={workspace.deleteConfirmOpen}
          onConfirmDelete={workspace.handleDelete}
          onCancelDelete={workspace.handleCancelDelete}
          deletedCustomersDialogOpen={workspace.deletedEntitiesDialogOpen}
          onCloseDeletedCustomersDialog={() => workspace.setDeletedEntitiesDialogOpen(false)}
        />
      )}
    />
  )
}

export default CustomersPage
