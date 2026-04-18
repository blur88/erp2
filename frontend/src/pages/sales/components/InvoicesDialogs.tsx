import React from 'react'

import type { InvoiceListItem } from '../hooks/useInvoicesWorkspace'

import DeletedInvoicesDialog from '@/components/sales/DeletedInvoicesDialog'
import { InvoicePrint } from '@/components/print'

interface InvoicesDialogsProps {
  deletedInvoicesDialogOpen: boolean
  printDialogOpen: boolean
  selectedInvoice: InvoiceListItem | null
  onCloseDeletedInvoicesDialog: () => void
  onClosePrintDialog: () => void
}

const InvoicesDialogs: React.FC<InvoicesDialogsProps> = ({
  deletedInvoicesDialogOpen,
  printDialogOpen,
  selectedInvoice,
  onCloseDeletedInvoicesDialog,
  onClosePrintDialog,
}) => {
  return (
    <>
      <DeletedInvoicesDialog open={deletedInvoicesDialogOpen} onClose={onCloseDeletedInvoicesDialog} />

      {selectedInvoice && (
        <InvoicePrint open={printDialogOpen} onClose={onClosePrintDialog} invoice={selectedInvoice as any} />
      )}
    </>
  )
}

export default InvoicesDialogs
