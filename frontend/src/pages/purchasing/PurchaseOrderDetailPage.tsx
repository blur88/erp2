import { useEffect, useState, type ReactNode } from 'react'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import PaymentIcon from '@mui/icons-material/Payment'
import ReceiptIcon from '@mui/icons-material/Receipt'
import { Alert, Box, CircularProgress, Tab, Tabs, Typography } from '@mui/material'
import { skipToken } from '@reduxjs/toolkit/query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import PageHeader from '@/components/common/PageHeader'
import VendorPaymentDialog from '@/components/purchasing/VendorPaymentDialog'
import { useNotification } from '@/hooks/useNotification'
import {
  useCancelPurchaseOrderMutation,
  useGetPurchaseOrderByNumberQuery,
  useGetPurchaseOrderPaymentsQuery,
  useMarkPurchaseOrderAsUnpaidMutation,
  useReceiveGoodsMutation,
  useRecordVendorPaymentsMutation,
  useReturnGoodsMutation,
} from '@/store/api/purchasingApi'
import type { VendorPayment } from '@/types'

import PurchaseOrderActionBar from './components/PurchaseOrderActionBar'
import PurchaseOrderJournalEntriesTab from './components/PurchaseOrderJournalEntriesTab'
import PurchaseOrderOverviewTab from './components/PurchaseOrderOverviewTab'
import PurchaseOrderPaymentsTab from './components/PurchaseOrderPaymentsTab'
import PurchaseOrderPaymentStatusChip from './components/PurchaseOrderPaymentStatusChip'
import PurchaseOrderPrintDialog from './components/PurchaseOrderPrintDialog'
import PurchaseOrderStatusChip from './components/PurchaseOrderStatusChip'

type Dialog = 'pay' | 'receive' | 'return' | 'cancel' | 'unpay' | 'print' | null

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
      {value === index && <Box sx={{ p: 3, flex: 1 }}>{children}</Box>}
    </Box>
  )
}

