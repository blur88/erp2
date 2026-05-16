import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { ExpenseRecord } from '@/types'

interface Props {
  postTarget: ExpenseRecord | null
  deleteTarget: ExpenseRecord | null
  unpostTarget: ExpenseRecord | null
  restoreTarget: ExpenseRecord | null
  actionLoading: boolean
  onConfirmPost: () => void
  onConfirmDelete: () => void
  onConfirmUnpost: () => void
  onConfirmRestore: () => void
  onCancelPost: () => void
  onCancelDelete: () => void
  onCancelUnpost: () => void
  onCancelRestore: () => void
}

export function ExpensesDialogs({
  postTarget,
  deleteTarget,
  unpostTarget,
  restoreTarget,
  actionLoading,
  onConfirmPost,
  onConfirmDelete,
  onConfirmUnpost,
  onConfirmRestore,
  onCancelPost,
  onCancelDelete,
  onCancelUnpost,
  onCancelRestore,
}: Props) {
  return (
    <>
      <ConfirmationDialog open={!!postTarget} title="Post Expense" message={`Post expense ${postTarget?.referenceNumber}? This will create a journal entry.`} confirmText="Post" cancelText="Cancel" onConfirm={onConfirmPost} onCancel={onCancelPost} loading={actionLoading} />
      <ConfirmationDialog open={!!deleteTarget} title="Delete Expense" message={`Delete expense ${deleteTarget?.referenceNumber}?`} confirmText="Delete" cancelText="Cancel" onConfirm={onConfirmDelete} onCancel={onCancelDelete} loading={actionLoading} />
      <ConfirmationDialog open={!!unpostTarget} title="Unpost Expense" message={`Unpost expense ${unpostTarget?.referenceNumber}? This will reverse the journal entry. The expense cannot be re-posted.`} confirmText="Unpost" cancelText="Cancel" onConfirm={onConfirmUnpost} onCancel={onCancelUnpost} loading={actionLoading} />
      <ConfirmationDialog open={!!restoreTarget} title="Restore Expense" message={`Restore deleted expense ${restoreTarget?.referenceNumber}?`} confirmText="Restore" cancelText="Cancel" onConfirm={onConfirmRestore} onCancel={onCancelRestore} loading={actionLoading} />
    </>
  )
}
