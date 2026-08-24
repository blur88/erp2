import React, { useCallback, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import PagePagination from '@/components/common/PagePagination'
import SimpleListPage from '@/components/common/SimpleListPage'
import { useFilterBar } from '@/hooks/useFilterBar'
import { useListUrlState } from '@/hooks/useListUrlState'
import { withCurrentListQuery } from '@/utils/listQuery'
import { useNotification } from '@/hooks/useNotification'
import {
  useCancelSalesOrderMutation,
  useDuplicateSalesOrderMutation,
  useFulfillSalesOrderMutation,
  useGetSalesOrdersQuery,
  useRecordOrderPaymentsMutation,
  useRecordOrderRefundsMutation,
  useUncancelSalesOrderMutation,
  useUnfulfillSalesOrderMutation,
} from '@/store/api/salesApi'
import type { SalesOrder } from '@/types'
import { ORDER_STATUS_OPTIONS } from '@/constants/filterOptions'
import type { FilterBarConfig, PeriodValue } from '@/types/filterBar.types'
import { getPeriodDateRange, getStartOfWeek } from '@/utils/dateRange'
import { PAGINATION } from '@/constants/tableStyles'

import SalesOrderList from './components/SalesOrderList'
import SalesOrdersDialogs from './components/SalesOrdersDialogs'

interface SalesOrderFilters {
  search: string
  customerId: string | null
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' | 'OVERPAID' | null
  period: PeriodValue
  status: 'DRAFT' | 'READY' | 'FULFILLED' | 'CANCELLED' | null
}

const filterConfig: FilterBarConfig<SalesOrderFilters> = {
  search: { placeholder: 'Search orders...' },
  fields: [
    { field: 'period', label: 'Period', type: 'period' },
    { field: 'customerId', label: 'Customer', type: 'customer' },
    { field: 'status', label: 'Order Status', type: 'select', options: ORDER_STATUS_OPTIONS },
    { field: 'paymentStatus', label: 'Payment Status', type: 'payment-status', valueCase: 'upper' },
  ],
  defaults: {
    search: '',
    customerId: null,
    paymentStatus: null,
    period: { key: null, from: null, to: null },
    status: null,
  },
}

const OrdersPage: React.FC = () => {
  const navigate = useNavigate()
  const location = useLocation()
  const { showSuccess, showError } = useNotification()
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const { sortBy, sortOrder, page, limit, setPage, setLimit, setSort, resetPage } =
    useListUrlState({
      sort: { fields: ['orderNumber'], defaultField: 'orderNumber', defaultOrder: 'desc' },
    })

  const [printOrder, setPrintOrder] = useState<SalesOrder | null>(null)
  const [paymentOrder, setPaymentOrder] = useState<SalesOrder | null>(null)
  const [refundOrder, setRefundOrder] = useState<SalesOrder | null>(null)

  const { appliedFilters, draftFilters, handlers, hasActiveFilters } = useFilterBar(filterConfig, {
    onApply: resetPage,
  })

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
    customerId: appliedFilters.customerId || undefined,
    status: appliedFilters.status || undefined,
    paymentStatus: appliedFilters.paymentStatus || undefined,
    fromDate: dateRange.fromDate,
    toDate: dateRange.toDate,
    page,
    limit,
  }), [appliedFilters, dateRange, sortBy, sortOrder, page, limit])

  const { data: ordersData, isFetching, error } = useGetSalesOrdersQuery(queryParams)
  const orders = ordersData?.data ?? []
  const total = ordersData?.meta.total ?? 0

  const [fulfillOrder] = useFulfillSalesOrderMutation()
  const [unfulfillOrder] = useUnfulfillSalesOrderMutation()
  const [cancelOrder] = useCancelSalesOrderMutation()
  const [uncancelOrder] = useUncancelSalesOrderMutation()
  const [duplicateOrder] = useDuplicateSalesOrderMutation()
  const [recordPayments] = useRecordOrderPaymentsMutation()
  const [recordRefunds] = useRecordOrderRefundsMutation()

  const handleFulfill = useCallback(async (order: SalesOrder) => {
    try {
      await fulfillOrder(order.id).unwrap()
      showSuccess(`Order ${order.orderNumber} fulfilled`)
    } catch (e: any) {
      showError(e?.data?.message || `Failed to fulfill ${order.orderNumber}`)
    }
  }, [fulfillOrder, showError, showSuccess])

  const handleUnfulfill = useCallback(async (order: SalesOrder) => {
    try {
      await unfulfillOrder(order.id).unwrap()
      showSuccess(`Order ${order.orderNumber} unfulfilled`)
    } catch (e: any) {
      showError(e?.data?.message || `Failed to unfulfill ${order.orderNumber}`)
    }
  }, [showError, showSuccess, unfulfillOrder])

  const handleCancel = useCallback(async (order: SalesOrder) => {
    try {
      await cancelOrder({ id: order.id }).unwrap()
      showSuccess(`Order ${order.orderNumber} cancelled`)
    } catch (e: any) {
      showError(e?.data?.message || `Failed to cancel ${order.orderNumber}`)
    }
  }, [cancelOrder, showError, showSuccess])

  const handleUncancel = useCallback(async (order: SalesOrder) => {
    try {
      await uncancelOrder(order.id).unwrap()
      showSuccess(`Order ${order.orderNumber} restored to draft`)
    } catch (e: any) {
      showError(e?.data?.message || `Failed to uncancel ${order.orderNumber}`)
    }
  }, [uncancelOrder, showError, showSuccess])

  const handleDuplicate = useCallback(async (order: SalesOrder) => {
    try {
      const newOrder = await duplicateOrder(order.id).unwrap()
      showSuccess(`Order duplicated as ${newOrder.orderNumber}`)
    } catch (e: any) {
      showError(e?.data?.message || `Failed to duplicate ${order.orderNumber}`)
    }
  }, [duplicateOrder, showError, showSuccess])

  const handleRefund = useCallback((order: SalesOrder) => {
    setRefundOrder(order)
  }, [])

  const handleSubmitRefund = useCallback(async (
    refunds: { paymentMethodId: string; amount: string; paymentDate: string; reference?: string }[],
  ) => {
    if (!refundOrder) return
    try {
      await recordRefunds({ id: refundOrder.id, refunds }).unwrap()
      setRefundOrder(null)
      showSuccess(`Refund recorded for ${refundOrder.orderNumber}`)
    } catch (e: any) {
      showError(e?.data?.message || `Failed to record refund for ${refundOrder.orderNumber}`)
      throw e
    }
  }, [refundOrder, recordRefunds, showError, showSuccess])

  const handleSubmitPayment = useCallback(async (
    payments: { paymentMethodId: string; amount: string; paymentDate: string; reference?: string }[],
  ) => {
    if (!paymentOrder) return
    try {
      await recordPayments({ id: paymentOrder.id, payments }).unwrap()
      setPaymentOrder(null)
      showSuccess(`Payment recorded for ${paymentOrder.orderNumber}`)
    } catch (e: any) {
      showError(e?.data?.message || `Failed to record payment for ${paymentOrder.orderNumber}`)
      throw e
    }
  }, [paymentOrder, recordPayments, showError, showSuccess])

  return (
    <>
      <SimpleListPage
        title="Sales Orders"
        subtitle="Track sales orders and delivery status"
        primaryAction={{ label: '+ New Sales Order', onClick: () => navigate(withCurrentListQuery('/sales/orders/create')) }}
        filterConfig={filterConfig}
        draftFilters={draftFilters}
        handlers={handlers}
        hasActiveFilters={hasActiveFilters}
        searchInputRef={searchInputRef}
        sort={{ field: 'orderNumber', sortBy, sortOrder, onSort: setSort }}
        isFetching={isFetching}
        error={error ? 'Failed to load sales orders.' : null}
        tableSlot={(
          <SalesOrderList
            orders={orders}
            loading={isFetching}
            total={total}
            onView={(order) => navigate(withCurrentListQuery(`/sales/orders/${order.orderNumber}/view`))}
            onEdit={(order) => navigate(withCurrentListQuery(`/sales/orders/${order.orderNumber}/edit`))}
            onPay={(order) => setPaymentOrder(order)}
            onFulfill={handleFulfill}
            onUnfulfill={handleUnfulfill}
            onRefund={handleRefund}
            onCancel={handleCancel}
            onUncancel={handleUncancel}
            onDuplicate={handleDuplicate}
            onPrint={(order) => setPrintOrder(order)}
            paginationSlot={(
              <PagePagination
                total={total}
                page={page}
                limit={limit}
                onPageChange={setPage}
                onLimitChange={setLimit}
                pageSizeOptions={PAGINATION.options}
              />
            )}
          />
        )}
      />
      <SalesOrdersDialogs
        printOrder={printOrder}
        onClosePrint={() => setPrintOrder(null)}
        paymentOrder={paymentOrder}
        onClosePayment={() => setPaymentOrder(null)}
        onSubmitPayment={handleSubmitPayment}
        refundOrder={refundOrder}
        onCloseRefund={() => setRefundOrder(null)}
        onSubmitRefund={handleSubmitRefund}
      />
    </>
  )
}

export default OrdersPage
