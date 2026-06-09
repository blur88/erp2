import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import PagePagination from '@/components/common/PagePagination'
import SimpleListPage from '@/components/common/SimpleListPage'
import VendorPaymentDialog from '@/components/purchasing/VendorPaymentDialog'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useNotification } from '@/hooks/useNotification'
import {
  useCancelPurchaseOrderMutation,
  useGetPurchaseOrdersQuery,
  useMarkPurchaseOrderAsUnpaidMutation,
  useReceiveGoodsMutation,
  useRecordVendorPaymentsMutation,
  useReturnGoodsMutation,
} from '@/store/api/purchasingApi'
import type { PurchaseOrder } from '@/types'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'

import PurchaseOrderList from './components/PurchaseOrderList'
import PurchaseOrderPrintDialog from './components/PurchaseOrderPrintDialog'

interface PurchaseOrderFilters {
  search: string
  supplierId: string | null
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID' | null
  period: PeriodValue
  status: 'DRAFT' | 'READY' | 'RECEIVED' | 'CANCELLED' | null
}

const PAGE_SIZE_OPTIONS = [10, 25, 50]
const DEFAULT_LIMIT = 25

const filterConfig: FilterBarConfig<PurchaseOrderFilters> = {
  search: { placeholder: 'Search purchase orders...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'supplierId', label: 'Supplier', type: 'supplier' },
    { field: 'status', label: 'Order Status', type: 'purchasing-status' },
    { field: 'paymentStatus', label: 'Payment Status', type: 'payment-status', valueCase: 'upper' },
  ],
  defaults: {
    search: '',
    supplierId: null,
    paymentStatus: null,
    period: { key: null, from: null, to: null },
    status: null,
  },
}

type ConfirmAction = 'receive' | 'return' | 'cancel' | 'unpay'

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = (error as { data?: { message?: string } }).data
    return data?.message ?? fallback
  }

  return fallback
}

