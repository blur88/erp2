import PaymentDialog from '@/components/sales/PaymentDialog'
import RefundDialog from '@/components/sales/RefundDialog'
import { SalesOrderPrint } from '@/components/print'
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
  return (
    <>
      {printOrder && (
        <SalesOrderPrint open onClose={onClosePrint} salesOrder={printOrder} />
      )}
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
          onSubmit={onSubmitRefund}
          orderId={refundOrder.id}
          orderNumber={refundOrder.orderNumber}
        />
      )}
    </>
  )
}
