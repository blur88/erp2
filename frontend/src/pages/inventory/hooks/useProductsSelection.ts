import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { Location, NavigateFunction } from 'react-router-dom'

import { setSelectedProduct } from '@/store/slices/inventorySlice'
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
  productListRef: RefObject<HTMLDivElement | null>
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
  productListRef,
}: UseProductsSelectionParams) {
  const navigationSelectionId = (location.state as { selectedProductId?: string } | null)?.selectedProductId

  const prevCategoryRef = useRef(selectedCategory)
  useEffect(() => {
    if (prevCategoryRef.current !== selectedCategory) {
      prevCategoryRef.current = selectedCategory
      setFocusedProductIndex(-1)
    }
  }, [selectedCategory, setFocusedProductIndex])

  useEffect(() => {
    if (selectedProduct && products.length > 0) {
      const index = products.findIndex((product) => product.id === selectedProduct.id)
      if (index >= 0) {
        setFocusedProductIndex(index)
      }
    }
  }, [products, selectedProduct, setFocusedProductIndex])

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
    if (products.length > 0 && focusedProductIndex === -1) {
      if (selectedProduct) {
        const index = products.findIndex((product) => product.id === selectedProduct.id)
        if (index >= 0) {
          setFocusedProductIndex(index)
        }
      } else if (!navigationSelectionId) {
        setFocusedProductIndex(0)
        dispatch(setSelectedProduct(products[0]))
      }
    }
  }, [dispatch, focusedProductIndex, navigationSelectionId, products, selectedProduct, setFocusedProductIndex])

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