export default function PurchaseOrderDetailPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabValue = Math.min(Math.max(Number(searchParams.get('tab') ?? 0), 0), 2)
  const [activeDialog, setActiveDialog] = useState<Dialog>(null)
  const { showSuccess, showError } = useNotification()

  const {
    data: order,
    isLoading,
    isError,
  } = useGetPurchaseOrderByNumberQuery(orderNumber ?? skipToken)
  const { data: payments = [] } = useGetPurchaseOrderPaymentsQuery(order?.id ?? skipToken)

  useEffect(() => {
    if (order?.orderNumber) {
      navigate(`/purchasing/orders/${order.orderNumber}/view`, {
        replace: true,
        state: { breadcrumbTitle: order.orderNumber },
      })
    }
  }, [order?.orderNumber, navigate])

  const [cancelOrder, { isLoading: isCancelling }] = useCancelPurchaseOrderMutation()
  const [receiveOrder, { isLoading: isReceiving }] = useReceiveGoodsMutation()
  const [returnOrder, { isLoading: isReturning }] = useReturnGoodsMutation()
  const [markUnpaid, { isLoading: isUnpaying }] = useMarkPurchaseOrderAsUnpaidMutation()
  const [recordPayments] = useRecordVendorPaymentsMutation()

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
        <Typography color="text.secondary">Purchase order not found.</Typography>
      </Box>
    )
  }

  const handlePaySubmit = async (
    paymentLines: { paymentMethodId: string; amount: number; paymentDate: string; reference?: string }[],
  ) => {
    try {
      await recordPayments({ purchaseOrderId: order.id, payments: paymentLines }).unwrap()
      showSuccess(`Payment recorded for ${order.orderNumber}`)
      setActiveDialog(null)
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to record payment'))
      throw error
    }
  }

  const handleReceiveConfirm = async () => {
    try {
      await receiveOrder(order.id).unwrap()
      showSuccess(`Purchase order ${order.orderNumber} received`)
      setActiveDialog(null)
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to receive purchase order'))
    }
  }

  const handleReturnConfirm = async () => {
    try {
      await returnOrder(order.id).unwrap()
      showSuccess(`Purchase order ${order.orderNumber} returned`)
      setActiveDialog(null)
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to return purchase order'))
    }
  }

  const handleCancelConfirm = async () => {
    try {
      await cancelOrder(order.id).unwrap()
      showSuccess(`Purchase order ${order.orderNumber} cancelled`)
      setActiveDialog(null)
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to cancel purchase order'))
    }
  }

  const handleUnpayConfirm = async () => {
    try {
      await markUnpaid(order.id).unwrap()
      showSuccess(`Purchase order ${order.orderNumber} marked unpaid`)
      setActiveDialog(null)
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to unpay purchase order'))
    }
  }

  const payment = (payments[0] ?? order.vendorPayments?.[0] ?? null) as Partial<VendorPayment> | null

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title={order.orderNumber}
        titleBadge={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <PurchaseOrderStatusChip status={order.status} />
            <PurchaseOrderPaymentStatusChip status={order.paymentStatus} />
          </Box>
        }
        backAction={() => navigate('/purchasing/orders')}
      />

      <PurchaseOrderActionBar
        order={order}
        onPay={() => setActiveDialog('pay')}
        onReceive={() => setActiveDialog('receive')}
        onReturn={() => setActiveDialog('return')}
        onEdit={() => navigate(`/purchasing/orders/${order.orderNumber}/edit`)}
        onCancel={() => setActiveDialog('cancel')}
        onUnpay={() => setActiveDialog('unpay')}
        onPrint={() => setActiveDialog('print')}
      />

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, value: number) => setSearchParams({ tab: String(value) }, { replace: true })}
          sx={{ minHeight: 36 }}
        >
          <Tab
            icon={<ReceiptIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Overview"
            sx={{ minHeight: 36 }}
          />
          <Tab
            icon={<PaymentIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Payments"
            sx={{ minHeight: 36 }}
          />
          <Tab
            icon={<AccountBalanceIcon sx={{ fontSize: 16 }} />}
            iconPosition="start"
            label="Journal Entries"
            sx={{ minHeight: 36 }}
          />
        </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <PurchaseOrderOverviewTab order={order} />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <PurchaseOrderPaymentsTab orderId={order.id} totalAmount={order.totalAmount ?? 0} />
      </TabPanel>
      <TabPanel value={tabValue} index={2}>
        <PurchaseOrderJournalEntriesTab orderId={order.id} />
      </TabPanel>

      <ConfirmationDialog
        open={activeDialog === 'receive'}
        title="Receive Purchase Order"
        message={`Receive this purchase order? (${order.orderNumber})`}
        confirmText="Receive"
        onConfirm={handleReceiveConfirm}
        onCancel={() => setActiveDialog(null)}
        loading={isReceiving}
      />

      <ConfirmationDialog
        open={activeDialog === 'return'}
        title="Return Purchase Order"
        message={`Return this purchase order to ready? (${order.orderNumber})`}
        confirmText="Return"
        onConfirm={handleReturnConfirm}
        onCancel={() => setActiveDialog(null)}
        loading={isReturning}
      />

      <ConfirmationDialog
        open={activeDialog === 'cancel'}
        title="Cancel Purchase Order"
        message={`Cancel this purchase order? (${order.orderNumber})`}
        confirmText="Cancel"
        severity="error"
        onConfirm={handleCancelConfirm}
        onCancel={() => setActiveDialog(null)}
        loading={isCancelling}
      />

      <ConfirmationDialog
        open={activeDialog === 'unpay'}
        title="Mark Unpaid"
        message={`Remove payment records for this purchase order? (${order.orderNumber})`}
        confirmText="Unpay"
        severity="warning"
        onConfirm={handleUnpayConfirm}
        onCancel={() => setActiveDialog(null)}
        loading={isUnpaying}
      />

      {activeDialog === 'pay' && (
        <VendorPaymentDialog
          open
          onClose={() => setActiveDialog(null)}
          onSubmit={handlePaySubmit}
          orderNumber={order.orderNumber}
          totalAmount={order.totalAmount ?? 0}
          paidAmount={order.paidAmount ?? 0}
        />
      )}

      {activeDialog === 'print' && (
        <PurchaseOrderPrintDialog
          open
          onClose={() => setActiveDialog(null)}
          purchaseOrder={order}
          payment={payment}
        />
      )}
    </Box>
  )
}
