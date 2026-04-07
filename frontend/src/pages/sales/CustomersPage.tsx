import React, { useMemo, useState } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters'
import DeletedCustomersDialog from '@/components/sales/DeletedCustomersDialog'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetCustomersQuery } from '@/store/api/salesApi'
import { selectSelectedCustomer } from '@/store/slices/salesSlice'
import type { FilterBarConfig } from '@/types/filterBar.types'
import CustomerContextHeader from './components/CustomerContextHeader'
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

  const customerQueryParams = useMemo(
    () => ({
      search: appliedFilters.search || undefined,
      isActive:
        appliedFilters.status === 'active'
          ? true
          : appliedFilters.status === 'inactive'
            ? false
            : undefined,
      sortBy: 'name',
      sortOrder: 'ASC' as const,
    }),
    [appliedFilters],
  )

  const { data: customersResponse, isLoading, isFetching, error, refetch } = useGetCustomersQuery(customerQueryParams)
  const customers = customersResponse?.data ?? []
  const loading = isLoading || isFetching

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
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
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
            selectedCustomerId={selectedCustomer?.id}
            focusedIndex={pageState.focusedCustomerIndex}
            onSelect={selection.handleCustomerSelect}
            listRef={pageState.customerListRef}
          />
        )}
        headerSlot={(
          <CustomerContextHeader
            selectedCustomer={selectedCustomer}
            onDelete={() => pageState.setDeleteConfirmOpen(true)}
          />
        )}
        workspaceSlot={<CustomerWorkspaceCard selectedCustomer={selectedCustomer} />}
      />

      <ConfirmationDialog
        open={pageState.deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete "${selectedCustomer?.name}"? This will move it to deleted items.`}
        confirmText="Delete Customer"
        cancelText="Cancel"
        onConfirm={actions.handleDelete}
        onCancel={actions.handleCancelDelete}
        severity="warning"
      />

      <DeletedCustomersDialog
        open={pageState.deletedCustomersDialogOpen}
        onClose={() => pageState.setDeletedCustomersDialogOpen(false)}
      />
    </Box>
  )
}

export default CustomersPage
