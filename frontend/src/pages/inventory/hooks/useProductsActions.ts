import { useCallback } from 'react'
import type { NavigateFunction } from 'react-router-dom'

import { exportProducts } from '@/utils/exportUtils'
import type { Product } from '@/types'

interface UseProductsActionsParams {
  navigate: NavigateFunction
  products: Product[]
  productFilters: { search?: string; categoryId?: string; lowStock?: boolean; inStock?: boolean }
  selectedProduct: Product | null
  deleteProduct: (id: string) => { unwrap: () => Promise<any> }
  showSuccess: (message: string) => void
  showError: (message: string) => void
  setDeleteConfirmOpen: (open: boolean) => void
  setProductToDelete: (product: Product | null) => void
  setExportMenuAnchor: (anchor: HTMLElement | null) => void
  setIsExporting: (value: boolean) => void
  dispatchSetSelectedProduct: (product: Product | null) => void
}

export function useProductsActions({
  navigate,
  products,
  productFilters,
  selectedProduct,
  deleteProduct,
  showSuccess,
  showError,
  setDeleteConfirmOpen,
  setProductToDelete,
  setExportMenuAnchor,
  setIsExporting,
  dispatchSetSelectedProduct,
}: UseProductsActionsParams) {
  const handleAddProduct = useCallback(() => {
    navigate('/inventory/products/create')
  }, [navigate])

  const handleEditProduct = useCallback((product: Product) => {
    navigate(`/inventory/products/${product.id}/edit`)
  }, [navigate])

  const handleDeleteProduct = useCallback((product: Product) => {
    setProductToDelete(product)
    setDeleteConfirmOpen(true)
  }, [setDeleteConfirmOpen, setProductToDelete])

  const handleConfirmDelete = useCallback(async (productToDelete: Product | null) => {
    if (!productToDelete) return

    try {
      await deleteProduct(productToDelete.id).unwrap()
      showSuccess(`Product ${productToDelete.name} deleted successfully`)

      if (selectedProduct?.id === productToDelete.id) {
        dispatchSetSelectedProduct(null)
      }
    } catch (error: any) {
      const errorMessage = error?.message || 'Failed to delete product. Please try again.'
      showError(errorMessage)
    } finally {
      setDeleteConfirmOpen(false)
      setProductToDelete(null)
    }
  }, [deleteProduct, dispatchSetSelectedProduct, selectedProduct?.id, setDeleteConfirmOpen, setProductToDelete, showError, showSuccess])

  const handleCancelDelete = useCallback(() => {
    setDeleteConfirmOpen(false)
    setProductToDelete(null)
  }, [setDeleteConfirmOpen, setProductToDelete])

  const handleExportClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setExportMenuAnchor(event.currentTarget)
  }, [setExportMenuAnchor])

  const handleExportClose = useCallback(() => {
    setExportMenuAnchor(null)
  }, [setExportMenuAnchor])

  const handleExport = useCallback(async (format: 'csv' | 'excel' | 'pdf') => {
    try {
      setIsExporting(true)
      handleExportClose()

      await exportProducts(format, {
        products,
        filters: {
          search: productFilters.search || undefined,
          category: productFilters.categoryId || undefined,
        },
      })
      showSuccess(`Products exported successfully as ${format.toUpperCase()}`)
    } catch (error: any) {
      console.error('Export error:', error)
      showError(error.message || `Failed to export as ${format.toUpperCase()}`)
    } finally {
      setIsExporting(false)
    }
  }, [handleExportClose, productFilters.categoryId, productFilters.search, products, setIsExporting, showError, showSuccess])

  return {
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
