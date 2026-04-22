import { useState } from 'react'
import { getCurrentDate } from '@/utils/formatters'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { JournalEntry } from '@/types'

interface Props {
  postTarget: JournalEntry | null
  deleteTarget: JournalEntry | null
  reverseTarget: JournalEntry | null
  actionLoading: boolean
  onConfirmPost: () => void
  onConfirmDelete: () => void
  onConfirmReverse: (reverseDate: string) => void
  onCancelPost: () => void
  onCancelDelete: () => void
  onCancelReverse: () => void
}

export function JournalEntriesDialogs({
  postTarget,
  deleteTarget,
  reverseTarget,
  actionLoading,
  onConfirmPost,
  onConfirmDelete,
  onConfirmReverse,
  onCancelPost,
  onCancelDelete,
  onCancelReverse,
}: Props) {
  const [reverseDate] = useState(getCurrentDate())

  return (
    <>
      <ConfirmationDialog
        open={!!postTarget}
        title="Post Journal Entry"
        message={`Post journal entry ${postTarget?.referenceNumber}? This cannot be undone.`}
        confirmText="Post"
        cancelText="Cancel"
        onConfirm={onConfirmPost}
        onCancel={onCancelPost}
        loading={actionLoading}
      />
      <ConfirmationDialog
        open={!!deleteTarget}
        title="Delete Journal Entry"
        message={`Delete journal entry ${deleteTarget?.referenceNumber}? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        loading={actionLoading}
      />
      <ConfirmationDialog
        open={!!reverseTarget}
        title="Reverse Journal Entry"
        message={`Reverse journal entry ${reverseTarget?.referenceNumber}? A new reversing entry will be created.`}
        confirmText="Reverse"
        cancelText="Cancel"
        onConfirm={() => onConfirmReverse(reverseDate)}
        onCancel={onCancelReverse}
        loading={actionLoading}
      />
    </>
  )
}
