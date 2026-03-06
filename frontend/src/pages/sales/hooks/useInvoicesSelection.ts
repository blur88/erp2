import { useCallback, useEffect, type MutableRefObject, type RefObject } from 'react'
import type { Location, NavigateFunction } from 'react-router-dom'

import { journalEntriesApi } from '@/services/accountingApi'
import { clearError, setSelectedInvoice } from '@/store/slices/salesSlice'
import type { AppDispatch } from '@/store'

import type { InvoiceJournalEntryRef, InvoiceListItem } from './useInvoicesPageState'

interface UseInvoicesSelectionParams {
  dispatch: AppDispatch
  navigate: NavigateFunction
  invoices: InvoiceListItem[]
  selectedInvoice: InvoiceListItem | null
  focusedInvoiceIndex: number
  setFocusedInvoiceIndex: (index: number) => void
  location: Location
  refetch: () => void
  invoiceListRef: RefObject<HTMLDivElement | null>
  searchInputRef: RefObject<HTMLInputElement | null>
  hasRestoredSelection: MutableRefObject<boolean>
  selectedInvoiceRef: MutableRefObject<InvoiceListItem | null>
  setJournalEntryRef: (value: InvoiceJournalEntryRef | null) => void
  setJournalEntryRefLoading: (value: boolean) => void
  setCreateDialog: (open: boolean) => void
  setEditDialog: (open: boolean) => void
}

