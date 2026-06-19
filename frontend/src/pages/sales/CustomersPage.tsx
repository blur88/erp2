import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import PagePagination from '@/components/common/PagePagination'
import SimpleListPage from '@/components/common/SimpleListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import {
  useGetCustomersQuery,
  useUpdateCustomerMutation,
} from '@/store/api/salesApi'
import type { Customer } from '@/types'
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
    { field: 'status', label: 'Status', type: 'status' },
    { field: 'type', label: 'Customer Type', type: 'customer-type' },
    { field: 'priceListId', label: 'Price List', type: 'price-list' },
  ],
  defaults: { search: '', status: null, type: null, priceListId: null },
}

const CustomersPage: React.FC = () => {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [pageError, setPageError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState<number>(PAGINATION.defaultPageSize)

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const [updateCustomer] = useUpdateCustomerMutation()

  useEffect(() => {
    setPage(1)
  }, [appliedFilters])

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
    setPage(1)
  }, [sortBy])

  const handleLimitChange = useCallback((newLimit: number) => {
    setLimit(newLimit)
    setPage(1)
  }, [])

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
      primaryAction={{ label: 'New Customer', onClick: () => navigate('/sales/customers/create') }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      sort={{ field: 'name', sortBy, sortOrder, onSort: handleSort }}
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
              onLimitChange={handleLimitChange}
              pageSizeOptions={PAGINATION.options}
            />
          )}
        />
      )}
    />
  )
}

export default CustomersPage
