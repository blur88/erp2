import PaymentDialog from '@/components/sales/PaymentDialog'
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
}

export default function SalesOrdersDialogs({
  printOrder,
  onClosePrint,
  paymentOrder,
  onClosePayment,
  onSubmitPayment,
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
          orderNumber={paymentOrder.orderNumber}
          totalAmount={paymentOrder.totalAmount}
          paidAmount={paymentOrder.paidAmount ?? 0}
        />
      )}
    </>
  )
}