export function useInvoicesSelection({
  dispatch,
  navigate,
  invoices,
  selectedInvoice,
  focusedInvoiceIndex,
  setFocusedInvoiceIndex,
  location,
  refetch,
  invoiceListRef,
  searchInputRef,
  hasRestoredSelection,
  selectedInvoiceRef,
  setJournalEntryRef,
  setJournalEntryRefLoading,
  setCreateDialog,
  setEditDialog,
}: UseInvoicesSelectionParams) {
  useEffect(() => {
    selectedInvoiceRef.current = selectedInvoice
  }, [selectedInvoice, selectedInvoiceRef])

  useEffect(() => {
    if (!selectedInvoice?.id) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    let cancelled = false
    const sources = [
      { sourceType: 'invoice', sourceId: selectedInvoice.id },
      { sourceType: 'sales_order', sourceId: selectedInvoice.salesOrder?.id },
    ].filter((source): source is { sourceType: string; sourceId: string } => Boolean(source.sourceId))

    if (sources.length === 0) {
      setJournalEntryRef(null)
      setJournalEntryRefLoading(false)
      return
    }

    setJournalEntryRefLoading(true)

    ;(async () => {
      try {
        for (const source of sources) {
          const res = await journalEntriesApi.getAll({
            sourceType: source.sourceType,
            sourceId: source.sourceId,
            limit: 1,
          })

          if (cancelled) return

          const entry = res.data?.[0]
          if (entry) {
            setJournalEntryRef({
              referenceNumber: entry.referenceNumber,
              sourceType: source.sourceType,
              sourceId: source.sourceId,
            })
            return
          }
        }

        if (!cancelled) setJournalEntryRef(null)
      } catch {
        if (!cancelled) setJournalEntryRef(null)
      } finally {
        if (!cancelled) setJournalEntryRefLoading(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [selectedInvoice?.id, selectedInvoice?.salesOrder?.id, setJournalEntryRef, setJournalEntryRefLoading])

  useEffect(() => {
    if (location.pathname === '/sales/invoices') {
      void refetch()
    }
  }, [location.pathname, refetch])

  useEffect(() => {
    if (invoices.length > 0 && selectedInvoiceRef.current) {
      const freshInvoice = invoices.find((invoice) => invoice.id === selectedInvoiceRef.current?.id)
      if (freshInvoice) {
        const hasChanged = JSON.stringify(freshInvoice) !== JSON.stringify(selectedInvoiceRef.current)
        if (hasChanged) {
          dispatch(setSelectedInvoice(freshInvoice as any))
        }
      }
    }
  }, [dispatch, invoices, selectedInvoiceRef])

  const handleInvoiceSelect = useCallback((invoice: InvoiceListItem) => {
    dispatch(setSelectedInvoice(invoice as any))
    const invoiceIndex = invoices.findIndex((item) => item.id === invoice.id)
    setFocusedInvoiceIndex(invoiceIndex)
  }, [dispatch, invoices, setFocusedInvoiceIndex])

  useEffect(() => {
    if (!hasRestoredSelection.current && selectedInvoice && invoices.length > 0) {
      const index = invoices.findIndex((item) => item.id === selectedInvoice.id)
      if (index >= 0) {
        setFocusedInvoiceIndex(index)
        hasRestoredSelection.current = true
      }
    }
  }, [hasRestoredSelection, invoices, selectedInvoice, setFocusedInvoiceIndex])

  useEffect(() => {
    if (invoices.length > 0 && focusedInvoiceIndex === -1) {
      if (selectedInvoice) {
        const index = invoices.findIndex((item) => item.id === selectedInvoice.id)
        if (index >= 0) {
          setFocusedInvoiceIndex(index)
        }
      } else if (searchInputRef.current !== document.activeElement) {
        setFocusedInvoiceIndex(0)
        dispatch(setSelectedInvoice(invoices[0] as any))
      }
    } else if (invoices.length === 0) {
      dispatch(setSelectedInvoice(null))
      dispatch(clearError())
      setFocusedInvoiceIndex(-1)
    }
  }, [dispatch, focusedInvoiceIndex, invoices, searchInputRef, selectedInvoice, setFocusedInvoiceIndex])

  useEffect(() => {
    const state = location.state as { highlightInvoice?: InvoiceListItem; highlightInvoiceId?: string } | null

    if (state?.highlightInvoice) {
      dispatch(setSelectedInvoice(state.highlightInvoice as any))
      const invoiceIndex = invoices.findIndex((item) => item.id === state.highlightInvoice?.id)
      if (invoiceIndex >= 0) {
        setFocusedInvoiceIndex(invoiceIndex)
      }
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
    } else if (state?.highlightInvoiceId && invoices.length > 0) {
      const invoice = invoices.find((item) => item.id === state.highlightInvoiceId)
      if (invoice) {
        dispatch(setSelectedInvoice(invoice as any))
        const invoiceIndex = invoices.findIndex((item) => item.id === state.highlightInvoiceId)
        if (invoiceIndex >= 0) {
          setFocusedInvoiceIndex(invoiceIndex)
        }
        window.history.replaceState(null, '', window.location.pathname + window.location.search)
      }
    }
  }, [dispatch, invoices, location.state, setFocusedInvoiceIndex])

  useEffect(() => {
    if (focusedInvoiceIndex >= 0 && invoiceListRef.current) {
      const focusedRow = invoiceListRef.current.querySelector(`[data-invoice-index="${focusedInvoiceIndex}"]`)
      if (focusedRow) {
        focusedRow.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedInvoiceIndex, invoiceListRef])

  const selectByIndex = useCallback((index: number) => {
    setFocusedInvoiceIndex(index)
    dispatch(setSelectedInvoice(invoices[index] as any))
  }, [dispatch, invoices, setFocusedInvoiceIndex])

  const handleNavigateUp = useCallback(() => {
    if (focusedInvoiceIndex > 0) {
      selectByIndex(focusedInvoiceIndex - 1)
    }
  }, [focusedInvoiceIndex, selectByIndex])

  const handleNavigateDown = useCallback(() => {
    if (focusedInvoiceIndex < invoices.length - 1) {
      selectByIndex(focusedInvoiceIndex + 1)
    }
  }, [focusedInvoiceIndex, invoices.length, selectByIndex])

  const handleNavigateToFirst = useCallback(() => {
    if (invoices.length > 0) {
      selectByIndex(0)
    }
  }, [invoices.length, selectByIndex])

  const handleNavigateToLast = useCallback(() => {
    if (invoices.length > 0) {
      selectByIndex(invoices.length - 1)
    }
  }, [invoices.length, selectByIndex])

  const handlePageUpNavigation = useCallback(() => {
    const pageSize = 20
    const newIndex = Math.max(0, focusedInvoiceIndex - pageSize)
    if (invoices[newIndex]) {
      selectByIndex(newIndex)
    }
  }, [focusedInvoiceIndex, invoices, selectByIndex])

  const handlePageDownNavigation = useCallback(() => {
    const pageSize = 20
    const newIndex = Math.min(invoices.length - 1, focusedInvoiceIndex + pageSize)
    if (invoices[newIndex]) {
      selectByIndex(newIndex)
    }
  }, [focusedInvoiceIndex, invoices, selectByIndex])

  const handleEnterAction = useCallback(() => {
    if (focusedInvoiceIndex >= 0 && invoices[focusedInvoiceIndex]) {
      setEditDialog(true)
    }
  }, [focusedInvoiceIndex, invoices, setEditDialog])

  const handleEscapeAction = useCallback(() => {
    setFocusedInvoiceIndex(-1)
    dispatch(setSelectedInvoice(null))
    setCreateDialog(false)
    setEditDialog(false)
  }, [dispatch, setCreateDialog, setEditDialog, setFocusedInvoiceIndex])

  const handleSalesOrderClick = useCallback((salesOrderId: string, event: React.MouseEvent) => {
    event.stopPropagation()
    navigate(`/sales/orders?highlight=${salesOrderId}`)
  }, [navigate])

  const handleNavigateToPayment = useCallback((paymentId: string, event?: React.MouseEvent) => {
    if (event) {
      event.stopPropagation()
    }
    navigate('/sales/payments', { state: { highlightPaymentId: paymentId } })
  }, [navigate])

  return {
    handleInvoiceSelect,
    handleNavigateUp,
    handleNavigateDown,
    handleNavigateToFirst,
    handleNavigateToLast,
    handlePageUpNavigation,
    handlePageDownNavigation,
    handleEnterAction,
    handleEscapeAction,
    handleSalesOrderClick,
    handleNavigateToPayment,
  }
}
