import React from 'react'
import { Button, Dialog, DialogActions, DialogContent, DialogTitle, Typography } from '@mui/material'

import type { InvoiceListItem } from '../hooks/useInvoicesWorkspace'

import DeletedInvoicesDialog from '@/components/sales/DeletedInvoicesDialog'
import { InvoicePrint } from '@/components/print'

interface InvoicesDialogsProps {
  createDialog: boolean
  editDialog: boolean
  deletedInvoicesDialogOpen: boolean
  printDialogOpen: boolean
  selectedInvoice: InvoiceListItem | null
  onCloseCreateDialog: () => void
  onCloseEditDialog: () => void
  onCloseDeletedInvoicesDialog: () => void
  onClosePrintDialog: () => void
}

const InvoicesDialogs: React.FC<InvoicesDialogsProps> = ({
  createDialog,
  editDialog,
  deletedInvoicesDialogOpen,
  printDialogOpen,
  selectedInvoice,
  onCloseCreateDialog,
  onCloseEditDialog,
  onCloseDeletedInvoicesDialog,
  onClosePrintDialog,
}) => {
  return (
    <>
      {/* Placeholder dialogs extracted with the page structure only; no functional wiring yet. */}
      <Dialog open={createDialog} onClose={onCloseCreateDialog} maxWidth="md" fullWidth>
        <DialogTitle>Create New Invoice</DialogTitle>
        <DialogContent>
          <Typography>Invoice creation form will be implemented here.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCloseCreateDialog}>Cancel</Button>
          <Button variant="contained">Create</Button>
        </DialogActions>
      </Dialog>

      {/* Placeholder dialogs extracted with the page structure only; no functional wiring yet. */}
      <Dialog open={editDialog} onClose={onCloseEditDialog} maxWidth="md" fullWidth>
        <DialogTitle>Edit Invoice</DialogTitle>
        <DialogContent>
          <Typography>Invoice editing form will be implemented here.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={onCloseEditDialog}>Cancel</Button>
          <Button variant="contained">Save Changes</Button>
        </DialogActions>
      </Dialog>

      <DeletedInvoicesDialog open={deletedInvoicesDialogOpen} onClose={onCloseDeletedInvoicesDialog} />

      {selectedInvoice && (
        <InvoicePrint open={printDialogOpen} onClose={onClosePrintDialog} invoice={selectedInvoice as any} />
      )}
    </>
  )
}

export default InvoicesDialogs
