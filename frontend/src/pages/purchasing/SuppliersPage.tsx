import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import PagePagination from '@/components/common/PagePagination'
import SimpleListPage from '@/components/common/SimpleListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import {
  useGetSuppliersQuery,
  useUpdateSupplierMutation,
} from '@/store/api/purchasingApi'
import type { Supplier } from '@/types'
import type { FilterBarConfig } from '@/types/filterBar.types'

import SupplierList from './components/SupplierList'

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

const PAGE_SIZE_OPTIONS = [10, 25, 50]
const DEFAULT_LIMIT = 25

const SuppliersPage: React.FC = () => {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [pageError, setPageError] = useState<string | null>(null)
  const [sortBy, setSortBy] = useState('companyName')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_LIMIT)

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)
  const [updateSupplier] = useUpdateSupplierMutation()

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
      primaryAction={{ label: 'New Supplier', onClick: () => navigate('/purchasing/suppliers/create') }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      sort={{ field: 'companyName', sortBy, sortOrder, onSort: handleSort }}
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
              onLimitChange={handleLimitChange}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          )}
        />
      )}
    />
  )
}

export default SuppliersPage
