import { skipToken } from '@reduxjs/toolkit/query'
import PaymentDialog from '@/components/sales/PaymentDialog'
import RefundDialog, { type RefundSource } from '@/components/common/RefundDialog'
import SalesOrderPrintDialog from './SalesOrderPrintDialog'
import { useGetSalesOrderPaymentsQuery } from '@/store/api/salesApi'
import { getCurrentDate } from '@/utils/formatters'
import { toScaledAmount, fromScaledAmount } from '@/utils/currency'
import type { SalesOrder } from '@/types'

interface SalesOrdersDialogsProps {
  printOrder: SalesOrder | null
  onClosePrint: () => void
  paymentOrder: SalesOrder | null
  onClosePayment: () => void
  onSubmitPayment: (
    payments: { paymentMethodId: string; amount: string; reference?: string }[],
  ) => Promise<void>
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
  const { data: paymentRecords = [] } = useGetSalesOrderPaymentsQuery(
    refundOrder ? refundOrder.id : skipToken,
  )

  // Build RefundSource[] from SO payments (net by payment method)
  const netByMethod = (paymentRecords ?? []).reduce<
    Record<string, { paid: bigint; refunded: bigint; label: string }>
  >((acc, p: any) => {
    const key = p.paymentMethodId
    const entry = (acc[key] ??= { paid: 0n, refunded: 0n, label: p.paymentMethod?.name ?? 'Payment' })
    const amt = toScaledAmount(p.amount) ?? 0n
    if (amt >= 0n) entry.paid += amt
    else entry.refunded += -amt
    return acc
  }, {})
  const refundSources: RefundSource[] = Object.entries(netByMethod).map(([id, v]) => ({
    id,
    label: v.label,
    paidAmount: fromScaledAmount(v.paid),
    alreadyRefunded: fromScaledAmount(v.refunded),
  }))

  const handleRefundSubmit = async (
    lines: { sourceId: string; amount: string; reference?: string }[],
  ) => {
    await onSubmitRefund(
      lines.map((l) => ({
        paymentMethodId: l.sourceId,
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
          orderId={paymentOrder.id}
          orderNumber={paymentOrder.orderNumber}
          totalAmount={paymentOrder.totalAmount}
        />
      )}
      {refundOrder && (
        <RefundDialog
          open
          onClose={onCloseRefund}
          onSubmit={handleRefundSubmit}
          sources={refundSources}
          orderNumber={refundOrder.orderNumber}
          totalAmount={refundOrder.totalAmount}
        />
      )}
    </>
  )
}
