import { useEffect, useState, type ReactNode } from 'react';
import PaymentIcon from '@mui/icons-material/Payment';
import ReceiptIcon from '@mui/icons-material/Receipt';
import { Alert, Box, CircularProgress, Tab, Tabs, Typography } from '@mui/material';
import { skipToken } from '@reduxjs/toolkit/query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import ConfirmationDialog from '@/components/common/ConfirmationDialog';
import PageHeader from '@/components/common/PageHeader';
import SalesOrderPrintDialog from './components/SalesOrderPrintDialog';
import PaymentDialog from '@/components/common/PaymentDialog';
import RefundDialog, { type RefundSeed } from '@/components/common/RefundDialog';
import { getCurrentDate } from '@/utils/formatters';
import { toScaledAmount, fromScaledAmount } from '@/utils/currency';
import { TABLE_STYLES } from '@/constants/tableStyles';
import { useNotification } from '@/hooks/useNotification';
import { useGetActivePaymentMethodsQuery } from '@/store/api/paymentMethodsApi';
import {
  useCancelSalesOrderMutation,
  useDuplicateSalesOrderMutation,
  useFulfillSalesOrderMutation,
  useGetSalesOrderByNumberQuery,
  useRecordOrderPaymentsMutation,
  useRecordOrderRefundsMutation,
  useGetSalesOrderPaymentsQuery,
  useUncancelSalesOrderMutation,
  useUnfulfillSalesOrderMutation,
} from '@/store/api/salesApi';

import OrderActionBar from './components/OrderActionBar';
import OrderOverviewTab from './components/OrderOverviewTab';
import OrderPaymentsTab from './components/OrderPaymentsTab';
import { StatusChip } from '@/components/common/StatusChip';
import { getStockOffenders } from '@/utils/stockStatus';

type Dialog = 'pay' | 'refund' | 'print' | 'fulfill' | 'unfulfill' | 'cancel' | 'uncancel' | null;

interface TabPanelProps {
  children?: ReactNode;
  index: number;
  value: number;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const data = (error as { data?: { message?: string } }).data;
    return data?.message ?? fallback;
  }

  return fallback;
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
      {value === index && <Box sx={{ p: TABLE_STYLES.cell.padding.px, flex: 1 }}>{children}</Box>}
    </Box>
  );
}

