import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import PagePagination from '@/components/common/PagePagination'
import SimpleListPage from '@/components/common/SimpleListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useListUrlState } from '@/hooks/useListUrlState'
import { withCurrentListQuery } from '@/utils/listQuery'
import { useNotification } from '@/hooks/useNotification'
import {
  useGetCustomersQuery,
  useUpdateCustomerMutation,
} from '@/store/api/salesApi'
import type { Customer } from '@/types'
import { STATUS_OPTIONS, CUSTOMER_TYPE_OPTIONS } from '@/constants/filterOptions'
import type { FilterBarConfig } from '@/types/filterBar.types'
import { PAGINATION } from '@/constants/tableStyles'

import CustomerList from './components/CustomerList'

interface CustomerFilters {
  search: string
  status: 'active' | 'inactive' | null
  type: 'individual' | 'business' | null
  priceListId: string | null
}

const filterConfig: FilterBarConfig<CustomerFilters> = {
  search: { placeholder: 'Search by name or phone...' },
  fields: [
    { field: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
    { field: 'type', label: 'Customer Type', type: 'select', options: CUSTOMER_TYPE_OPTIONS },
    { field: 'priceListId', label: 'Price List', type: 'price-list' },
  ],
  defaults: { search: '', status: null, type: null, priceListId: null },
}

const CustomersPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { showSuccess, showError } = useNotification()
  const [pageError, setPageError] = useState<string | null>(null)
  const { sortBy, sortOrder, page, limit, setPage, setLimit, setSort, resetPage } =
    useListUrlState({
      sort: { fields: ['name'], defaultField: 'name', defaultOrder: 'asc' },
    })

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig, {
    onApply: resetPage,
  })
  const [updateCustomer] = useUpdateCustomerMutation()

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
    page,
    limit,
  }), [appliedFilters, sortBy, sortOrder, page, limit])

  const { data: customersResponse, isLoading, isFetching, error } = useGetCustomersQuery(queryParams)
  const customers = customersResponse?.data ?? []
  const total = customersResponse?.meta.total ?? 0

  const handleStatusToggle = useCallback(async (customer: Customer) => {
    try {
      await updateCustomer({ id: customer.id, data: { isActive: !customer.isActive } }).unwrap()
      showSuccess(
        customer.isActive
          ? `${customer.name} set as inactive`
          : `${customer.name} reactivated`,
      )
    } catch {
      const msg = customer.isActive
        ? `Failed to deactivate ${customer.name}`
        : `Failed to reactivate ${customer.name}`
      setPageError(msg)
      showError(msg)
    }
  }, [updateCustomer, showSuccess, showError])

  return (
    <SimpleListPage
      title="Customers"
      subtitle="Manage customer records and active/inactive status."
      primaryAction={{ label: 'New Customer', onClick: () => navigate(withCurrentListQuery('/sales/customers/create')) }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      sort={{ field: 'name', sortBy, sortOrder, onSort: setSort }}
      isFetching={isFetching}
      error={pageError || (error ? 'Failed to load customers.' : null)}
      onErrorClose={() => setPageError(null)}
      tableSlot={(
        <CustomerList
          customers={customers}
          loading={isLoading || isFetching}
          total={total}
          onStatusToggle={handleStatusToggle}
          paginationSlot={(
            <PagePagination
              total={total}
              page={page}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={setLimit}
              pageSizeOptions={PAGINATION.options}
            />
          )}
        />
      )}
    />
  )
}

export default CustomersPage
