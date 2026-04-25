import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { useEntityWorkspace } from '@/hooks/useEntityWorkspace'
import { useNotification } from '@/hooks/useNotification'
import { useDeleteProductMutation } from '@/store/api/inventoryApi'
import type { AppDispatch } from '@/store'
import { setSelectedProduct } from '@/store/slices/inventorySlice'
import type { Product } from '@/types'
import { exportProducts } from '@/utils/exportUtils'

export interface UseProductsWorkspaceConfig {
  dispatch: AppDispatch
  products: Product[]
  productFilters: { search?: string; categoryId?: string | null }
  selectedProduct: Product | null
  refetchProducts: () => void
}

export function useProductsWorkspace({
  dispatch,
  products,
  productFilters,
  selectedProduct,
  refetchProducts,
}: UseProductsWorkspaceConfig) {
  const navigate = useNavigate()
  const location = useLocation()
  const { showSuccess, showError } = useNotification()
  const [deleteProduct] = useDeleteProductMutation()

  const [deletedProductsDialogOpen, setDeletedProductsDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [calculatorPanelOpen, setCalculatorPanelOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [exportMenuAnchor, setExportMenuAnchor] = useState<HTMLElement | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  const navigationSelectionId = (location.state as { selectedProductId?: string } | null)
    ?.selectedProductId

  const pendingSelectedProduct = useMemo(() => {
    if (selectedProduct || !navigationSelectionId) {
      return selectedProduct
    }

    return { id: navigationSelectionId } as Product
  }, [navigationSelectionId, selectedProduct])

  const selectProduct = useCallback(
    (product: Product | null) => dispatch(setSelectedProduct(product)),
    [dispatch],
  )

  const workspace = useEntityWorkspace({
    entities: products,
    selectedEntity: pendingSelectedProduct,
    selectEntity: selectProduct,
    refetch: refetchProducts,
    navigate,
    routes: {
      create: '/inventory/products/create',
      edit: (id) => `/inventory/products/${id}/edit`,
    },
    notifications: { showSuccess, showError },
    deleteMutation: async (id) => {
      await deleteProduct(id).unwrap()
    },
  })
  const { setFocusedIndex } = workspace

  useEffect(() => {
    if (navigationSelectionId && products.length > 0) {
      const product = products.find((item) => item.id === navigationSelectionId)
      if (product) {
        navigate(location.pathname, { replace: true, state: {} })
        dispatch(setSelectedProduct(product))
        const index = products.findIndex((item) => item.id === navigationSelectionId)
        if (index >= 0) {
          setFocusedIndex(index)
        }
      }
    }
  }, [dispatch, location.pathname, navigate, navigationSelectionId, products, setFocusedIndex])

  useEffect(() => {
    if (selectedProduct && products.length > 0) {
      const updatedProduct = products.find((product) => product.id === selectedProduct.id)
      if (updatedProduct) {
        const hasChanged = JSON.stringify(updatedProduct) !== JSON.stringify(selectedProduct)
        if (hasChanged) {
          dispatch(setSelectedProduct(updatedProduct))
        }
      } else {
        dispatch(setSelectedProduct(null))
      }
    }
  }, [dispatch, products, selectedProduct])

  const handleAddProduct = useCallback(() => {
    navigate('/inventory/products/create')
  }, [navigate])

  const handleEditProduct = useCallback(
    (product: Product) => {
      navigate(`/inventory/products/${product.id}/edit`)
    },
    [navigate],
  )

  const handleDeleteProduct = useCallback((product: Product) => {
    setProductToDelete(product)
    setDeleteConfirmOpen(true)
  }, [])

  const handleConfirmDelete = useCallback(
    async (targetProduct: Product | null) => {
      if (!targetProduct) return

      try {
        await deleteProduct(targetProduct.id).unwrap()
        showSuccess(`Product ${targetProduct.name} deleted successfully`)

        if (selectedProduct?.id === targetProduct.id) {
          dispatch(setSelectedProduct(null))
          setFocusedIndex(-1)
        }
        refetchProducts()
      } catch (error: any) {
        const errorMessage = error?.message || 'Failed to delete product. Please try again.'
        showError(errorMessage)
      } finally {
        setDeleteConfirmOpen(false)
        setProductToDelete(null)
      }
    },
    [
      deleteProduct,
      dispatch,
      refetchProducts,
      selectedProduct?.id,
      setFocusedIndex,
      showError,
      showSuccess,
    ],
  )

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
    setProductToDelete(null)
  }, [])

  const handleExportClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setExportMenuAnchor(event.currentTarget)
  }, [])

  const handleExportClose = useCallback(() => {
    setExportMenuAnchor(null)
  }, [])

  const handleExport = useCallback(
    async (format: 'csv' | 'excel' | 'pdf') => {
      try {
        setIsExporting(true)
        handleExportClose()

        await exportProducts(format, {
          products,
          filters: {
            search: productFilters.search || undefined,
            category: productFilters.categoryId || undefined,
          },
          lowStockThreshold: 10,
        })
        showSuccess(`Products exported successfully as ${format.toUpperCase()}`)
      } catch (error: any) {
        console.error('Export error:', error)
        showError(error.message || `Failed to export as ${format.toUpperCase()}`)
      } finally {
        setIsExporting(false)
      }
    },
    [
      handleExportClose,
      productFilters.categoryId,
      productFilters.search,
      products,
      showError,
      showSuccess,
    ],
  )

  return {
    ...workspace,
    deletedProductsDialogOpen,
    setDeletedProductsDialogOpen,
    importDialogOpen,
    setImportDialogOpen,
    calculatorPanelOpen,
    setCalculatorPanelOpen,
    deleteConfirmOpen,
    productToDelete,
    exportMenuAnchor,
    setExportMenuAnchor,
    isExporting,
    handleAddProduct,
    handleEditProduct,
    handleDeleteProduct,
    handleConfirmDelete,
    handleCancelDelete,
    handleExportClick,
    handleExportClose,
    handleExport,
  }
}
