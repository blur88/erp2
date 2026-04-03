import React, { useCallback, useEffect, useMemo } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import Grid from '@mui/material/GridLegacy'
import { useLocation, useNavigate } from 'react-router-dom'

import InvoiceDetailsPanel from './components/InvoiceDetailsPanel'
import InvoicesDialogs from './components/InvoicesDialogs'
import InvoicesTable from './components/InvoicesTable'
import { useInvoicesActions } from './hooks/useInvoicesActions'
import { type InvoiceListItem, useInvoicesPageState } from './hooks/useInvoicesPageState'
import { useInvoicesSelection } from './hooks/useInvoicesSelection'

import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts, useSearchAndFilter } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetInvoicesQuery } from '@/store/api/salesApi'
import { selectSelectedInvoice } from '@/store/slices/salesSlice'

const InvoicesPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const { showError } = useNotification()
  const selectedInvoice = useAppSelector(selectSelectedInvoice) as InvoiceListItem | null
  const pageState = useInvoicesPageState()

  const onSearchChange = useCallback((search: string) => {
    pageState.setFilters((prev) => ({ ...prev, search }))
  }, [pageState])

  const { searchTerm, setSearchTerm: originalSetSearchTerm, focusSearchInput } = useSearchAndFilter({
    initialSearchTerm: pageState.filters.search,
    onSearchChange,
    searchInputRef: pageState.searchInputRef,
  })

  const setSearchTerm = useCallback((value: string) => {
    pageState.setShouldPreserveSearchFocus(true)
    originalSetSearchTerm(value)
  }, [originalSetSearchTerm, pageState])

  useEffect(() => {
    if (pageState.shouldPreserveSearchFocus && pageState.searchInputRef.current && document.activeElement !== pageState.searchInputRef.current) {
      const timer = setTimeout(() => {
        pageState.searchInputRef.current?.focus()
        pageState.setShouldPreserveSearchFocus(false)
      }, 0)
      return () => clearTimeout(timer)
    }
    if (pageState.shouldPreserveSearchFocus) {
      pageState.setShouldPreserveSearchFocus(false)
    }
  }, [pageState])

  const getDateRange = useCallback((filter: string) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const startOfWeek = new Date(today)
    startOfWeek.setDate(today.getDate() - today.getDay())
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
    const startOfYear = new Date(today.getFullYear(), 0, 1)
    const toDateParam = (date: Date) => date.toISOString().split('T')[0]

    switch (filter) {
      case 'today':
        return { fromDate: toDateParam(today), toDate: toDateParam(today) }
      case 'yesterday':
        return { fromDate: toDateParam(yesterday), toDate: toDateParam(yesterday) }
      case 'this_week':
        return { fromDate: toDateParam(startOfWeek), toDate: toDateParam(today) }
      case 'this_month':
        return { fromDate: toDateParam(startOfMonth), toDate: toDateParam(today) }
      case 'this_year':
        return { fromDate: toDateParam(startOfYear), toDate: toDateParam(today) }
      case 'custom':
        return { fromDate: pageState.filters.customFromDate, toDate: pageState.filters.customToDate }
      default:
        return { fromDate: undefined, toDate: undefined }
    }
  }, [pageState.filters.customFromDate, pageState.filters.customToDate])

  const dateRange = useMemo(() => getDateRange(pageState.filters.dateFilter), [getDateRange, pageState.filters.dateFilter])
  const queryArgs = useMemo(
    () => ({
      search: pageState.filters.search || undefined,
      sortBy: pageState.filters.sortBy,
      sortOrder: pageState.filters.sortOrder,
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
    }),
    [dateRange.fromDate, dateRange.toDate, pageState.filters.search, pageState.filters.sortBy, pageState.filters.sortOrder],
  )

  const { data, isLoading: loading, error, refetch } = useGetInvoicesQuery(queryArgs)
  const invoices = data?.data ?? []
  const pagination = data?.meta ?? { page: 1, limit: 20, total: 0, totalPages: 0 }

  const normalizedInvoices = useMemo(
    () =>
      invoices.map((invoice: any): InvoiceListItem => {
        const customerName = invoice.customerName || invoice.customer?.name || 'Unknown Customer'
        const invoiceDate = invoice.invoiceDate || invoice.issueDate
        const totalAmount = invoice.totalAmount || invoice.total || 0
        const balanceDue = invoice.balanceDue ?? invoice.dueAmount ?? (totalAmount - (invoice.paidAmount || 0))

        return {
          ...invoice,
          customerName,
          invoiceDate,
          totalAmount,
          balanceDue,
          paidAmount: invoice.paidAmount || 0,
          isOverdue: invoice.isOverdue || false,
        }
      }),
    [invoices],
  )

  const selection = useInvoicesSelection({
    dispatch,
    navigate,
    invoices: normalizedInvoices,
    selectedInvoice,
    focusedInvoiceIndex: pageState.focusedInvoiceIndex,
    setFocusedInvoiceIndex: pageState.setFocusedInvoiceIndex,
    location,
    refetch,
    invoiceListRef: pageState.invoiceListRef,
    searchInputRef: pageState.searchInputRef,
    hasRestoredSelection: pageState.hasRestoredSelection,
    selectedInvoiceRef: pageState.selectedInvoiceRef,
    setJournalEntryRef: pageState.setJournalEntryRef,
    setJournalEntryRefLoading: pageState.setJournalEntryRefLoading,
    setCreateDialog: pageState.setCreateDialog,
    setEditDialog: pageState.setEditDialog,
  })

  const actions = useInvoicesActions({
    selectedInvoice,
    showError,
    setCreateDialog: pageState.setCreateDialog,
    setEditDialog: pageState.setEditDialog,
    setDeletedInvoicesDialogOpen: pageState.setDeletedInvoicesDialogOpen,
  })

  useEffect(() => {
    if (pageState.previousPathnameRef.current !== '/sales/invoices' && location.pathname === '/sales/invoices') {
      void refetch()
    }
    pageState.previousPathnameRef.current = location.pathname
  }, [location.pathname, pageState.previousPathnameRef, refetch])

  useKeyboardShortcuts({
    onSearch: focusSearchInput,
    onArrowUp: selection.handleNavigateUp,
    onArrowDown: selection.handleNavigateDown,
    onEnter: selection.handleEnterAction,
    onPageUp: selection.handlePageUpNavigation,
    onPageDown: selection.handlePageDownNavigation,
    onHome: selection.handleNavigateToFirst,
    onEnd: selection.handleNavigateToLast,
    onEscape: selection.handleEscapeAction,
  })

  const handleSort = useCallback((field: string) => {
    pageState.setFilters((prev) => ({
      ...prev,
      sortBy: field,
      sortOrder: prev.sortBy === field && prev.sortOrder === 'desc' ? 'asc' : 'desc',
    }))
  }, [pageState])

  const navigateToJournalEntry = useCallback(() => {
    if (!pageState.journalEntryRef) return
    navigate(`/accounting/journal-entries?sourceType=${pageState.journalEntryRef.sourceType}&sourceId=${pageState.journalEntryRef.sourceId}`)
  }, [navigate, pageState.journalEntryRef])

  return (
    <Box sx={{ p: 3 }}>
      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to load invoices.
        </Alert>
      )}

      <Grid container spacing={3}>
        <Grid item xs={12} md={3}>
          <InvoicesTable
            invoices={normalizedInvoices}
            loading={loading}
            total={pagination.total || 0}
            selectedInvoiceId={selectedInvoice?.id}
            focusedInvoiceIndex={pageState.focusedInvoiceIndex}
            onInvoiceSelect={selection.handleInvoiceSelect}
            invoiceListRef={pageState.invoiceListRef}
          />
        </Grid>
        <Grid item xs={12} md={9}>
          <InvoiceDetailsPanel
            selectedInvoice={selectedInvoice}
            journalEntryRef={pageState.journalEntryRef}
            journalEntryRefLoading={pageState.journalEntryRefLoading}
            onPrint={() => pageState.setPrintDialogOpen(true)}
            onNavigateToSalesOrder={selection.handleSalesOrderClick}
            onNavigateToPayment={selection.handleNavigateToPayment}
            onNavigateToJournalEntry={navigateToJournalEntry}
          />
        </Grid>
      </Grid>

      <InvoicesDialogs
        createDialog={pageState.createDialog}
        editDialog={pageState.editDialog}
        deletedInvoicesDialogOpen={pageState.deletedInvoicesDialogOpen}
        printDialogOpen={pageState.printDialogOpen}
        selectedInvoice={selectedInvoice}
        onCloseCreateDialog={() => pageState.setCreateDialog(false)}
        onCloseEditDialog={() => pageState.setEditDialog(false)}
        onCloseDeletedInvoicesDialog={() => pageState.setDeletedInvoicesDialogOpen(false)}
        onClosePrintDialog={() => pageState.setPrintDialogOpen(false)}
      />
    </Box>
  )
}

export default InvoicesPage
