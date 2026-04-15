import React, { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useDeleteProductMutation,
  useGetProductsQuery,
} from '@/store/api/inventoryApi'
import {
  selectSelectedProduct,
  setSelectedProduct,
} from '@/store/slices/inventorySlice'
import type { FilterBarConfig } from '@/types/filterBar.types'

import ProductContextHeader from './components/ProductContextHeader'
import ProductsDialogs from './components/ProductsDialogs'
import ProductList from './components/ProductList'
import ProductWorkspaceCard from './components/ProductWorkspaceCard'
import { useProductsActions } from './hooks/productsActions'
import { useProductsPageState } from './hooks/productsPageState'
import { useProductsSelection } from './hooks/productsSelection'

interface InventoryProductFilters {
  search: string
  categoryId: string | null
  type: 'goods' | 'service' | null
  stockStatus: 'low_stock' | 'out_of_stock' | null
}

export const ProductsPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const selectedProduct = useAppSelector(selectSelectedProduct)
  const pageState = useProductsPageState()
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
  const [deleteProduct] = useDeleteProductMutation()
  const products = productsResponse?.data || []

  const selection = useProductsSelection({
    dispatch,
    navigate,
    products,
    selectedProduct,
    focusedProductIndex: pageState.focusedProductIndex,
    setFocusedProductIndex: pageState.setFocusedProductIndex,
    productListRef: pageState.productListRef,
  })

  const actions = useProductsActions({
    navigate,
    products,
    productFilters: appliedFilters,
    selectedProduct,
    deleteProduct,
    showSuccess,
    showError,
    setDeleteConfirmOpen: pageState.setDeleteConfirmOpen,
    setProductToDelete: pageState.setProductToDelete,
    setExportMenuAnchor: pageState.setExportMenuAnchor,
    setIsExporting: pageState.setIsExporting,
    dispatchSetSelectedProduct: (product) => dispatch(setSelectedProduct(product)),
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
    <GenericListPage
      title="Products"
      subtitle="Manage your product catalog and inventory"
      secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedProductsDialogOpen(true) }}
      primaryAction={{ label: 'Add Product', onClick: actions.handleAddProduct }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={handlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={pageState.searchInputRef}
      sort={{ field: 'name', sortBy, sortOrder, onSort: handleSort }}
      listSlot={(
        <ProductList
          products={products}
          loading={isProductsFetching}
          selectedProductId={selectedProduct?.id}
          focusedIndex={pageState.focusedProductIndex}
          onSelect={selection.handleProductSelect}
          productListRef={pageState.productListRef}
        />
      )}
      headerSlot={(
        <ProductContextHeader
          selectedProduct={selectedProduct}
          onEdit={() => selectedProduct && actions.handleEditProduct(selectedProduct)}
          onDelete={() => selectedProduct && actions.handleDeleteProduct(selectedProduct)}
        />
      )}
      workspaceSlot={<ProductWorkspaceCard selectedProduct={selectedProduct} />}
      dialogs={(
        <ProductsDialogs
          exportMenuAnchor={pageState.exportMenuAnchor}
          isExporting={pageState.isExporting}
          products={products}
          productFilters={{
            search: appliedFilters.search,
          }}
          calculatorPanelOpen={pageState.calculatorPanelOpen}
          deletedProductsDialogOpen={pageState.deletedProductsDialogOpen}
          importDialogOpen={pageState.importDialogOpen}
          deleteConfirmOpen={pageState.deleteConfirmOpen}
          productToDelete={pageState.productToDelete}
          onCloseExportMenu={actions.handleExportClose}
          onExport={actions.handleExport}
          onCloseCalculator={() => pageState.setCalculatorPanelOpen(false)}
          onCloseDeletedProductsDialog={() => pageState.setDeletedProductsDialogOpen(false)}
          onCloseImportDialog={() => pageState.setImportDialogOpen(false)}
          onImportSuccess={() => {
            void refetchProducts()
          }}
          onConfirmDelete={() => void actions.handleConfirmDelete(pageState.productToDelete)}
          onCancelDelete={actions.handleCancelDelete}
        />
      )}
    />
  )
}

export default ProductsPage
