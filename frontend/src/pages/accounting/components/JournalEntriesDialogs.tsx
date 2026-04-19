import { useState } from 'react'
import { getCurrentDate } from '@/utils/formatters'

import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { JournalEntry } from '@/types'

interface Props {
  postTarget: JournalEntry | null
  deleteTarget: JournalEntry | null
  reverseTarget: JournalEntry | null
  bulkPostIds: Set<string>
  bulkDeleteIds: Set<string>
  actionLoading: boolean
  onConfirmPost: () => void
  onConfirmDelete: () => void
  onConfirmReverse: (reverseDate: string) => void
  onConfirmBulkPost: () => void
  onConfirmBulkDelete: () => void
  onCancelPost: () => void
  onCancelDelete: () => void
  onCancelReverse: () => void
  onCancelBulkPost: () => void
  onCancelBulkDelete: () => void
}

export function JournalEntriesDialogs({
  postTarget,
  deleteTarget,
  reverseTarget,
  bulkPostIds,
  bulkDeleteIds,
  actionLoading,
  onConfirmPost,
  onConfirmDelete,
  onConfirmReverse,
  onConfirmBulkPost,
  onConfirmBulkDelete,
  onCancelPost,
  onCancelDelete,
  onCancelReverse,
  onCancelBulkPost,
  onCancelBulkDelete,
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
      >
      </ConfirmationDialog>
      <ConfirmationDialog
        open={bulkPostIds.size > 0}
        title="Bulk Post Entries"
        message={`Post ${bulkPostIds.size} selected journal entries?`}
        confirmText="Post"
        cancelText="Cancel"
        onConfirm={onConfirmBulkPost}
        onCancel={onCancelBulkPost}
        loading={actionLoading}
      />
      <ConfirmationDialog
        open={bulkDeleteIds.size > 0}
        title="Bulk Delete Entries"
        message={`Delete ${bulkDeleteIds.size} selected journal entries?`}
        confirmText="Delete"
        cancelText="Cancel"
        onConfirm={onConfirmBulkDelete}
        onCancel={onCancelBulkDelete}
        loading={actionLoading}
      />
    </>
  )
}
