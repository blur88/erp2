import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { BankReconciliation } from '@/types'

interface Props {
  completeTarget: BankReconciliation | null
  reopenTarget: BankReconciliation | null
  deleteTarget: BankReconciliation | null
  actionLoading: boolean
  onConfirmComplete: () => void
  onConfirmReopen: () => void
  onConfirmDelete: () => void
  onCancelComplete: () => void
  onCancelReopen: () => void
  onCancelDelete: () => void
}

export function BankReconciliationsDialogs({
  completeTarget,
  reopenTarget,
  deleteTarget,
  actionLoading,
  onConfirmComplete,
  onConfirmReopen,
  onConfirmDelete,
  onCancelComplete,
  onCancelReopen,
  onCancelDelete,
}: Props) {
  return (
    <>
      <ConfirmationDialog open={!!completeTarget} title="Complete Reconciliation" message="Mark this reconciliation as complete?" confirmText="Complete" cancelText="Cancel" onConfirm={onConfirmComplete} onCancel={onCancelComplete} loading={actionLoading} />
      <ConfirmationDialog open={!!reopenTarget} title="Reopen Reconciliation" message="Reopen this reconciliation for editing?" confirmText="Reopen" cancelText="Cancel" onConfirm={onConfirmReopen} onCancel={onCancelReopen} loading={actionLoading} />
      <ConfirmationDialog open={!!deleteTarget} title="Delete Reconciliation" message="Delete this reconciliation? This cannot be undone." confirmText="Delete" cancelText="Cancel" onConfirm={onConfirmDelete} onCancel={onCancelDelete} loading={actionLoading} />
    </>
  )
}
