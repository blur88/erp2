import React, { useCallback, useMemo, useState } from 'react'
import { Box, useMediaQuery, useTheme } from '@mui/material'
import { useNavigate } from 'react-router-dom'

import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters'
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
import { useProductsActions } from './hooks/useProductsActions'
import { useProductsPageState } from './hooks/useProductsPageState'
import { useProductsSelection } from './hooks/useProductsSelection'

interface InventoryProductFilters {
  search: string
  categoryId: string | null
  type: 'goods' | 'service' | null
  stockStatus: 'low_stock' | 'out_of_stock' | null
}

export const ProductsPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
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
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title="Products"
        subtitle="Manage your product catalog and inventory"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedProductsDialogOpen(true) }}
        primaryAction={{ label: 'Add Product', onClick: actions.handleAddProduct }}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
            sort={{ field: 'name', sortBy, sortOrder, onSort: handleSort }}
          />
        )}
      />

      <MasterDetailWorkspace
        isMobile={isMobile}
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
      />

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
    </Box>
  )
}

export default ProductsPage
