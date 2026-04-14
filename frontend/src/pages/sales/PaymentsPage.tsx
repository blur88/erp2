import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Chip, Stack } from '@mui/material'
import { useLocation, useNavigate } from 'react-router-dom'

import PaymentContextHeader from './components/PaymentContextHeader'
import PaymentsDialogs from './components/PaymentsDialogs'
import PaymentsTable from './components/PaymentsTable'
import PaymentWorkspaceCard from './components/PaymentWorkspaceCard'
import type { PaymentListItem } from './hooks/usePaymentsPageState'
import { usePaymentsPageState } from './hooks/usePaymentsPageState'
import { usePaymentsSelection } from './hooks/usePaymentsSelection'

import GenericListPage from '@/components/common/GenericListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useKeyboardShortcuts } from '@/hooks/useSearchAndFilter'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import { useGetCustomersQuery, useGetPaymentsQuery } from '@/store/api/salesApi'
import { selectSelectedPayment } from '@/store/slices/salesSlice'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

interface PaymentFilters {
  search: string
  period: PeriodValue
  customerId: string | null
  transactionStatus: string | null
}

const PaymentsPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const dispatch = useAppDispatch()
  const selectedPayment = useAppSelector(selectSelectedPayment) as PaymentListItem | null
  const pageState = usePaymentsPageState()
  const [sortBy, setSortBy] = useState('paymentNumber')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')

  const presetCustomerId = (location.state as { customerId?: string } | null)?.customerId ?? null
  const { data: customersData } = useGetCustomersQuery({})
  const customers = customersData?.data ?? []

  const filterConfig = useMemo<FilterBarConfig<PaymentFilters>>(
    () => ({
      search: { placeholder: 'Search by payment number or customer...' },
      fields: [
        { field: 'period', label: 'Period', type: 'period' },
        { field: 'customerId', label: 'Customer', type: 'customer', paramKey: 'customer' },
        { field: 'transactionStatus', label: 'Status', type: 'transaction-status' },
      ],
      defaults: {
        search: '',
        period: { key: null, from: null, to: null },
        customerId: null,
        transactionStatus: null,
      },
    }),
    [],
  )

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  const filterBarHandlers = useMemo(
    () =>
      presetCustomerId
        ? { ...handlers, onClearAll: () => handlers.onClearField('search') }
        : handlers,
    [handlers, presetCustomerId],
  )

  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
    if (period.key === 'custom') return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }

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
      customerId: presetCustomerId ?? appliedFilters.customerId ?? undefined,
      status: appliedFilters.transactionStatus ?? undefined,
    }),
    [
      appliedFilters.search,
      appliedFilters.customerId,
      appliedFilters.transactionStatus,
      dateRange,
      sortBy,
      sortOrder,
      presetCustomerId,
    ],
  )

  const { data, isLoading: loading, error, refetch } = useGetPaymentsQuery(queryArgs)
  const payments = (data?.data ?? []) as PaymentListItem[]
  const totalPayments = data?.meta?.total ?? 0

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'asc' ? 'desc' : 'asc'))
    setSortBy(field)
  }, [sortBy])

  const selection = usePaymentsSelection({
    dispatch,
    navigate,
    payments,
    selectedPayment,
    focusedPaymentIndex: pageState.focusedPaymentIndex,
    setFocusedPaymentIndex: pageState.setFocusedPaymentIndex,
    location,
    refetch,
    paymentListRef: pageState.paymentListRef,
    searchInputRef: pageState.searchInputRef,
    hasRestoredSelection: pageState.hasRestoredSelection,
    selectedPaymentRef: pageState.selectedPaymentRef,
    setJournalEntryRef: pageState.setJournalEntryRef,
    setJournalEntryRefLoading: pageState.setJournalEntryRefLoading,
  })

  useEffect(() => {
    if (pageState.previousPathnameRef.current !== '/sales/payments' && location.pathname === '/sales/payments') {
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

  return (
    <GenericListPage
      title="Payments"
      subtitle="Review customer payments and transaction history"
      secondaryAction={{ label: 'View Deleted', onClick: () => pageState.setDeletedPaymentsDialogOpen(true) }}
      filterConfig={filterConfig}
      draftFilters={draftFilters}
      handlers={filterBarHandlers}
      hasActiveFilters={hasActiveFilters}
      searchInputRef={pageState.searchInputRef}
      sort={{ field: 'paymentNumber', sortBy, sortOrder, onSort: handleSort }}
      error={error ? 'Failed to load payments.' : null}
      contentSlot={presetCustomerId ? (
        <Stack direction="row" sx={{ mb: 2 }}>
          <Chip
            label={`Customer: ${customers.find((customer) => customer.id === presetCustomerId)?.name ?? presetCustomerId}`}
            size="small"
            variant="filled"
            color="primary"
          />
        </Stack>
      ) : null}
      listSlot={(
        <PaymentsTable
          payments={payments}
          loading={loading}
          total={totalPayments}
          selectedPaymentId={selectedPayment?.id}
          focusedPaymentIndex={pageState.focusedPaymentIndex}
          onPaymentSelect={selection.handlePaymentSelect}
          paymentListRef={pageState.paymentListRef}
        />
      )}
      headerSlot={(
        <PaymentContextHeader
          selectedPayment={selectedPayment}
          journalEntryRef={pageState.journalEntryRef}
          journalEntryRefLoading={pageState.journalEntryRefLoading}
          onPrint={() => pageState.setPrintDialogOpen(true)}
          onOrderClick={selection.handleOrderClick}
          onInvoiceClick={selection.handleInvoiceClick}
          onNavigateToJournalEntry={selection.handleNavigateToJournalEntry}
        />
      )}
      workspaceSlot={<PaymentWorkspaceCard selectedPayment={selectedPayment} />}
      dialogs={(
        <PaymentsDialogs
          deletedPaymentsDialogOpen={pageState.deletedPaymentsDialogOpen}
          printDialogOpen={pageState.printDialogOpen}
          selectedPayment={selectedPayment}
          onCloseDeletedPaymentsDialog={() => pageState.setDeletedPaymentsDialogOpen(false)}
          onClosePrintDialog={() => pageState.setPrintDialogOpen(false)}
        />
      )}
    />
  )
}

export default PaymentsPage
