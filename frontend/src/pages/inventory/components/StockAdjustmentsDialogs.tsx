import React from 'react'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'

interface StockAdjustmentsDialogsProps {
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
      <ConfirmationDialog
        open={completeConfirmOpen}
        title="Complete Stock Adjustment?"
        message={`Apply stock changes for ${adjustmentToCompleteName}?`}
        confirmText="Complete"
        cancelText="Cancel"
        onConfirm={onConfirmComplete}
        onCancel={onCancelComplete}
      />

      <ConfirmationDialog
        open={revertConfirmOpen}
        title="Revert Stock Adjustment?"
        message={`Open a new adjustment with opposite quantities to reverse ${adjustmentToRevertName}?`}
        confirmText="Revert"
        cancelText="Cancel"
        onConfirm={onConfirmRevert}
        onCancel={onCancelRevert}
      />
    </>
  )
}

export default StockAdjustmentsDialogs