const PurchaseOrdersPage: React.FC = () => {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const [sortBy, setSortBy] = useState('orderNumber')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const [printOrder, setPrintOrder] = useState<PurchaseOrder | null>(null)
  const [paymentOrder, setPaymentOrder] = useState<PurchaseOrder | null>(null)
  const [confirmOrder, setConfirmOrder] = useState<PurchaseOrder | null>(null)
  const [confirmAction, setConfirmAction] = useState<ConfirmAction | null>(null)

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig)

  useEffect(() => {
    setPage(1)
  }, [appliedFilters])

  const weekStartsOn = getStartOfWeek()
  const dateRange = useMemo(() => {
    const period = appliedFilters.period
    if (!period || period.key === null) return { fromDate: undefined, toDate: undefined }
    if (period.key === 'custom') {
      return { fromDate: period.from ?? undefined, toDate: period.to ?? undefined }
    }

    const range = getPeriodDateRange(period.key, weekStartsOn)
    return { fromDate: range.from, toDate: range.to }
  }, [appliedFilters.period, weekStartsOn])

  const queryParams = useMemo(() => ({
    sortBy,
    sortOrder: sortOrder.toUpperCase() as 'ASC' | 'DESC',
    search: appliedFilters.search || undefined,
    supplierId: appliedFilters.supplierId || undefined,
    paymentStatus: appliedFilters.paymentStatus || undefined,
    status: appliedFilters.status || undefined,
    orderDateFrom: dateRange.fromDate,
    orderDateTo: dateRange.toDate,
    page,
    limit,
  }), [appliedFilters, dateRange, limit, page, sortBy, sortOrder])

  const {
    data: purchaseOrdersResponse,
    isFetching,
    error: purchaseOrdersError,
    refetch,
  } = useGetPurchaseOrdersQuery(queryParams)

  const purchaseOrders = purchaseOrdersResponse?.data ?? []
  const pagination = purchaseOrdersResponse?.meta
  const error =
    purchaseOrdersError && typeof purchaseOrdersError === 'object'
      ? (getErrorMessage(purchaseOrdersError, 'Failed to fetch purchase orders'))
      : null

  const [receivePurchaseOrder, { isLoading: isReceiving }] = useReceiveGoodsMutation()
  const [returnPurchaseOrder, { isLoading: isReturning }] = useReturnGoodsMutation()
  const [cancelPurchaseOrder, { isLoading: isCancelling }] = useCancelPurchaseOrderMutation()
  const [markPurchaseOrderAsUnpaid, { isLoading: isUnpaying }] = useMarkPurchaseOrderAsUnpaidMutation()
  const [recordVendorPayments] = useRecordVendorPaymentsMutation()

  const handleSort = useCallback((field: string) => {
    setSortOrder((prev) => (sortBy === field && prev === 'desc' ? 'asc' : 'desc'))
    setSortBy(field)
    setPage(1)
  }, [sortBy])

  const handleLimitChange = useCallback((nextLimit: number) => {
    setLimit(nextLimit)
    setPage(1)
  }, [])

  const loadOrders = useCallback(() => {
    void refetch()
  }, [refetch])

  const openConfirm = useCallback((order: PurchaseOrder, action: ConfirmAction) => {
    setConfirmOrder(order)
    setConfirmAction(action)
  }, [])

  const closeConfirm = useCallback(() => {
    setConfirmOrder(null)
    setConfirmAction(null)
  }, [])

  const handleSubmitPayment = useCallback(async (
    payments: { paymentMethodId: string; amount: number; reference?: string }[],
  ) => {
    if (!paymentOrder) return

    try {
      await recordVendorPayments({
        purchaseOrderId: paymentOrder.id,
        payments,
      }).unwrap()
      showSuccess(`Payment recorded for ${paymentOrder.orderNumber}`)
      setPaymentOrder(null)
    } catch (error) {
      showError(getErrorMessage(error, `Failed to record payment for ${paymentOrder.orderNumber}`))
      throw error
    }
  }, [paymentOrder, recordVendorPayments, showError, showSuccess])

  const handleConfirmAction = useCallback(async () => {
    if (!confirmOrder || !confirmAction) return

    try {
      switch (confirmAction) {
        case 'receive':
          await receivePurchaseOrder(confirmOrder.id).unwrap()
          showSuccess(`Purchase order ${confirmOrder.orderNumber} received`)
          break
        case 'return':
          await returnPurchaseOrder(confirmOrder.id).unwrap()
          showSuccess(`Purchase order ${confirmOrder.orderNumber} returned`)
          break
        case 'cancel':
          await cancelPurchaseOrder(confirmOrder.id).unwrap()
          showSuccess(`Purchase order ${confirmOrder.orderNumber} cancelled`)
          break
        case 'unpay':
          await markPurchaseOrderAsUnpaid(confirmOrder.id).unwrap()
          showSuccess(`Purchase order ${confirmOrder.orderNumber} marked unpaid`)
          break
      }
      closeConfirm()
    } catch (error) {
      showError(
        getErrorMessage(
          error,
          `Failed to ${confirmAction} purchase order ${confirmOrder.orderNumber}`,
        ),
      )
    }
  }, [
    cancelPurchaseOrder,
    closeConfirm,
    confirmAction,
    confirmOrder,
    markPurchaseOrderAsUnpaid,
    receivePurchaseOrder,
    returnPurchaseOrder,
    showError,
    showSuccess,
  ])

  const confirmConfig = useMemo(() => {
    if (!confirmOrder || !confirmAction) return null

    const configs: Record<ConfirmAction, {
      title: string
      message: string
      confirmText: string
      severity?: 'warning' | 'error'
      loading: boolean
    }> = {
      receive: {
        title: 'Receive Purchase Order',
        message: `Receive this purchase order? (${confirmOrder.orderNumber})`,
        confirmText: 'Receive',
        loading: isReceiving,
      },
      return: {
        title: 'Return Purchase Order',
        message: `Return this purchase order to ready? (${confirmOrder.orderNumber})`,
        confirmText: 'Return',
        loading: isReturning,
      },
      cancel: {
        title: 'Cancel Purchase Order',
        message: `Cancel this purchase order? (${confirmOrder.orderNumber})`,
        confirmText: 'Cancel',
        severity: 'error',
        loading: isCancelling,
      },
      unpay: {
        title: 'Mark Unpaid',
        message: `Remove payment records for this purchase order? (${confirmOrder.orderNumber})`,
        confirmText: 'Unpay',
        severity: 'warning',
        loading: isUnpaying,
      },
    }

    return configs[confirmAction]
  }, [confirmAction, confirmOrder, isCancelling, isReceiving, isReturning, isUnpaying])

  return (
    <>
      <SimpleListPage
        title="Purchase Orders"
        subtitle="Track supplier orders, receipts, and payment status"
        primaryAction={{ label: '+ New Purchase Order', onClick: () => navigate('/purchasing/orders/create') }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={searchInputRef}
        sort={{
          field: 'orderNumber',
          sortBy,
          sortOrder,
          onSort: handleSort,
        }}
        isFetching={isFetching}
        error={error}
        onErrorClose={loadOrders}
        tableSlot={(
          <PurchaseOrderList
            orders={purchaseOrders}
            loading={isFetching}
            total={pagination?.total ?? 0}
            onView={(order) => navigate(`/purchasing/orders/${order.orderNumber}/view`)}
            onEdit={(order) => navigate(`/purchasing/orders/${order.orderNumber}/edit`)}
            onPay={(order) => setPaymentOrder(order)}
            onReceive={(order) => openConfirm(order, 'receive')}
            onReturn={(order) => openConfirm(order, 'return')}
            onCancel={(order) => openConfirm(order, 'cancel')}
            onUnpay={(order) => openConfirm(order, 'unpay')}
            onPrint={(order) => setPrintOrder(order)}
            paginationSlot={(
              <PagePagination
                total={pagination?.total ?? 0}
                page={page}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={handleLimitChange}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
              />
            )}
          />
        )}
        dialogs={(
          <>
            {paymentOrder && (
              <VendorPaymentDialog
                open
                onClose={() => setPaymentOrder(null)}
                onSubmit={handleSubmitPayment}
                orderNumber={paymentOrder.orderNumber}
                totalAmount={paymentOrder.totalAmount ?? 0}
                paidAmount={paymentOrder.paidAmount ?? 0}
              />
            )}

            {printOrder && (
              <PurchaseOrderPrintDialog
                open
                onClose={() => setPrintOrder(null)}
                purchaseOrder={printOrder}
                payment={printOrder.vendorPayments?.[0] ?? null}
              />
            )}

            {confirmOrder && confirmConfig && (
              <ConfirmationDialog
                open
                title={confirmConfig.title}
                message={confirmConfig.message}
                confirmText={confirmConfig.confirmText}
                severity={confirmConfig.severity}
                onConfirm={handleConfirmAction}
                onCancel={closeConfirm}
                loading={confirmConfig.loading}
              />
            )}
          </>
        )}
      />
    </>
  )
}

export default PurchaseOrdersPage