export default function SalesOrderDetailPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabValue = Math.min(Math.max(Number(searchParams.get('tab') ?? 0), 0), 1);
  const [activeDialog, setActiveDialog] = useState<Dialog>(null);
  const { showSuccess, showError } = useNotification();

  const {
    data: order,
    isLoading,
    isError,
  } = useGetSalesOrderByNumberQuery(orderNumber ?? skipToken);

  useEffect(() => {
    if (order?.orderNumber) {
      navigate(`/sales/orders/${order.orderNumber}/view`, {
        replace: true,
        state: { breadcrumbTitle: order.orderNumber },
      });
    }
  }, [order?.orderNumber, navigate]);

  const [fulfillOrder, { isLoading: isFulfilling }] = useFulfillSalesOrderMutation();
  const [unfulfillOrder, { isLoading: isUnfulfilling }] = useUnfulfillSalesOrderMutation();
  const [cancelOrder, { isLoading: isCancelling }] = useCancelSalesOrderMutation();
  const [uncancelOrder, { isLoading: isUncancelling }] = useUncancelSalesOrderMutation();
  const [duplicateOrder] = useDuplicateSalesOrderMutation();
  const [recordPayments] = useRecordOrderPaymentsMutation();
  const [recordRefunds] = useRecordOrderRefundsMutation();

  const { data: paymentMethods = [], isLoading: methodsLoading } =
    useGetActivePaymentMethodsQuery(undefined, {
      skip: activeDialog !== 'pay' && activeDialog !== 'refund',
    });

  // Fetch payments for refund dialog only when needed
  // isFetching gates the refund dialog's one-shot seeding: methods are cached
  // and resolve first, so seeding before payments arrive locks in a blank line.
  const { data: paymentRecords = [], isFetching: paymentsFetching } =
    useGetSalesOrderPaymentsQuery(activeDialog === 'refund' && order ? order.id : skipToken)

  // Per-method NET capacity for the refund preset: gross payments minus prior
  // refunds through the same method (refunds are negative rows on the same
  // paymentMethodId). Sum ALL signed rows first, then emit only methods with a
  // positive balance — a cross-method refund can drive one negative, which is
  // not a valid preset line (#1107).
  const netByMethod = (paymentRecords ?? []).reduce<Record<string, bigint>>((acc, p: any) => {
    acc[p.paymentMethodId] = (acc[p.paymentMethodId] ?? 0n) + (toScaledAmount(p.amount) ?? 0n)
    return acc
  }, {})
  const seedAllocations: RefundSeed[] = Object.entries(netByMethod)
    .filter(([, amount]) => amount > 0n)
    .map(([methodId, amount]) => ({ methodId, amount: fromScaledAmount(amount) }))

  const netPaidMinor = (paymentRecords ?? []).reduce(
    (s, p: any) => s + (toScaledAmount(p.amount) ?? 0n), 0n,
  )
  const availableForRefund = fromScaledAmount(netPaidMinor > 0n ? netPaidMinor : 0n)
  const surplusMinor = netPaidMinor - (toScaledAmount(order?.totalAmount ?? '0') ?? 0n)
  const seedTarget = fromScaledAmount(
    surplusMinor > 0n ? surplusMinor : netPaidMinor > 0n ? netPaidMinor : 0n,
  )

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <CircularProgress />
      </Box>
    );
  }

  if (isError || !order) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}>
        <Typography color="text.secondary">Order not found.</Typography>
      </Box>
    );
  }

  // Overpaid is treated like PARTIAL: NOT fulfillable (mirrors backend, which
  // excludes OVERPAID from the paid-in-full band so it never reaches READY).
  const isReadyState =
    order.paymentStatus !== 'OVERPAID' &&
    (order.status === 'READY' ||
      (order.status === 'DRAFT' && order.paymentStatus === 'PAID'));
  const stockOffenders = getStockOffenders(
    (order.items ?? []).map((item) => ({
      product: item.product,
      quantity: Number(item.quantity ?? 0),
    })),
  );

  const handleFulfillConfirm = async () => {
    try {
      await fulfillOrder(order.id).unwrap();
      showSuccess(`Order ${order.orderNumber} fulfilled`);
      setActiveDialog(null);
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to fulfill order'));
    }
  };

  const handleUnfulfillConfirm = async () => {
    try {
      await unfulfillOrder(order.id).unwrap();
      showSuccess(`Order ${order.orderNumber} reverted to draft`);
      setActiveDialog(null);
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to unfulfill order'));
    }
  };

  const handleCancelConfirm = async () => {
    try {
      await cancelOrder({ id: order.id }).unwrap();
      showSuccess(`Order ${order.orderNumber} cancelled`);
      setActiveDialog(null);
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to cancel order'));
    }
  };

  const handleUncancelConfirm = async () => {
    try {
      await uncancelOrder(order.id).unwrap();
      showSuccess(`Order ${order.orderNumber} restored to draft`);
      setActiveDialog(null);
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to uncancel order'));
    }
  };

  const handleDuplicate = async () => {
    try {
      const newOrder = await duplicateOrder(order.id).unwrap();
      showSuccess(`Order duplicated as ${newOrder.orderNumber}`);
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to duplicate order'));
    }
  };

  const handleSubmitPayment = async (
    payments: {
      paymentMethodId: string;
      amount: string;
      paymentDate: string;
      reference?: string;
    }[],
  ) => {
    try {
      await recordPayments({ id: order.id, payments }).unwrap();
      showSuccess(`Payment recorded for ${order.orderNumber}`);
      setActiveDialog(null);
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to record payment'));
      throw error;
    }
  };

  const handleSubmitRefund = async (
    lines: { paymentMethodId: string; amount: string; reference?: string }[],
  ) => {
    try {
      await recordRefunds({
        id: order.id,
        refunds: lines.map((l) => ({
          paymentMethodId: l.paymentMethodId,
          amount: l.amount,
          paymentDate: getCurrentDate(),
          reference: l.reference,
        })),
      }).unwrap();
      showSuccess(`Refund recorded for ${order.orderNumber}`);
      setActiveDialog(null);
    } catch (error) {
      showError(getErrorMessage(error, 'Failed to record refund'));
      throw error;
    }
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
      <PageHeader
        title={order.orderNumber}
        titleBadge={
          <Box sx={{ display: 'flex', gap: 1 }}>
            <StatusChip status={order.status} />
            <StatusChip status={order.paymentStatus} />
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

      {isReadyState && stockOffenders.length > 0 && (
        <Alert severity="error" sx={{ mx: 3, mb: 1.5 }}>
          {`Cannot fulfill — ${stockOffenders.length} item(s) out of stock: `}
          {stockOffenders.map((o) => o.name).join(', ')}
        </Alert>
      )}

      <Box sx={{ borderBottom: 1, borderColor: 'divider' }}>
        <Tabs
          value={tabValue}
          onChange={(_, value: number) =>
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev)
                next.set('tab', String(value))
                return next
              },
              { replace: true },
            )}
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
          </Tabs>
      </Box>

      <TabPanel value={tabValue} index={0}>
        <OrderOverviewTab order={order} />
      </TabPanel>
      <TabPanel value={tabValue} index={1}>
        <OrderPaymentsTab orderId={order.id} totalAmount={order.totalAmount} />
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
          documentNumber={order.orderNumber}
          totalAmount={order.totalAmount}
          paidAmount={order.paidAmount}
          paymentMethods={paymentMethods}
          loading={methodsLoading}
        />
      )}

      {activeDialog === 'refund' && (
        <RefundDialog
          methods={paymentMethods.map((m) => ({ id: m.id, label: m.name }))}
          seedAllocations={seedAllocations}
          availableForRefund={availableForRefund}
          seedTarget={seedTarget}
          loading={methodsLoading || paymentsFetching}
          open
          onClose={() => setActiveDialog(null)}
          onSubmit={handleSubmitRefund}
          orderNumber={order.orderNumber}
        />
      )}

      {activeDialog === 'print' && (
        <SalesOrderPrintDialog open onClose={() => setActiveDialog(null)} salesOrder={order} />
      )}
    </Box>
  );
}
