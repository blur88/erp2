import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetCustomersQuery } from '@/store/api/salesApi'
import { selectSelectedCustomer } from '@/store/slices/salesSlice'
import type { FilterBarConfig } from '@/types/filterBar.types'
import CustomerContextHeader from './components/CustomerContextHeader'
import CustomersDialogs from './components/CustomersDialogs'
import CustomerList from './components/CustomerList'
import CustomerWorkspaceCard from './components/CustomerWorkspaceCard'
import { useCustomersActions } from './hooks/useCustomersActions'
import { useCustomersPageState } from './hooks/useCustomersPageState'
import { useCustomersSelection } from './hooks/useCustomersSelection'

interface CustomerFilters {
  search: string
  status: 'active' | 'inactive' | null
}

const CustomersPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { showSuccess, showError } = useNotification()
  const selectedCustomer = useAppSelector(selectSelectedCustomer)
  const [pageError, setPageError] = useState<string | null>(null)

  const pageState = useCustomersPageState()
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const filterConfig = useMemo<FilterBarConfig<CustomerFilters>>(
    () => ({
      search: { placeholder: 'Search by name or phone...' },
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

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      pageState.setShouldPreserveSearchFocus(true)
      handlers.onSearchChange(value)
    },
  }), [handlers, pageState])

  const customerQueryParams = useMemo(
    () => ({
      search: appliedFilters.search || undefined,
      isActive:
        appliedFilters.status === 'active'
          ? true
          : appliedFilters.status === 'inactive'
            ? false
            : undefined,
      sortBy,
      sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
    }),
    [appliedFilters, sortBy, sortOrder],
  )

  const { data: customersResponse, isLoading, isFetching, error, refetch } = useGetCustomersQuery(customerQueryParams)
  const customers = customersResponse?.data ?? []
  const loading = isLoading || isFetching

  useEffect(() => {
    if (pageState.shouldPreserveSearchFocus && pageState.searchInputRef.current && document.activeElement !== pageState.searchInputRef.current) {
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

  const selection = useCustomersSelection({
    dispatch,
    customers,
    selectedCustomer,
    focusedCustomerIndex: pageState.focusedCustomerIndex,
    setFocusedCustomerIndex: pageState.setFocusedCustomerIndex,
    navigate,
    customerListRef: pageState.customerListRef,
    setDeleteConfirmOpen: pageState.setDeleteConfirmOpen,
    setDeletedCustomersDialogOpen: pageState.setDeletedCustomersDialogOpen,
  })

  const actions = useCustomersActions({
    dispatch,
    selectedCustomer,
    refetchCustomers: () => {
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
        title="Customers"
        subtitle="View customer profiles and client account details"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedCustomersDialogOpen(true) }}
        primaryAction={{ label: 'New Customer', onClick: () => navigate('/sales/customers/create') }}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={filterHandlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
            sort={{ field: 'name', sortBy, sortOrder, onSort: handleSort }}
          />
        )}
      />

      {(pageError || error) && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setPageError(null)}>
          {pageError || 'Failed to load customers.'}
        </Alert>
      )}

      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={(
          <CustomerList
            customers={customers}
            loading={loading}
            total={customers.length}
            selectedCustomerId={selectedCustomer?.id}
            focusedIndex={pageState.focusedCustomerIndex}
            onSelect={selection.handleCustomerSelect}
            customerListRef={pageState.customerListRef}
          />
        )}
        headerSlot={(
          <CustomerContextHeader
            selectedCustomer={selectedCustomer}
            onEdit={() => navigate(`/sales/customers/${selectedCustomer!.id}/edit`)}
            onDelete={() => pageState.setDeleteConfirmOpen(true)}
          />
        )}
        workspaceSlot={<CustomerWorkspaceCard selectedCustomer={selectedCustomer} />}
      />

      <CustomersDialogs
        selectedCustomer={selectedCustomer}
        deleteConfirmOpen={pageState.deleteConfirmOpen}
        onConfirmDelete={actions.handleDelete}
        onCancelDelete={actions.handleCancelDelete}
        deletedCustomersDialogOpen={pageState.deletedCustomersDialogOpen}
        onCloseDeletedCustomersDialog={() => pageState.setDeletedCustomersDialogOpen(false)}
      />
    </Box>
  )
}

export default CustomersPage
