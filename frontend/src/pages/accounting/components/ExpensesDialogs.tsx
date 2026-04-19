import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { ExpenseRecord } from '@/types'

interface Props {
  postTarget: ExpenseRecord | null
  deleteTarget: ExpenseRecord | null
  bulkPostIds: Set<string>
  bulkDeleteIds: Set<string>
  actionLoading: boolean
  onConfirmPost: () => void
  onConfirmDelete: () => void
  onConfirmBulkPost: () => void
  onConfirmBulkDelete: () => void
  onCancelPost: () => void
  onCancelDelete: () => void
  onCancelBulkPost: () => void
  onCancelBulkDelete: () => void
}

export function ExpensesDialogs({
  postTarget,
  deleteTarget,
  bulkPostIds,
  bulkDeleteIds,
  actionLoading,
  onConfirmPost,
  onConfirmDelete,
  onConfirmBulkPost,
  onConfirmBulkDelete,
  onCancelPost,
  onCancelDelete,
  onCancelBulkPost,
  onCancelBulkDelete,
}: Props) {
  return (
    <>
      <ConfirmationDialog open={!!postTarget} title="Post Expense" message={`Post expense ${postTarget?.referenceNumber}?`} confirmText="Post" cancelText="Cancel" onConfirm={onConfirmPost} onCancel={onCancelPost} loading={actionLoading} />
      <ConfirmationDialog open={!!deleteTarget} title="Delete Expense" message={`Delete expense ${deleteTarget?.referenceNumber}?`} confirmText="Delete" cancelText="Cancel" onConfirm={onConfirmDelete} onCancel={onCancelDelete} loading={actionLoading} />
      <ConfirmationDialog open={bulkPostIds.size > 0} title="Bulk Post" message={`Post ${bulkPostIds.size} selected expenses?`} confirmText="Post" cancelText="Cancel" onConfirm={onConfirmBulkPost} onCancel={onCancelBulkPost} loading={actionLoading} />
      <ConfirmationDialog open={bulkDeleteIds.size > 0} title="Bulk Delete" message={`Delete ${bulkDeleteIds.size} selected expenses?`} confirmText="Delete" cancelText="Cancel" onConfirm={onConfirmBulkDelete} onCancel={onCancelBulkDelete} loading={actionLoading} />
    </>
  )
}
