import React from 'react'

import DeletedVendorPaymentsDialog from '@/components/purchasing/DeletedVendorPaymentsDialog'
import { VendorPaymentPrint } from '@/components/print'
import type { VendorPayment } from '@/types'

interface VendorPaymentsDialogsProps {
  selectedPayment: VendorPayment | null
  deletedPaymentsOpen: boolean
  onCloseDeletedPayments: () => void
  printDialogOpen: boolean
  onClosePrintDialog: () => void
}

const VendorPaymentsDialogs: React.FC<VendorPaymentsDialogsProps> = ({
  selectedPayment,
  deletedPaymentsOpen,
  onCloseDeletedPayments,
  printDialogOpen,
  onClosePrintDialog,
}) => {
  return (
    <>
      <DeletedVendorPaymentsDialog
        open={deletedPaymentsOpen}
        onClose={onCloseDeletedPayments}
      />

      {selectedPayment && (
        <VendorPaymentPrint
          open={printDialogOpen}
          onClose={onClosePrintDialog}
          payment={selectedPayment}
        />
      )}
    </>
  )
}

export default VendorPaymentsDialogs
