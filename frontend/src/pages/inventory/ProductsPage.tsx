import React, { useCallback, useMemo, useState } from 'react'
import { default as TableChartIcon } from '@mui/icons-material/TableChart'

import GenericListPage from '@/components/common/GenericListPage'
import { AppButton } from '@/components/common/AppButton'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useGetProductsQuery,
} from '@/store/api/inventoryApi'
import {
  selectSelectedProduct,
} from '@/store/slices/inventorySlice'
import type { FilterBarConfig } from '@/types/filterBar.types'

import ProductContextHeader from './components/ProductContextHeader'
import ProductsDialogs from './components/ProductsDialogs'
import ProductList from './components/ProductList'
import ProductWorkspaceCard from './components/ProductWorkspaceCard'
import { useProductsWorkspace } from './hooks/useProductsWorkspace'

interface InventoryProductFilters {
  search: string
  categoryId: string | null
  type: 'goods' | 'service' | null
  stockStatus: 'low_stock' | 'out_of_stock' | null
}

const ProductsPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const selectedProduct = useAppSelector(selectSelectedProduct)
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  const filterConfig = useMemo<FilterBarConfig<InventoryProductFilters>>(
    () => ({
      search: { placeholder: 'Search by name, barcode, or brand...' },
      fields: [
        { field: 'categoryId', label: 'Category', type: 'category' },
        { field: 'type', label: 'Product Type', type: 'product-type' },
        { field: 'stockStatus', label: 'Stock Status', type: 'stock-status' },
      ],
      defaults: {
        search: '',
        categoryId: null,
        type: null,
        stockStatus: null,
      },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const productQueryParams = useMemo(() => {
    const params: Record<string, string | boolean> = {}

    if (appliedFilters.search) {
      params.search = appliedFilters.search
    }
    if (appliedFilters.categoryId) {
      params.categoryId = appliedFilters.categoryId
    }
    if (appliedFilters.type === 'goods') {
      params.type = 'Stocked Product'
    } else if (appliedFilters.type === 'service') {
      params.type = 'Service'
    }
    if (appliedFilters.stockStatus === 'low_stock') {
      params.lowStock = true
    } else if (appliedFilters.stockStatus === 'out_of_stock') {
      params.outOfStock = true
    }

    params.sortBy = sortBy
    params.sortOrder = sortOrder.toUpperCase()

    return params
  }, [appliedFilters, sortBy, sortOrder])

  const {
    data: productsResponse,
    isFetching: isProductsFetching,
    refetch: refetchProducts,
  } = useGetProductsQuery(productQueryParams)
  const products = productsResponse?.data || []

  const workspace = useProductsWorkspace({
    dispatch,
    products,
    productFilters: appliedFilters,
    selectedProduct,
    refetchProducts: () => void refetchProducts(),
  })

  return (
    <GenericListPage
      title="Products"
      subtitle="Manage your product catalog and inventory"
      secondaryAction={{ label: 'View Deleted', onClick: () => workspace.setDeletedProductsDialogOpen(true) }}
      primaryAction={{ label: 'Add Product', onClick: workspace.handleAddProduct }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{ field: 'name', sortBy, sortOrder, onSort: handleSort }}
      filterExtra={(
        <AppButton
          size="filter"
          variant="outlined"
          startIcon={<TableChartIcon />}
          loading={workspace.isExporting}
          onClick={workspace.handleExportClick}
        >
          Export
        </AppButton>
      )}
      listSlot={(
        <ProductList
          products={products}
          loading={isProductsFetching}
          selectedProductId={selectedProduct?.id}
          focusedIndex={workspace.focusedIndex}
          onSelect={workspace.handleSelect}
          productListRef={workspace.listRef}
        />
      )}
      headerSlot={(
        <ProductContextHeader
          selectedProduct={selectedProduct}
          onEdit={() => selectedProduct && workspace.handleEditProduct(selectedProduct)}
          onDelete={() => selectedProduct && workspace.handleDeleteProduct(selectedProduct)}
        />
      )}
      workspaceSlot={<ProductWorkspaceCard selectedProduct={selectedProduct} />}
      dialogs={(
        <ProductsDialogs
          exportMenuAnchor={workspace.exportMenuAnchor}
          isExporting={workspace.isExporting}
          products={products}
          productFilters={{
            search: appliedFilters.search,
          }}
          calculatorPanelOpen={workspace.calculatorPanelOpen}
          deletedProductsDialogOpen={workspace.deletedProductsDialogOpen}
          importDialogOpen={workspace.importDialogOpen}
          deleteConfirmOpen={workspace.deleteConfirmOpen}
          productToDelete={workspace.productToDelete}
          onCloseExportMenu={workspace.handleExportClose}
          onExport={workspace.handleExport}
          onCloseCalculator={() => workspace.setCalculatorPanelOpen(false)}
          onCloseDeletedProductsDialog={() => workspace.setDeletedProductsDialogOpen(false)}
          onCloseImportDialog={() => workspace.setImportDialogOpen(false)}
          onImportSuccess={() => {
            void refetchProducts()
          }}
          onConfirmDelete={() => void workspace.handleConfirmDelete(workspace.productToDelete)}
          onCancelDelete={workspace.handleCancelDelete}
        />
      )}
    />
  )
}

export default ProductsPage
