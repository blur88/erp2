import React from 'react'

import DeletedGRNsDialog from '@/components/purchasing/DeletedGRNsDialog'
import { GRNPrint } from '@/components/print'
import type { GoodsReceivedNote } from '@/types'

interface GRNDialogsProps {
  selectedGRN: GoodsReceivedNote | null
  deletedGRNsOpen: boolean
  onCloseDeletedGRNs: () => void
  printDialogOpen: boolean
  onClosePrintDialog: () => void
}

const GRNDialogs: React.FC<GRNDialogsProps> = ({
  selectedGRN,
  deletedGRNsOpen,
  onCloseDeletedGRNs,
  printDialogOpen,
  onClosePrintDialog,
}) => {
  return (
    <>
      <DeletedGRNsDialog
        open={deletedGRNsOpen}
        onClose={onCloseDeletedGRNs}
      />

      {selectedGRN && (
        <GRNPrint
          open={printDialogOpen}
          onClose={onClosePrintDialog}
          grn={selectedGRN}
        />
      )}
    </>
  )
}

export default GRNDialogs
