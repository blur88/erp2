import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Box, useMediaQuery, useTheme } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'

import InvoiceContextHeader from './components/InvoiceContextHeader'
import InvoicesDialogs from './components/InvoicesDialogs'
import InvoicesTable from './components/InvoicesTable'
import InvoiceWorkspaceCard from './components/InvoiceWorkspaceCard'
import { useInvoicesActions } from './hooks/useInvoicesActions'
import { type InvoiceListItem, useInvoicesPageState } from './hooks/useInvoicesPageState'
import { useInvoicesSelection } from './hooks/useInvoicesSelection'

import MasterDetailWorkspace from '@/components/common/MasterDetailWorkspace'
import PageHeader from '@/components/common/PageHeader'
import { FilterBar } from '@/components/filters/FilterBar'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetInvoicesQuery } from '@/store/api/salesApi'
import { selectSelectedInvoice } from '@/store/slices/salesSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

interface InvoiceFilters {
  search: string
  period: PeriodValue
  customerId: string | null
}

const InvoicesPage: React.FC = () => {
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const { showError } = useNotification()
  const selectedInvoice = useAppSelector(selectSelectedInvoice) as InvoiceListItem | null
  const pageState = useInvoicesPageState()
  const [sortBy, setSortBy] = useState('invoiceNumber')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const filterConfig = useMemo<FilterBarConfig<InvoiceFilters>>(
    () => ({
      search: { placeholder: 'Search invoices...' },
      fields: [
        { field: 'period', label: 'Period', type: 'period' },
        { field: 'customerId', label: 'Customer', type: 'customer' },
      ],
      defaults: {
        search: '',
        period: { key: null, from: null, to: null },
        customerId: null,
      },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) {
      return { fromDate: undefined, toDate: undefined }
    }
    if (period.key === 'custom') {
      return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    }
    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: range.from, toDate: range.to }
  }, [appliedFilters.period, weekStartsOn])

  const queryArgs = useMemo(
    () => ({
      search: appliedFilters.search || undefined,
      sortBy,
      sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
      fromDate: dateRange.fromDate,
      toDate: dateRange.toDate,
      customerId: appliedFilters.customerId || undefined,
    }),
    [appliedFilters.search, appliedFilters.customerId, dateRange, sortBy, sortOrder],
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

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
  }, [sortBy])

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      pageState.setShouldPreserveSearchFocus(true)
      handlers.onSearchChange(value)
    },
  }), [handlers, pageState])

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
  }, [loading, pageState])

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
    onSearch: () => {
      pageState.searchInputRef.current?.focus()
      pageState.searchInputRef.current?.select()
    },
    onArrowUp: selection.handleNavigateUp,
    onArrowDown: selection.handleNavigateDown,
    onEnter: selection.handleEnterAction,
    onPageUp: selection.handlePageUpNavigation,
    onPageDown: selection.handlePageDownNavigation,
    onHome: selection.handleNavigateToFirst,
    onEnd: selection.handleNavigateToLast,
    onEscape: selection.handleEscapeAction,
  })

  const navigateToJournalEntry = useCallback(() => {
    if (!pageState.journalEntryRef) return
    navigate(`/accounting/journal-entries?sourceType=${pageState.journalEntryRef.sourceType}&sourceId=${pageState.journalEntryRef.sourceId}`)
  }, [navigate, pageState.journalEntryRef])

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title="Invoices"
        subtitle="Track and manage customer invoices"
        variant="workflow"
        secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedInvoicesDialogOpen(true) }}
        toolbar={(
          <FilterBar
            config={filterConfig}
            draftFilters={draftFilters}
            handlers={filterHandlers}
            hasActiveFilters={hasActiveFilters}
            searchInputRef={pageState.searchInputRef}
            sort={{ field: 'invoiceNumber', sortBy, sortOrder, onSort: handleSort }}
          />
        )}
      />

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          Failed to load invoices.
        </Alert>
      )}

      <MasterDetailWorkspace
        isMobile={isMobile}
        listSlot={(
          <InvoicesTable
            invoices={normalizedInvoices}
            loading={loading}
            total={pagination.total || 0}
            selectedInvoiceId={selectedInvoice?.id}
            focusedInvoiceIndex={pageState.focusedInvoiceIndex}
            onInvoiceSelect={selection.handleInvoiceSelect}
            invoiceListRef={pageState.invoiceListRef}
          />
        )}
        headerSlot={(
          <InvoiceContextHeader
            selectedInvoice={selectedInvoice}
            journalEntryRef={pageState.journalEntryRef}
            journalEntryRefLoading={pageState.journalEntryRefLoading}
            onPrint={() => pageState.setPrintDialogOpen(true)}
            onNavigateToSalesOrder={selection.handleSalesOrderClick}
            onNavigateToPayment={selection.handleNavigateToPayment}
            onNavigateToJournalEntry={navigateToJournalEntry}
          />
        )}
        workspaceSlot={<InvoiceWorkspaceCard selectedInvoice={selectedInvoice} />}
      />

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
