import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react'
import type { Location, NavigateFunction } from 'react-router-dom'

import { setProductFilters, setSelectedProduct } from '@/store/slices/inventorySlice'
import type { AppDispatch } from '@/store'
import type { Product } from '@/types'

interface UseProductsSelectionParams {
  dispatch: AppDispatch
  navigate: NavigateFunction
  location: Location
  products: Product[]
  selectedProduct: Product | null
  focusedProductIndex: number
  setFocusedProductIndex: (index: number) => void
  selectedCategory: string
  pendingProductId: string | null
  setPendingProductId: (id: string | null) => void
  hasNavigatedWithSelection: boolean
  setHasNavigatedWithSelection: (value: boolean) => void
  productListRef: RefObject<HTMLDivElement | null>
  hasRestoredSelection: MutableRefObject<boolean>
  fetchProductById: (id: string) => { unwrap: () => Promise<Product> }
  refetchProducts: () => void
  showError: (message: string) => void
}

export function useProductsSelection({
  dispatch,
  navigate,
  location,
  products,
  selectedProduct,
  focusedProductIndex,
  setFocusedProductIndex,
  selectedCategory,
  pendingProductId,
  setPendingProductId,
  hasNavigatedWithSelection,
  setHasNavigatedWithSelection,
  productListRef,
  hasRestoredSelection,
  fetchProductById,
  refetchProducts,
  showError,
}: UseProductsSelectionParams) {
  useEffect(() => {
    dispatch(setProductFilters({ categoryId: selectedCategory === 'all' ? undefined : selectedCategory }))
  }, [dispatch, selectedCategory])

  useEffect(() => {
    if (!hasRestoredSelection.current && selectedProduct && products.length > 0) {
      const index = products.findIndex((product) => product.id === selectedProduct.id)
      if (index >= 0) {
        setFocusedProductIndex(index)
        hasRestoredSelection.current = true
      }
    }
  }, [hasRestoredSelection, products, selectedProduct, setFocusedProductIndex])

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

  useEffect(() => {
    const state = location.state as { selectedProductId?: string } | null
    if (state?.selectedProductId && state.selectedProductId !== pendingProductId) {
      setHasNavigatedWithSelection(true)
      setPendingProductId(state.selectedProductId)
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.pathname, location.state, navigate, pendingProductId, setHasNavigatedWithSelection, setPendingProductId])

  useEffect(() => {
    if (pendingProductId && products.length > 0) {
      const product = products.find((item) => item.id === pendingProductId)
      if (product) {
        dispatch(setSelectedProduct(product))
        const index = products.findIndex((item) => item.id === pendingProductId)
        if (index >= 0) {
          setFocusedProductIndex(index)
        }
        setPendingProductId(null)
        setTimeout(() => setHasNavigatedWithSelection(false), 1000)
      } else {
        fetchProductById(pendingProductId)
          .unwrap()
          .then((fetchedProduct) => {
            dispatch(setSelectedProduct(fetchedProduct))
            setFocusedProductIndex(-1)
            void refetchProducts()
          })
          .catch((error) => {
            console.error('Failed to fetch product:', error)
            showError('Failed to load the product')
          })
          .finally(() => {
            setPendingProductId(null)
            setTimeout(() => setHasNavigatedWithSelection(false), 1000)
          })
      }
    }
  }, [dispatch, fetchProductById, pendingProductId, products, refetchProducts, setFocusedProductIndex, setHasNavigatedWithSelection, setPendingProductId, showError])

  useEffect(() => {
    if (hasRestoredSelection.current || !selectedProduct) {
      setFocusedProductIndex(-1)
    }
  }, [hasRestoredSelection, selectedProduct, setFocusedProductIndex, selectedCategory])

  useEffect(() => {
    if (products.length > 0 && focusedProductIndex === -1) {
      if (selectedProduct) {
        const index = products.findIndex((product) => product.id === selectedProduct.id)
        if (index >= 0) {
          setFocusedProductIndex(index)
        }
      } else if (!hasNavigatedWithSelection) {
        setFocusedProductIndex(0)
        dispatch(setSelectedProduct(products[0]))
      }
    }
  }, [dispatch, focusedProductIndex, hasNavigatedWithSelection, products, selectedProduct, setFocusedProductIndex])

  useEffect(() => {
    if (focusedProductIndex >= 0 && productListRef.current) {
      const focusedRow = productListRef.current.querySelector(`[data-product-index="${focusedProductIndex}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedProductIndex, productListRef])

  const selectByIndex = useCallback((index: number) => {
    setFocusedProductIndex(index)
    dispatch(setSelectedProduct(products[index]))
  }, [dispatch, products, setFocusedProductIndex])

  const handleProductSelect = useCallback((product: Product, index: number) => {
    dispatch(setSelectedProduct(product))
    setFocusedProductIndex(index)
  }, [dispatch, setFocusedProductIndex])

  const handleProductListFocus = useCallback(() => {
    if (products.length > 0 && focusedProductIndex === -1) {
      setFocusedProductIndex(0)
      dispatch(setSelectedProduct(products[0]))
    }
  }, [dispatch, focusedProductIndex, products, setFocusedProductIndex])

  const handleNavigateUp = useCallback(() => {
    if (focusedProductIndex > 0) {
      selectByIndex(focusedProductIndex - 1)
    }
  }, [focusedProductIndex, selectByIndex])

  const handleNavigateDown = useCallback(() => {
    if (focusedProductIndex < products.length - 1) {
      selectByIndex(focusedProductIndex + 1)
    }
  }, [focusedProductIndex, products.length, selectByIndex])

  const handleNavigateHome = useCallback(() => {
    if (products.length > 0) {
      selectByIndex(0)
    }
  }, [products.length, selectByIndex])

  const handleNavigateEnd = useCallback(() => {
    if (products.length > 0) {
      selectByIndex(products.length - 1)
    }
  }, [products.length, selectByIndex])

  const handlePageUpNavigation = useCallback(() => {
    const newIndex = Math.max(0, focusedProductIndex - 10)
    if (products[newIndex]) {
      selectByIndex(newIndex)
    }
  }, [focusedProductIndex, products, selectByIndex])

  const handlePageDownNavigation = useCallback(() => {
    const newIndex = Math.min(products.length - 1, focusedProductIndex + 10)
    if (products[newIndex]) {
      selectByIndex(newIndex)
    }
  }, [focusedProductIndex, products, selectByIndex])

  const handleEnterAction = useCallback(() => {
    if (focusedProductIndex >= 0 && products[focusedProductIndex]) {
      navigate(`/inventory/products/${products[focusedProductIndex].id}/edit`)
    }
  }, [focusedProductIndex, navigate, products])

  const handleEscapeAction = useCallback(() => {
    setFocusedProductIndex(-1)
    dispatch(setSelectedProduct(null))
  }, [dispatch, setFocusedProductIndex])

  return {
    handleProductSelect,
    handleProductListFocus,
    handleNavigateUp,
    handleNavigateDown,
    handleNavigateHome,
    handleNavigateEnd,
    handlePageUpNavigation,
    handlePageDownNavigation,
    handleEnterAction,
    handleEscapeAction,
  }
}
