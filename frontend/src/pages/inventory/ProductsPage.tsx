import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Box } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'

import PagePagination from '@/components/common/PagePagination'
import SimpleListPage from '@/components/common/SimpleListPage'
import ProductImportDialog from '@/components/inventory/ProductImportDialog'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useListUrlState } from '@/hooks/useListUrlState'
import { withListQuery } from '@/utils/listQuery'
import { useNotification } from '@/hooks/useNotification'
import { useGetProductsQuery, useUpdateProductMutation } from '@/store/api/inventoryApi'
import { useGetRegionalSettingsQuery } from '@/store/api/settingsApi'
import { getStockStatus } from '@/utils/stockUtils'
import { PAGINATION } from '@/constants/tableStyles'
import type { Product } from '@/types'
import { STATUS_OPTIONS, STOCK_STATUS_OPTIONS } from '@/constants/filterOptions'
import type { FilterBarConfig } from '@/types/filterBar.types'

import ProductList from './components/ProductList'

interface ProductFilters {
  search: string
  status: 'active' | 'inactive' | null
  categoryId: string | null
  stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock' | null
}

const filterConfig: FilterBarConfig<ProductFilters> = {
  search: { placeholder: 'Search by name or barcode...' },
  fields: [
    { field: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
    { field: 'categoryId', label: 'Category', type: 'category' },
    { field: 'stockStatus', label: 'Stock Status', type: 'select', options: STOCK_STATUS_OPTIONS },
  ],
  defaults: { search: '', status: null, categoryId: null, stockStatus: null },
}

function getDefaultPrice(product: Product): number | null {
  const items = product.priceListItems ?? []
  const def = items.find((it) => it.priceList?.isDefault)
  return def ? def.price : null
}

export default function ProductsPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { showSuccess, showError } = useNotification()
  const [pageError, setPageError] = useState<string | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const { sortBy, sortOrder, page, limit, setPage, setLimit, setSort, resetPage } =
    useListUrlState({
      sort: { fields: ['name'], defaultField: 'name', defaultOrder: 'asc' },
    })

  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig, {
    onApply: resetPage,
  })
  const [updateProduct] = useUpdateProductMutation()

  const queryParams = useMemo(() => {
    const params: Record<string, string | number | boolean | undefined> = {
      sortBy,
      sortOrder: sortOrder.toUpperCase(),
      isActive:
        appliedFilters.status === 'active'
          ? true
          : appliedFilters.status === 'inactive'
            ? false
            : undefined,
    }
    if (appliedFilters.search) params.search = appliedFilters.search
    if (appliedFilters.categoryId) params.categoryId = appliedFilters.categoryId
    if (appliedFilters.stockStatus === 'out_of_stock') params.outOfStock = true
    if (appliedFilters.stockStatus === 'in_stock') params.minStock = 1
    return params
  }, [appliedFilters, sortBy, sortOrder])

  const { data: response, isLoading, isFetching, error } = useGetProductsQuery(queryParams)
  const rawProducts = response?.data ?? []

  const { data: regionalSettings } = useGetRegionalSettingsQuery()
  const lowStockThreshold = regionalSettings?.lowStockThreshold ?? 10
  const filtered =
    appliedFilters.stockStatus === 'low_stock'
      ? rawProducts.filter(
          (p) => getStockStatus(p.stockQuantity, lowStockThreshold) === 'low_stock',
        )
      : rawProducts

  const total = filtered.length
  const products = filtered.slice((page - 1) * limit, page * limit)

  const handleStatusToggle = useCallback(async (product: Product) => {
    try {
      await updateProduct({ id: product.id, data: { isActive: !product.isActive } }).unwrap()
      showSuccess(product.isActive ? `${product.name} set as inactive` : `${product.name} reactivated`)
    } catch {
      const msg = product.isActive
        ? `Failed to deactivate ${product.name}`
        : `Failed to reactivate ${product.name}`
      setPageError(msg)
      showError(msg)
    }
  }, [updateProduct, showSuccess, showError])

  return (
    <SimpleListPage
      title="Products"
      subtitle="Manage your product catalog, prices, and stock levels."
      primaryAction={{ label: 'New Product', onClick: () => navigate(withListQuery('/inventory/products/create', location.search)) }}
      secondaryAction={{ label: 'Import', onClick: () => setImportOpen(true) }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={searchInputRef}
      sort={{ field: 'name', sortBy, sortOrder, onSort: setSort }}
      isFetching={isFetching}
      error={pageError || (error ? 'Failed to load products.' : null)}
      onErrorClose={() => setPageError(null)}
      tableSlot={(
        <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <ProductList
            products={products}
            loading={isLoading || isFetching}
            total={total}
            onStatusToggle={handleStatusToggle}
            getDefaultPrice={getDefaultPrice}
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
        </Box>
      )}
      dialogs={(
        <ProductImportDialog
          open={importOpen}
          onClose={() => setImportOpen(false)}
          onImportSuccess={() => setImportOpen(false)}
        />
      )}
    />
  )
}
