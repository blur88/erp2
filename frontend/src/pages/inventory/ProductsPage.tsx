import React, { useMemo } from 'react'
import { Box, Stack, useMediaQuery, useTheme } from '@mui/material'
import Grid from '@mui/material/GridLegacy'
import { useLocation, useNavigate } from 'react-router-dom'

import PageHeader from '@/components/common/PageHeader'
import { FilterBar, useFilterBar } from '@/components/filters'
import type { FilterBarConfig, NumberRangeValue } from '@/components/filters'
import ProductDetailsPanel from './components/ProductDetailsPanel'
import ProductsDialogs from './components/ProductsDialogs'
import ProductsTable from './components/ProductsTable'
import { useProductsActions } from './hooks/useProductsActions'
import { useProductsPageState } from './hooks/useProductsPageState'
import { useProductsSelection } from './hooks/useProductsSelection'

import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useDeleteProductMutation,
  useGetCategoriesQuery,
  useGetProductsQuery,
} from '@/store/api/inventoryApi'
import {
  selectSelectedProduct,
  setSelectedProduct,
} from '@/store/slices/inventorySlice'

interface InventoryProductFilters {
  search: string
  categoryId: string | null
  status: 'active' | 'inactive' | null
  stockRange: NumberRangeValue
}

export const ProductsPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const selectedProduct = useAppSelector(selectSelectedProduct)
  const pageState = useProductsPageState()
  const { data: categories = [], refetch: refetchCategories } = useGetCategoriesQuery({ includeProductCount: true })

  const filterConfig = useMemo<FilterBarConfig<InventoryProductFilters>>(
    () => ({
      search: { placeholder: 'Search by name, barcode, or brand...' },
      quick: [
        {
          field: 'categoryId',
          label: 'Category',
          type: 'select',
          options: (categories as any[]).map((category) => ({ value: category.id, label: category.name })),
        },
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
      advanced: [],
      defaults: {
        search: '',
        categoryId: null,
        status: null,
        stockRange: { min: null, max: null },
      },
    }),
    [categories],
  )

  const { appliedFilters, draftFilters, handlers, activeChips, hasActiveFilters, hasUnappliedChanges } = useFilterBar(filterConfig)

  const productQueryParams = useMemo(() => ({
    search: appliedFilters.search || undefined,
    categoryId: appliedFilters.categoryId || undefined,
    isActive:
      appliedFilters.status === 'active'
        ? true
        : appliedFilters.status === 'inactive'
          ? false
          : undefined,
  }), [appliedFilters.categoryId, appliedFilters.search, appliedFilters.status])

  const { data: productsResponse, isFetching: isProductsFetching, refetch: refetchProducts } = useGetProductsQuery(productQueryParams)
  const [deleteProduct] = useDeleteProductMutation()
  const products = productsResponse?.data || []

  const selection = useProductsSelection({
    dispatch,
    navigate,
    location,
    products,
    selectedProduct,
    focusedProductIndex: pageState.focusedProductIndex,
    setFocusedProductIndex: pageState.setFocusedProductIndex,
    selectedCategory: draftFilters.categoryId ?? 'all',
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
    onHome: selection.handleNavigateHome,
    onEnd: selection.handleNavigateEnd,
    onEscape: selection.handleEscapeAction,
  })

  const contentMarginRight = pageState.calculatorPanelOpen ? { xs: '0px', md: '320px' } : '0px'

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ mb: 3, transition: 'margin-right 0.3s ease-in-out', marginRight: contentMarginRight }}>
        <PageHeader
          title="Products"
          subtitle="Manage your product catalog and inventory"
          secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedProductsDialogOpen(true) }}
          primaryAction={{ label: 'Add Product', onClick: actions.handleAddProduct }}
        />
      </Box>

      <Stack
        direction={isMobile ? 'column' : 'row'}
        spacing={1}
        alignItems={isMobile ? 'stretch' : 'center'}
        sx={{ mb: 3, transition: 'margin-right 0.3s ease-in-out', marginRight: contentMarginRight }}
      >
        <Box sx={{ flex: 1 }}>
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={handlers}
            activeChips={activeChips}
            hasActiveFilters={hasActiveFilters}
            hasUnappliedChanges={hasUnappliedChanges}
            searchInputRef={pageState.searchInputRef}
          />
        </Box>
      </Stack>

      <Box sx={{ transition: 'margin-right 0.3s ease-in-out', marginRight: contentMarginRight }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={3}>
            <ProductsTable
              products={products}
              loading={isProductsFetching}
              selectedProductId={selectedProduct?.id}
              focusedProductIndex={pageState.focusedProductIndex}
              productListRef={pageState.productListRef}
              onFocus={selection.handleProductListFocus}
              onProductSelect={selection.handleProductSelect}
            />
          </Grid>
          <Grid item xs={12} md={9}>
            <ProductDetailsPanel
              products={products}
              selectedProduct={selectedProduct}
              currentTab={pageState.currentTab}
              onTabChange={pageState.setCurrentTab}
              onEditProduct={actions.handleEditProduct}
              onDeleteProduct={actions.handleDeleteProduct}
            />
          </Grid>
        </Grid>
      </Box>

      <ProductsDialogs
        exportMenuAnchor={pageState.exportMenuAnchor}
        isExporting={pageState.isExporting}
        products={products}
        productFilters={{
          search: appliedFilters.search,
          categoryId: appliedFilters.categoryId ?? undefined,
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
          void refetchCategories()
        }}
        onConfirmDelete={() => void actions.handleConfirmDelete(pageState.productToDelete)}
        onCancelDelete={actions.handleCancelDelete}
      />
    </Box>
  )
}

export default ProductsPage
