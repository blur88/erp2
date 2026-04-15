import React from 'react'

import type { PaymentListItem } from '../hooks/paymentsPageState'

import { PaymentReceiptPrint } from '@/components/print'
import DeletedPaymentsDialog from '@/components/sales/DeletedPaymentsDialog'

interface PaymentsDialogsProps {
  deletedPaymentsDialogOpen: boolean
  printDialogOpen: boolean
  selectedPayment: PaymentListItem | null
  onCloseDeletedPaymentsDialog: () => void
  onClosePrintDialog: () => void
}

const PaymentsDialogs: React.FC<PaymentsDialogsProps> = ({
  deletedPaymentsDialogOpen,
  printDialogOpen,
  selectedPayment,
  onCloseDeletedPaymentsDialog,
  onClosePrintDialog,
}) => {
  return (
    <>
      <DeletedPaymentsDialog open={deletedPaymentsDialogOpen} onClose={onCloseDeletedPaymentsDialog} />
      {selectedPayment && (
        <PaymentReceiptPrint
          open={printDialogOpen}
          onClose={onClosePrintDialog}
          payment={selectedPayment as any}
        />
      )}
    </>
  )
}

export default PaymentsDialogs
