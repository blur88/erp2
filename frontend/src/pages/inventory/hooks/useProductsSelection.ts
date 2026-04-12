import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { useLocation, type NavigateFunction } from 'react-router-dom'

import type { AppDispatch } from '@/store'
import { setSelectedProduct } from '@/store/slices/inventorySlice'
import type { Product } from '@/types'

interface UseProductsSelectionParams {
  dispatch: AppDispatch
  navigate: NavigateFunction
  products: Product[]
  selectedProduct: Product | null
  focusedProductIndex: number
  setFocusedProductIndex: (index: number) => void
  productListRef: RefObject<HTMLDivElement | null>
}

export function useProductsSelection({
  dispatch,
  navigate,
  products,
  selectedProduct,
  focusedProductIndex,
  setFocusedProductIndex,
  productListRef,
}: UseProductsSelectionParams) {
  const location = useLocation()
  const hasAutoSelected = useRef(false)
  const navigationSelectionId = (location.state as { selectedProductId?: string } | null)?.selectedProductId

  useEffect(() => {
    if (
      products.length > 0 &&
      !hasAutoSelected.current &&
      focusedProductIndex === -1 &&
      !selectedProduct &&
      !navigationSelectionId
    ) {
      hasAutoSelected.current = true
      setFocusedProductIndex(0)
      dispatch(setSelectedProduct(products[0]))
    } else if (products.length === 0) {
      dispatch(setSelectedProduct(null))
      setFocusedProductIndex(-1)
    }
  }, [products, dispatch, focusedProductIndex, selectedProduct, navigationSelectionId, setFocusedProductIndex])

  useEffect(() => {
    if (navigationSelectionId && products.length > 0) {
      const product = products.find((item) => item.id === navigationSelectionId)
      if (product) {
        navigate(location.pathname, { replace: true, state: {} })
        dispatch(setSelectedProduct(product))
        const index = products.findIndex((item) => item.id === navigationSelectionId)
        if (index >= 0) {
          setFocusedProductIndex(index)
        }
      }
    }
  }, [dispatch, location.pathname, navigate, navigationSelectionId, products, setFocusedProductIndex])

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
    if (focusedProductIndex >= 0 && productListRef.current) {
      const focusedRow = productListRef.current.querySelector(`[data-product-index="${focusedProductIndex}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedProductIndex, productListRef])

  const selectAtIndex = useCallback(
    (index: number) => {
      setFocusedProductIndex(index)
      dispatch(setSelectedProduct(products[index]))
    },
    [dispatch, products, setFocusedProductIndex],
  )

  const handleProductSelect = useCallback(
    (product: Product) => {
      const index = products.findIndex((candidate) => candidate.id === product.id)
      setFocusedProductIndex(index)
      dispatch(setSelectedProduct(product))
    },
    [dispatch, products, setFocusedProductIndex],
  )

  const handleNavigateUp = useCallback(() => {
    if (focusedProductIndex > 0) {
      selectAtIndex(focusedProductIndex - 1)
    }
  }, [focusedProductIndex, selectAtIndex])

  const handleNavigateDown = useCallback(() => {
    if (focusedProductIndex < products.length - 1) {
      selectAtIndex(focusedProductIndex + 1)
    }
  }, [focusedProductIndex, products.length, selectAtIndex])

  const handleNavigateToFirst = useCallback(() => {
    if (products.length > 0) {
      selectAtIndex(0)
    }
  }, [products.length, selectAtIndex])

  const handleNavigateToLast = useCallback(() => {
    if (products.length > 0) {
      selectAtIndex(products.length - 1)
    }
  }, [products.length, selectAtIndex])

  const handlePageUpNavigation = useCallback(() => {
    const newIndex = Math.max(0, focusedProductIndex - 10)
    if (products[newIndex]) {
      selectAtIndex(newIndex)
    }
  }, [focusedProductIndex, products, selectAtIndex])

  const handlePageDownNavigation = useCallback(() => {
    const newIndex = Math.min(products.length - 1, focusedProductIndex + 10)
    if (products[newIndex]) {
      selectAtIndex(newIndex)
    }
  }, [focusedProductIndex, products, selectAtIndex])

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
    handleNavigateUp,
    handleNavigateDown,
    handleNavigateToFirst,
    handleNavigateToLast,
    handlePageUpNavigation,
    handlePageDownNavigation,
    handleEnterAction,
    handleEscapeAction,
  }
}
