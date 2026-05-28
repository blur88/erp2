import { useEffect, useState, type ReactNode } from 'react'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import PaymentIcon from '@mui/icons-material/Payment'
import ReceiptIcon from '@mui/icons-material/Receipt'
import { Box, CircularProgress, Tab, Tabs, Typography } from '@mui/material'
import { skipToken } from '@reduxjs/toolkit/query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import PageHeader from '@/components/common/PageHeader'
import SalesOrderPrint from '@/components/print/SalesOrderPrint'
import PaymentDialog from '@/components/sales/PaymentDialog'
import RefundDialog from '@/components/sales/RefundDialog'
import { TABLE_STYLES } from '@/constants/tableStyles'
import { useNotification } from '@/hooks/useNotification'
import {
  useCancelSalesOrderMutation,
  useDuplicateSalesOrderMutation,
  useFulfillSalesOrderMutation,
  useGetSalesOrderByNumberQuery,
  useRecordOrderPaymentsMutation,
  useRecordOrderRefundsMutation,
  useUncancelSalesOrderMutation,
  useUnfulfillSalesOrderMutation,
} from '@/store/api/salesApi'

import OrderActionBar from './components/OrderActionBar'
import OrderJournalEntriesTab from './components/OrderJournalEntriesTab'
import OrderOverviewTab from './components/OrderOverviewTab'
import OrderPaymentsTab from './components/OrderPaymentsTab'
import { SalesOrderPaymentStatusChip } from './components/SalesOrderPaymentStatusChip'
import { SalesOrderStatusChip } from './components/SalesOrderStatusChip'

type Dialog = 'pay' | 'refund' | 'print' | 'fulfill' | 'unfulfill' | 'cancel' | 'uncancel' | null

interface TabPanelProps {
  children?: ReactNode
  index: number
  value: number
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = (error as { data?: { message?: string } }).data
    return data?.message ?? fallback
  }

  return fallback
}

function TabPanel({ children, value, index }: TabPanelProps) {
  return (
    <Box
      role="tabpanel"
      sx={{
        flex: 1,
        overflow: 'auto',
        display: value === index ? 'flex' : 'none',
        flexDirection: 'column',
      }}
    >
      {value === index && (
        <Box sx={{ p: TABLE_STYLES.cell.padding.px, flex: 1 }}>
          {children}
        </Box>
      )}
    </Box>
  )
}

