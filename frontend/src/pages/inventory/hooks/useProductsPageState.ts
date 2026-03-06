import { useRef, useState } from 'react'

import type { Product } from '@/types'

export interface ProductsPageState {
  deletedProductsDialogOpen: boolean
  importDialogOpen: boolean
  calculatorPanelOpen: boolean
  deleteConfirmOpen: boolean
  productToDelete: Product | null
  focusedProductIndex: number
  exportMenuAnchor: HTMLElement | null
  isExporting: boolean
  hasNavigatedWithSelection: boolean
  currentTab: number
  selectedCategory: string
  pendingProductId: string | null
}

export function useProductsPageState(initialCategoryId?: string) {
  const [deletedProductsDialogOpen, setDeletedProductsDialogOpen] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [calculatorPanelOpen, setCalculatorPanelOpen] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [productToDelete, setProductToDelete] = useState<Product | null>(null)
  const [focusedProductIndex, setFocusedProductIndex] = useState<number>(-1)
  const [exportMenuAnchor, setExportMenuAnchor] = useState<HTMLElement | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [hasNavigatedWithSelection, setHasNavigatedWithSelection] = useState(false)
  const [currentTab, setCurrentTab] = useState(0)
  const [selectedCategory, setSelectedCategory] = useState(initialCategoryId || 'all')
  const [pendingProductId, setPendingProductId] = useState<string | null>(null)

  const productListRef = useRef<HTMLDivElement>(null)
  const hasRestoredSelection = useRef(false)

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
    hasNavigatedWithSelection,
    setHasNavigatedWithSelection,
    currentTab,
    setCurrentTab,
    selectedCategory,
    setSelectedCategory,
    pendingProductId,
    setPendingProductId,
    productListRef,
    hasRestoredSelection,
  }
}
