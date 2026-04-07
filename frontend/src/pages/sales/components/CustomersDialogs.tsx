import React from 'react'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import DeletedCustomersDialog from '@/components/sales/DeletedCustomersDialog'
import type { Customer } from '@/types'

interface CustomersDialogsProps {
  selectedCustomer: Customer | null
  deleteConfirmOpen: boolean
  onConfirmDelete: () => Promise<void> | void
  onCancelDelete: () => void
  deletedCustomersDialogOpen: boolean
  onCloseDeletedCustomersDialog: () => void
}

const CustomersDialogs: React.FC<CustomersDialogsProps> = ({
  selectedCustomer,
  deleteConfirmOpen,
  onConfirmDelete,
  onCancelDelete,
  deletedCustomersDialogOpen,
  onCloseDeletedCustomersDialog,
}) => {
  return (
    <>
      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete "${selectedCustomer?.name}"? This will move it to deleted items.`}
        confirmText="Delete Customer"
        cancelText="Cancel"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        severity="warning"
      />

      <DeletedCustomersDialog
        open={deletedCustomersDialogOpen}
        onClose={onCloseDeletedCustomersDialog}
      />
    </>
  )
}

export default CustomersDialogs
