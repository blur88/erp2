import { useCallback, useEffect, useRef, type RefObject } from 'react'
import type { NavigateFunction } from 'react-router-dom'

import type { AppDispatch } from '@/store'
import { setSelectedCustomer } from '@/store/slices/salesSlice'
import type { Customer } from '@/types'

interface UseCustomersSelectionParams {
  dispatch: AppDispatch
  customers: Customer[]
  selectedCustomer: Customer | null
  focusedCustomerIndex: number
  setFocusedCustomerIndex: (index: number) => void
  navigate: NavigateFunction
  customerListRef: RefObject<HTMLDivElement | null>
  setDeleteConfirmOpen: (open: boolean) => void
  setDeletedCustomersDialogOpen: (open: boolean) => void
}

export function useCustomersSelection({
  dispatch,
  customers,
  selectedCustomer,
  focusedCustomerIndex,
  setFocusedCustomerIndex,
  navigate,
  customerListRef,
  setDeleteConfirmOpen,
  setDeletedCustomersDialogOpen,
}: UseCustomersSelectionParams) {
  const hasAutoSelected = useRef(false)

  useEffect(() => {
    if (customers.length > 0 && !hasAutoSelected.current && focusedCustomerIndex === -1 && !selectedCustomer) {
      hasAutoSelected.current = true
      setFocusedCustomerIndex(0)
      dispatch(setSelectedCustomer(customers[0]))
    } else if (customers.length === 0) {
      dispatch(setSelectedCustomer(null))
      setFocusedCustomerIndex(-1)
    }
  }, [customers, dispatch, focusedCustomerIndex, selectedCustomer, setFocusedCustomerIndex])

  useEffect(() => {
    if (focusedCustomerIndex >= 0 && customerListRef.current) {
      const focusedRow = customerListRef.current.querySelector(`[data-customer-index="${focusedCustomerIndex}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedCustomerIndex, customerListRef])

  const handleCustomerSelect = useCallback((customer: Customer) => {
    const index = customers.findIndex((candidate) => candidate.id === customer.id)
    setFocusedCustomerIndex(index)
    dispatch(setSelectedCustomer(customer))
  }, [customers, dispatch, setFocusedCustomerIndex])

  const selectAtIndex = useCallback((index: number) => {
    setFocusedCustomerIndex(index)
    dispatch(setSelectedCustomer(customers[index]))
  }, [customers, dispatch, setFocusedCustomerIndex])

  const handleNavigateUp = useCallback(() => {
    if (focusedCustomerIndex > 0) {
      selectAtIndex(focusedCustomerIndex - 1)
    }
  }, [focusedCustomerIndex, selectAtIndex])

  const handleNavigateDown = useCallback(() => {
    if (focusedCustomerIndex < customers.length - 1) {
      selectAtIndex(focusedCustomerIndex + 1)
    }
  }, [focusedCustomerIndex, customers.length, selectAtIndex])

  const handleNavigateToFirst = useCallback(() => {
    if (customers.length > 0) {
      selectAtIndex(0)
    }
  }, [customers.length, selectAtIndex])

  const handleNavigateToLast = useCallback(() => {
    if (customers.length > 0) {
      selectAtIndex(customers.length - 1)
    }
  }, [customers.length, selectAtIndex])

  const handlePageUpNavigation = useCallback(() => {
    const newIndex = Math.max(0, focusedCustomerIndex - 20)
    if (customers[newIndex]) {
      selectAtIndex(newIndex)
    }
  }, [focusedCustomerIndex, customers, selectAtIndex])

  const handlePageDownNavigation = useCallback(() => {
    const newIndex = Math.min(customers.length - 1, focusedCustomerIndex + 20)
    if (customers[newIndex]) {
      selectAtIndex(newIndex)
    }
  }, [focusedCustomerIndex, customers, selectAtIndex])

  const handleEnterAction = useCallback(() => {
    if (focusedCustomerIndex >= 0 && customers[focusedCustomerIndex]) {
      navigate(`/sales/customers/${customers[focusedCustomerIndex].id}/edit`)
    }
  }, [focusedCustomerIndex, customers, navigate])

  const handleEscapeAction = useCallback(() => {
    setFocusedCustomerIndex(-1)
    dispatch(setSelectedCustomer(null))
    setDeleteConfirmOpen(false)
    setDeletedCustomersDialogOpen(false)
  }, [dispatch, setDeleteConfirmOpen, setDeletedCustomersDialogOpen, setFocusedCustomerIndex])

  return {
    handleCustomerSelect,
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
