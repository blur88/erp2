import { skipToken } from '@reduxjs/toolkit/query'
import PaymentDialog from '@/components/sales/PaymentDialog'
import RefundDialog, { type RefundSource } from '@/components/common/RefundDialog'
import SalesOrderPrintDialog from './SalesOrderPrintDialog'
import { useGetSalesOrderPaymentsQuery } from '@/store/api/salesApi'
import { getCurrentDate } from '@/utils/formatters'
import type { SalesOrder } from '@/types'

interface SalesOrdersDialogsProps {
  printOrder: SalesOrder | null
  onClosePrint: () => void
  paymentOrder: SalesOrder | null
  onClosePayment: () => void
  onSubmitPayment: (
    payments: { paymentMethodId: string; amount: number; reference?: string }[],
  ) => Promise<void>
  refundOrder: SalesOrder | null
  onCloseRefund: () => void
  onSubmitRefund: (
    refunds: { paymentMethodId: string; amount: number; paymentDate: string; reference?: string }[],
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
    Record<string, { paid: number; refunded: number; label: string }>
  >((acc, p: any) => {
    const key = p.paymentMethodId
    const entry = (acc[key] ??= { paid: 0, refunded: 0, label: p.paymentMethod?.name ?? 'Payment' })
    const amt = Number(p.amount)
    if (amt >= 0) entry.paid += amt
    else entry.refunded += Math.abs(amt)
    return acc
  }, {})
  const refundSources: RefundSource[] = Object.entries(netByMethod).map(([id, v]) => ({
    id,
    label: v.label,
    paidAmount: v.paid,
    alreadyRefunded: v.refunded,
  }))

  const handleRefundSubmit = async (
    lines: { sourceId: string; amount: number; reference?: string }[],
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
