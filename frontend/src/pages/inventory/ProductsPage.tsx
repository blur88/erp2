import React, { useCallback, useMemo } from 'react'
import { Box, useMediaQuery, useTheme } from '@mui/material'
import Grid from '@mui/material/GridLegacy'
import { useLocation, useNavigate } from 'react-router-dom'

import ProductDetailsPanel from './components/ProductDetailsPanel'
import ProductsDialogs from './components/ProductsDialogs'
import ProductsTable from './components/ProductsTable'
import ProductsToolbar from './components/ProductsToolbar'
import { useProductsActions } from './hooks/useProductsActions'
import { useProductsPageState } from './hooks/useProductsPageState'
import { useProductsSelection } from './hooks/useProductsSelection'

import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts, useSearchAndFilter } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  useDeleteProductMutation,
  useGetCategoriesQuery,
  useGetProductsQuery,
  useLazyGetProductQuery,
} from '@/store/api/inventoryApi'
import {
  selectProductFilters,
  selectSelectedProduct,
  setProductFilters,
  setSelectedProduct,
} from '@/store/slices/inventorySlice'

const ProductsPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const productFilters = useAppSelector(selectProductFilters) || { search: '', categoryId: '', lowStock: false, inStock: true }
  const selectedProduct = useAppSelector(selectSelectedProduct)
  const pageState = useProductsPageState(productFilters.categoryId)

  const productQueryParams = useMemo(
    () => ({
      page: 1,
      search: productFilters.search || undefined,
      categoryId: productFilters.categoryId || undefined,
    }),
    [productFilters.categoryId, productFilters.search],
  )

  const { data: productsResponse, isFetching: isProductsFetching, refetch: refetchProducts } = useGetProductsQuery(productQueryParams)
  const { data: categories = [], refetch: refetchCategories } = useGetCategoriesQuery({ includeProductCount: true })
  const [deleteProduct] = useDeleteProductMutation()
  const [fetchProductById] = useLazyGetProductQuery()
  const products = productsResponse?.data || []
  const pagination = productsResponse?.meta

  const { searchTerm, setSearchTerm, focusSearchInput } = useSearchAndFilter({
    initialSearchTerm: productFilters.search,
    onSearchChange: (search) => {
      dispatch(setProductFilters({ search }))
    },
  })

  const selection = useProductsSelection({
    dispatch,
    navigate,
    location,
    products,
    selectedProduct,
    focusedProductIndex: pageState.focusedProductIndex,
    setFocusedProductIndex: pageState.setFocusedProductIndex,
    selectedCategory: pageState.selectedCategory,
    pendingProductId: pageState.pendingProductId,
    setPendingProductId: pageState.setPendingProductId,
    hasNavigatedWithSelection: pageState.hasNavigatedWithSelection,
    setHasNavigatedWithSelection: pageState.setHasNavigatedWithSelection,
    productListRef: pageState.productListRef,
    hasRestoredSelection: pageState.hasRestoredSelection,
    fetchProductById,
    refetchProducts,
    showError,
  })

  const actions = useProductsActions({
    navigate,
    products,
    productFilters,
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
    onSearch: focusSearchInput,
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
      <ProductsToolbar
        isMobile={isMobile}
        total={pagination?.total || 0}
        searchTerm={searchTerm}
        selectedCategory={pageState.selectedCategory}
        categories={categories as any[]}
        calculatorPanelOpen={pageState.calculatorPanelOpen}
        isExporting={pageState.isExporting}
        hasProducts={products.length > 0}
        marginRight={contentMarginRight}
        onSearchChange={setSearchTerm}
        onCategoryChange={pageState.setSelectedCategory}
        onOpenDeleted={() => pageState.setDeletedProductsDialogOpen(true)}
        onAddProduct={actions.handleAddProduct}
        onExportClick={actions.handleExportClick}
        onImport={() => pageState.setImportDialogOpen(true)}
        onToggleCalculator={() => pageState.setCalculatorPanelOpen(!pageState.calculatorPanelOpen)}
      />

      <Box sx={{ transition: 'margin-right 0.3s ease-in-out', marginRight: contentMarginRight }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={3}>
            <ProductsTable
              products={products}
              total={pagination?.total || 0}
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
        productFilters={productFilters}
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
