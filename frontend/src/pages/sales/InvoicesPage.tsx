import React, { useCallback, useMemo, useState } from 'react'

import InvoiceContextHeader from './components/InvoiceContextHeader'
import InvoicesDialogs from './components/InvoicesDialogs'
import InvoicesTable from './components/InvoicesTable'
import InvoiceWorkspaceCard from './components/InvoiceWorkspaceCard'
import { type InvoiceListItem, useInvoicesWorkspace } from './hooks/useInvoicesWorkspace'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetInvoicesQuery } from '@/store/api/salesApi'
import { selectSelectedInvoice } from '@/store/slices/salesSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

interface InvoiceFilters {
  search: string
  period: PeriodValue
  customerId: string | null
  paymentStatus: 'unpaid' | 'partial' | 'paid' | 'overpaid' | null
  fulfillmentStatus: 'fulfilled' | 'unfulfilled' | null
}

const InvoicesPage: React.FC = () => {
  const dispatch = useAppDispatch()
  const selectedInvoice = useAppSelector(selectSelectedInvoice) as InvoiceListItem | null
  const [sortBy, setSortBy] = useState('invoiceNumber')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const filterConfig = useMemo<FilterBarConfig<InvoiceFilters>>(
    () => ({
      search: { placeholder: 'Search invoices...' },
      fields: [
        { field: 'period', label: 'Period', type: 'period' },
        { field: 'customerId', label: 'Customer', type: 'customer' },
        { field: 'paymentStatus', label: 'Payment', type: 'payment-status' },
        { field: 'fulfillmentStatus', label: 'Order Status', type: 'order-status' },
      ],
      defaults: {
        search: '',
        period: { key: null, from: null, to: null },
        customerId: null,
        paymentStatus: null,
        fulfillmentStatus: null,
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
      paymentStatus: appliedFilters.paymentStatus || undefined,
      fulfillmentStatus: appliedFilters.fulfillmentStatus || undefined,
    }),
    [
      appliedFilters.search,
      appliedFilters.customerId,
      appliedFilters.paymentStatus,
      appliedFilters.fulfillmentStatus,
      dateRange,
      sortBy,
      sortOrder,
    ],
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

  const workspace = useInvoicesWorkspace({
    dispatch,
    invoices: normalizedInvoices,
    selectedInvoice,
    refetch,
  })

  const filterHandlers = useMemo(() => ({
    ...handlers,
    onSearchChange: (value: string) => {
      workspace.setShouldPreserveSearchFocus(true)
      handlers.onSearchChange(value)
    },
  }), [handlers, workspace])

  return (
    <GenericListPage
      title="Invoices"
      subtitle="Track and manage customer invoices"
      primaryAction={{ label: 'New Invoice', onClick: workspace.handleAddInvoice }}
      secondaryAction={{ label: 'View Deleted', onClick: () => workspace.setDeletedInvoicesDialogOpen(true) }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={filterHandlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={workspace.searchInputRef}
      sort={{ field: 'invoiceNumber', sortBy, sortOrder, onSort: handleSort }}
      error={error ? 'Failed to load invoices.' : null}
      listSlot={(
        <InvoicesTable
          invoices={normalizedInvoices}
          loading={loading}
          total={pagination.total || 0}
          selectedInvoiceId={selectedInvoice?.id}
          focusedInvoiceIndex={workspace.focusedInvoiceIndex}
          onInvoiceSelect={workspace.handleInvoiceSelect}
          invoiceListRef={workspace.invoiceListRef}
        />
      )}
      headerSlot={(
        <InvoiceContextHeader
          selectedInvoice={selectedInvoice}
          journalEntryRef={workspace.journalEntryRef}
          journalEntryRefLoading={workspace.journalEntryRefLoading}
          onPrint={() => workspace.setPrintDialogOpen(true)}
          onNavigateToSalesOrder={workspace.handleSalesOrderClick}
          onNavigateToPayment={workspace.handleNavigateToPayment}
          onNavigateToJournalEntry={workspace.navigateToJournalEntry}
        />
      )}
      workspaceSlot={<InvoiceWorkspaceCard selectedInvoice={selectedInvoice} />}
      dialogs={(
        <InvoicesDialogs
          createDialog={workspace.createDialog}
          editDialog={workspace.editDialog}
          deletedInvoicesDialogOpen={workspace.deletedInvoicesDialogOpen}
          printDialogOpen={workspace.printDialogOpen}
          selectedInvoice={selectedInvoice}
          onCloseCreateDialog={() => workspace.setCreateDialog(false)}
          onCloseEditDialog={() => workspace.setEditDialog(false)}
          onCloseDeletedInvoicesDialog={() => workspace.setDeletedInvoicesDialogOpen(false)}
          onClosePrintDialog={() => workspace.setPrintDialogOpen(false)}
        />
      )}
    />
  )
}

export default InvoicesPage
