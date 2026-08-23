import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import PagePagination from '@/components/common/PagePagination'
import SimpleListPage from '@/components/common/SimpleListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useListUrlState } from '@/hooks/useListUrlState'
import { withListQuery } from '@/utils/listQuery'
import { useNotification } from '@/hooks/useNotification'
import {
  useGetSuppliersQuery,
  useUpdateSupplierMutation,
} from '@/store/api/purchasingApi'
import type { Supplier } from '@/types'
import { STATUS_OPTIONS, SUPPLIER_TYPE_OPTIONS } from '@/constants/filterOptions'
import type { FilterBarConfig } from '@/types/filterBar.types'
import { PAGINATION } from '@/constants/tableStyles'

import SupplierList from './components/SupplierList'

interface SupplierFilters {
  search: string
  status: 'active' | 'inactive' | null
  type: 'local' | 'international' | null
}

const filterConfig: FilterBarConfig<SupplierFilters> = {
  search: { placeholder: 'Search by company name...' },
  fields: [
    { field: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
    { field: 'type', label: 'Supplier Type', type: 'select', options: SUPPLIER_TYPE_OPTIONS },
  ],
  defaults: { search: '', status: null, type: null },
}

const SuppliersPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { showSuccess, showError } = useNotification()
  const [pageError, setPageError] = useState<string | null>(null)
  const { sortBy, sortOrder, page, limit, setPage, setLimit, setSort, resetPage } =
    useListUrlState({
      sort: { fields: ['companyName'], defaultField: 'companyName', defaultOrder: 'asc' },
    })

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig, {
    onApply: resetPage,
  })
  const [updateSupplier] = useUpdateSupplierMutation()

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
    page,
    limit,
  }), [appliedFilters, sortBy, sortOrder, page, limit])

  const { data: suppliersResponse, isLoading, isFetching, error } = useGetSuppliersQuery(queryParams)
  const suppliers = suppliersResponse?.data ?? []
  const total = suppliersResponse?.meta.total ?? 0

  const handleStatusToggle = useCallback(async (supplier: Supplier) => {
    try {
      await updateSupplier({ id: supplier.id, data: { isActive: !supplier.isActive } }).unwrap()
      showSuccess(
        supplier.isActive
          ? `${supplier.companyName} set as inactive`
          : `${supplier.companyName} reactivated`,
      )
    } catch {
      const msg = supplier.isActive
        ? `Failed to deactivate ${supplier.companyName}`
        : `Failed to reactivate ${supplier.companyName}`
      setPageError(msg)
      showError(msg)
    }
  }, [updateSupplier, showSuccess, showError])

  return (
    <SimpleListPage
      title="Suppliers"
      subtitle="Manage your suppliers and vendor relationships."
      primaryAction={{ label: 'New Supplier', onClick: () => navigate(withListQuery('/purchasing/suppliers/create', location.search)) }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      sort={{ field: 'companyName', sortBy, sortOrder, onSort: setSort }}
      isFetching={isFetching}
      error={pageError || (error ? 'Failed to load suppliers.' : null)}
      onErrorClose={() => setPageError(null)}
      tableSlot={(
        <SupplierList
          suppliers={suppliers}
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

export default SuppliersPage
