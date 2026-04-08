import React from 'react'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import DeletedSuppliersDialog from '@/components/purchasing/DeletedSuppliersDialog'
import type { Supplier } from '@/types'

interface SuppliersDialogsProps {
  selectedSupplier: Supplier | null
  deleteConfirmOpen: boolean
  onConfirmDelete: () => Promise<void> | void
  onCancelDelete: () => void
  deletedSuppliersDialogOpen: boolean
  onCloseDeletedSuppliersDialog: () => void
}

const SuppliersDialogs: React.FC<SuppliersDialogsProps> = ({
  selectedSupplier,
  deleteConfirmOpen,
  onConfirmDelete,
  onCancelDelete,
  deletedSuppliersDialogOpen,
  onCloseDeletedSuppliersDialog,
}) => {
  return (
    <>
      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete "${selectedSupplier?.companyName}"? This will move it to deleted items.`}
        confirmText="Delete Supplier"
        cancelText="Cancel"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        severity="warning"
      />

      <DeletedSuppliersDialog
        open={deletedSuppliersDialogOpen}
        onClose={onCloseDeletedSuppliersDialog}
      />
    </>
  )
}

export default SuppliersDialogs
