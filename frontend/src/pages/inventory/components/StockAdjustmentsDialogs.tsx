import React from 'react'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import DeletedStockAdjustmentsDialog from '@/components/inventory/DeletedStockAdjustmentsDialog'

interface StockAdjustmentsDialogsProps {
  showDeletedDialog: boolean
  onCloseDeletedDialog: () => void
  deleteConfirmOpen: boolean
  adjustmentToDeleteName: string
  onConfirmDelete: () => void
  onCancelDelete: () => void
  completeConfirmOpen: boolean
  adjustmentToCompleteName: string
  onConfirmComplete: () => void
  onCancelComplete: () => void
  revertConfirmOpen: boolean
  adjustmentToRevertName: string
  onConfirmRevert: () => void
  onCancelRevert: () => void
}

const StockAdjustmentsDialogs: React.FC<StockAdjustmentsDialogsProps> = ({
  showDeletedDialog,
  onCloseDeletedDialog,
  deleteConfirmOpen,
  adjustmentToDeleteName,
  onConfirmDelete,
  onCancelDelete,
  completeConfirmOpen,
  adjustmentToCompleteName,
  onConfirmComplete,
  onCancelComplete,
  revertConfirmOpen,
  adjustmentToRevertName,
  onConfirmRevert,
  onCancelRevert,
}) => {
  return (
    <>
      <DeletedStockAdjustmentsDialog
        open={showDeletedDialog}
        onClose={onCloseDeletedDialog}
      />

      <ConfirmationDialog
        open={deleteConfirmOpen}
        title="Confirm Delete"
        message={`Are you sure you want to delete stock adjustment #${adjustmentToDeleteName}? This will move it to deleted stock adjustments.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        severity="warning"
      />

      <ConfirmationDialog
        open={completeConfirmOpen}
        title="Confirm Complete"
        message={`Are you sure you want to complete stock adjustment #${adjustmentToCompleteName}? This will post the stock movements and update inventory levels. The adjustment can be reverted to draft if needed.`}
        confirmText="Complete"
        cancelText="Cancel"
        onConfirm={onConfirmComplete}
        onCancel={onCancelComplete}
        severity="info"
      />

      <ConfirmationDialog
        open={revertConfirmOpen}
        title="Revert to Draft"
        message={`Are you sure you want to revert stock adjustment #${adjustmentToRevertName} back to draft? This will reverse the stock movements and return inventory levels to their previous state.`}
        confirmText="Revert to Draft"
        cancelText="Go Back"
        onConfirm={onConfirmRevert}
        onCancel={onCancelRevert}
        severity="warning"
      />
    </>
  )
}

export default StockAdjustmentsDialogs