export default function SalesOrderDetailPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabValue = Math.min(Math.max(Number(searchParams.get('tab') ?? 0), 0), 2)
  const [activeDialog, setActiveDialog] = useState<Dialog>(null)
  const { showSuccess, showError } = useNotification()

  const { data: order, isLoading, isError } = useGetSalesOrderByNumberQuery(orderNumber ?? skipToken)

  useEffect(() => {
    if (order?.orderNumber) {
      navigate(`/sales/orders/${order.orderNumber}/view`, {
        replace: true,
        state: { breadcrumbTitle: order.orderNumber },
      })
    }
  }, [order?.orderNumber, navigate])

  const [fulfillOrder, { isLoading: isFulfilling }] = useFulfillSalesOrderMutation()
  const [unfulfillOrder, { isLoading: isUnfulfilling }] = useUnfulfillSalesOrderMutation()
  const [cancelOrder, { isLoading: isCancelling }] = useCancelSalesOrderMutation()
  const [uncancelOrder, { isLoading: isUncancelling }] = useUncancelSalesOrderMutation()
  const [duplicateOrder] = useDuplicateSalesOrderMutation()
  const [recordPayments] = useRecordOrderPaymentsMutation()
  const [recordRefunds] = useRecordOrderRefundsMutation()

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isError || !order) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <Typography color="text.secondary">Order not found.</Typography>
      </Box>
    )
  }

  const handleFulfillConfirm = async () => {
    try {
      await fulfillOrder(order.id).unwrap()
      showSuccess(`Order ${order.orderNumber} fulfilled`)
      setActiveDialog(null)
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to fulfill order'))
    }
  }

  const handleUnfulfillConfirm = async () => {
    try {
      await unfulfillOrder(order.id).unwrap()
      showSuccess(`Order ${order.orderNumber} reverted to draft`)
      setActiveDialog(null)
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to unfulfill order'))
    }
  }

  const handleCancelConfirm = async () => {
    try {
      await cancelOrder({ id: order.id }).unwrap()
      showSuccess(`Order ${order.orderNumber} cancelled`)
      setActiveDialog(null)
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to cancel order'))
    }
  }

  const handleUncancelConfirm = async () => {
    try {
      await uncancelOrder(order.id).unwrap()
      showSuccess(`Order ${order.orderNumber} restored to draft`)
      setActiveDialog(null)
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to uncancel order'))
    }
  }

  const handleDuplicate = async () => {
    try {
      const newOrder = await duplicateOrder(order.id).unwrap()
      showSuccess(`Order duplicated as ${newOrder.orderNumber}`)
      navigate(`/sales/orders/${newOrder.orderNumber}/edit`)
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to duplicate order'))
    }
  }

  const handleSubmitPayment = async (
    payments: { paymentMethodId: string; amount: number; paymentDate: string; reference?: string }[],
  ) => {
    try {
      await recordPayments({ id: order.id, payments }).unwrap()
      showSuccess(`Payment recorded for ${order.orderNumber}`)
      setActiveDialog(null)
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to record payment'))
      throw error
    }
  }

  const handleSubmitRefund = async (
    refunds: { paymentMethodId: string; amount: number; paymentDate: string; reference?: string }[],
  ) => {
    try {
      await recordRefunds({ id: order.id, refunds }).unwrap()
      showSuccess(`Refund recorded for ${order.orderNumber}`)
      setActiveDialog(null)
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to record refund'))
      throw error
    }
  }

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title={order.orderNumber}
        titleBadge={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <SalesOrderStatusChip status={order.status} />
            <SalesOrderPaymentStatusChip status={order.paymentStatus} />
          </Box>
        }
        backAction={() => navigate('/sales/orders')}
      />

      <OrderActionBar
        order={order}
        onPay={() => setActiveDialog('pay')}
        onFulfill={() => setActiveDialog('fulfill')}
        onUnfulfill={() => setActiveDialog('unfulfill')}
        onRefund={() => setActiveDialog('refund')}
        onEdit={() => navigate(`/sales/orders/${order.orderNumber}/edit`)}
        onCancel={() => setActiveDialog('cancel')}
        onUncancel={() => setActiveDialog('uncancel')}
        onDuplicate={handleDuplicate}
        onPrint={() => setActiveDialog('print')}
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, value: number) => setSearchParams({ tab: String(value) }, { replace: true })}
          sx={{ minHeight: 36 }}
        >
          <Tab icon={<ReceiptIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Overview" sx={{ minHeight: 36 }} />
          <Tab icon={<PaymentIcon sx={{ fontSize: 16 }} />} iconPosition="start" label="Payments" sx={{ minHeight: 36 }} />
          <Tab
            icon={<AccountBalanceIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Journal Entries"
            sx={{ minHeight: 36 }}
          />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <OrderOverviewTab order={order} />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <OrderPaymentsTab orderId={order.id} totalAmount={order.totalAmount} />
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <OrderJournalEntriesTab orderId={order.id} />
      </TabPanel>

      <ConfirmationDialog
        open={activeDialog === 'fulfill'}
        title="Fulfill Order"
        message={`Fulfill this order? (${order.orderNumber})`}
        confirmText="Fulfill"
        onConfirm={handleFulfillConfirm}
        onCancel={() => setActiveDialog(null)}
        loading={isFulfilling}
      />

      <ConfirmationDialog
        open={activeDialog === 'unfulfill'}
        title="Revert Order"
        message={`Revert this order to draft? (${order.orderNumber})`}
        confirmText="Revert"
        onConfirm={handleUnfulfillConfirm}
        onCancel={() => setActiveDialog(null)}
        loading={isUnfulfilling}
      />

      <ConfirmationDialog
        open={activeDialog === 'cancel'}
        title="Cancel Order"
        message={`Cancel this order? (${order.orderNumber})`}
        confirmText="Cancel Order"
        severity="error"
        onConfirm={handleCancelConfirm}
        onCancel={() => setActiveDialog(null)}
        loading={isCancelling}
      />

      <ConfirmationDialog
        open={activeDialog === 'uncancel'}
        title="Restore Order"
        message={`Restore this cancelled order to draft? (${order.orderNumber})`}
        confirmText="Restore"
        onConfirm={handleUncancelConfirm}
        onCancel={() => setActiveDialog(null)}
        loading={isUncancelling}
      />

      {activeDialog === 'pay' && (
        <PaymentDialog
          open
          onClose={() => setActiveDialog(null)}
          onSubmit={handleSubmitPayment}
          orderId={order.id}
          orderNumber={order.orderNumber}
          totalAmount={order.totalAmount}
        />
      )}

      {activeDialog === 'refund' && (
        <RefundDialog
          open
          onClose={() => setActiveDialog(null)}
          onSubmit={handleSubmitRefund}
          orderId={order.id}
          orderNumber={order.orderNumber}
        />
      )}

      {activeDialog === 'print' && (
        <SalesOrderPrint
          open
          onClose={() => setActiveDialog(null)}
          salesOrder={order}
        />
      )}
    </Box>
  )
}
