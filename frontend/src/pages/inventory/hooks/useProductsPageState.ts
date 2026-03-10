import { useRef, useState } from 'react'

import type { Product } from '@/types'

export function useProductsPageState(initialCategoryId?: string) {
  const [deletedProductsDialogOpen, setDeletedProductsDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [calculatorPanelOpen, setCalculatorPanelOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [focusedProductIndex, setFocusedProductIndex] = useState<number>(-1)
  const [exportMenuAnchor, setExportMenuAnchor] = useState<HTMLElement | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [currentTab, setCurrentTab] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState(initialCategoryId || 'all')

  const productListRef = useRef<HTMLDivElement>(null)

  return {
    deletedProductsDialogOpen,
    setDeletedProductsDialogOpen,
    importDialogOpen,
    setImportDialogOpen,
    calculatorPanelOpen,
    setCalculatorPanelOpen,
    deleteConfirmOpen,
    setDeleteConfirmOpen,
    productToDelete,
    setProductToDelete,
    focusedProductIndex,
    setFocusedProductIndex,
    exportMenuAnchor,
    setExportMenuAnchor,
    isExporting,
    setIsExporting,
    currentTab,
    setCurrentTab,
    selectedCategory,
    setSelectedCategory,
    productListRef,
  }
}
