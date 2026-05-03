import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { ExpenseRecord } from '@/types'

interface Props {
  postTarget: ExpenseRecord | null
  deleteTarget: ExpenseRecord | null
  actionLoading: boolean
  onConfirmPost: () => void
  onConfirmDelete: () => void
  onCancelPost: () => void
  onCancelDelete: () => void
}

export function ExpensesDialogs({
  postTarget,
  deleteTarget,
  actionLoading,
  onConfirmPost,
  onConfirmDelete,
  onCancelPost,
  onCancelDelete,
}: Props) {
  return (
    <>
      <ConfirmationDialog open={!!postTarget} title="Post Expense" message={`Post expense ${postTarget?.referenceNumber}?`} confirmText="Post" cancelText="Cancel" onConfirm={onConfirmPost} onCancel={onCancelPost} loading={actionLoading} />
      <ConfirmationDialog open={!!deleteTarget} title="Delete Expense" message={`Delete expense ${deleteTarget?.referenceNumber}?`} confirmText="Delete" cancelText="Cancel" onConfirm={onConfirmDelete} onCancel={onCancelDelete} loading={actionLoading} />
    </>
  )
}
