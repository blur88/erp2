import { skipToken } from '@reduxjs/toolkit/query'
import PaymentDialog, { type PaymentLineInput } from '@/components/common/PaymentDialog'
import RefundDialog, { type RefundSeed } from '@/components/common/RefundDialog'
import SalesOrderPrintDialog from './SalesOrderPrintDialog'
import { useGetSalesOrderPaymentsQuery } from '@/store/api/salesApi'
import { useGetActivePaymentMethodsQuery } from '@/store/api/paymentMethodsApi'
import { getCurrentDate } from '@/utils/formatters'
import { toScaledAmount, fromScaledAmount } from '@/utils/currency'
import type { SalesOrder } from '@/types'

interface SalesOrdersDialogsProps {
  printOrder: SalesOrder | null
  onClosePrint: () => void
  paymentOrder: SalesOrder | null
  onClosePayment: () => void
  onSubmitPayment: (payments: PaymentLineInput[]) => Promise<void>
  refundOrder: SalesOrder | null
  onCloseRefund: () => void
  onSubmitRefund: (
    refunds: { paymentMethodId: string; amount: string; paymentDate: string; reference?: string }[],
  ) => Promise<void>
}

export default function SalesOrdersDialogs({
  printOrder,
  onClosePrint,
  paymentOrder,
  onClosePayment,
  onSubmitPayment,
  refundOrder,
  onCloseRefund,
  onSubmitRefund,
}: SalesOrdersDialogsProps) {
  // Fetch payments for refund dialog only when needed
  // currentData, not data: switching between list rows would otherwise briefly
  // expose the previous order's cached payments. isFetching gates the dialog's
  // one-shot seeding until this document's records actually arrive.
  const { currentData: paymentRecords = [], isFetching: paymentsFetching } =
    useGetSalesOrderPaymentsQuery(refundOrder ? refundOrder.id : skipToken)

  const { data: paymentMethods = [], isLoading: methodsLoading } =
    useGetActivePaymentMethodsQuery(undefined, { skip: !paymentOrder && !refundOrder })

  // Gross payments by method: seed weights only. Prior refunds reduce the
  // aggregate cap, never a per-method weight (#1096).
  const grossByMethod = (paymentRecords ?? []).reduce<Record<string, { gross: bigint; label: string }>>(
    (acc, p: any) => {
      const amt = toScaledAmount(p.amount) ?? 0n
      if (amt <= 0n) return acc
      const entry = (acc[p.paymentMethodId] ??= { gross: 0n, label: p.paymentMethod?.name ?? 'Payment' })
      entry.gross += amt
      return acc
    },
    {},
  )
  const seedAllocations: RefundSeed[] = Object.entries(grossByMethod).map(([methodId, v]) => ({
    methodId,
    amount: fromScaledAmount(v.gross),
  }))

  const netPaidMinor = (paymentRecords ?? []).reduce(
    (s, p: any) => s + (toScaledAmount(p.amount) ?? 0n), 0n,
  )
  const availableForRefund = fromScaledAmount(netPaidMinor > 0n ? netPaidMinor : 0n)
  const surplusMinor = netPaidMinor - (toScaledAmount(refundOrder?.totalAmount ?? '0') ?? 0n)
  const seedTarget = fromScaledAmount(
    surplusMinor > 0n ? surplusMinor : netPaidMinor > 0n ? netPaidMinor : 0n,
  )

  const handleRefundSubmit = async (
    lines: { paymentMethodId: string; amount: string; reference?: string }[],
  ) => {
    await onSubmitRefund(
      lines.map((l) => ({
        paymentMethodId: l.paymentMethodId,
        amount: l.amount,
        paymentDate: getCurrentDate(),
        reference: l.reference,
      })),
    )
  }

  return (
    <>
      {printOrder && <SalesOrderPrintDialog open onClose={onClosePrint} salesOrder={printOrder} />}
      {paymentOrder && (
        <PaymentDialog
          open
          onClose={onClosePayment}
          onSubmit={onSubmitPayment}
          documentNumber={paymentOrder.orderNumber}
          totalAmount={paymentOrder.totalAmount}
          paidAmount={paymentOrder.paidAmount}
          paymentMethods={paymentMethods}
          loading={methodsLoading}
        />
      )}
      {refundOrder && (
        <RefundDialog
          methods={paymentMethods.map((m) => ({ id: m.id, label: m.name }))}
          seedAllocations={seedAllocations}
          availableForRefund={availableForRefund}
          seedTarget={seedTarget}
          loading={methodsLoading || paymentsFetching}
          open
          onClose={onCloseRefund}
          onSubmit={handleRefundSubmit}
          orderNumber={refundOrder.orderNumber}
        />
      )}
    </>
  )
}
