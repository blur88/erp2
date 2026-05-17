import BlockedBankReconciliationDialog from '@/components/accounting/BlockedBankReconciliationDialog'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import { BankReconciliation } from '@/types'

interface Props {
  completeTarget: BankReconciliation | null
  reopenTarget: BankReconciliation | null
  deleteTarget: BankReconciliation | null
  blockedDeleteTarget: BankReconciliation | null
  actionLoading: boolean
  onConfirmComplete: () => void
  onConfirmReopen: () => void
  onConfirmDelete: () => void
  onCancelComplete: () => void
  onCancelReopen: () => void
  onCancelDelete: () => void
  onCancelBlockedDelete: () => void
  onReopenOnly: () => void
  onReopenAndDelete: () => void
}

export function BankReconciliationsDialogs({
  completeTarget,
  reopenTarget,
  deleteTarget,
  blockedDeleteTarget,
  actionLoading,
  onConfirmComplete,
  onConfirmReopen,
  onConfirmDelete,
  onCancelComplete,
  onCancelReopen,
  onCancelDelete,
  onCancelBlockedDelete,
  onReopenOnly,
  onReopenAndDelete,
}: Props) {
  return (
    <>
      <ConfirmationDialog open={!!completeTarget} title="Complete Reconciliation" message="Mark this reconciliation as complete?" confirmText="Complete" cancelText="Cancel" onConfirm={onConfirmComplete} onCancel={onCancelComplete} loading={actionLoading} />
      <ConfirmationDialog open={!!reopenTarget} title="Reopen Reconciliation" message="Reopen this reconciliation for editing?" confirmText="Reopen" cancelText="Cancel" onConfirm={onConfirmReopen} onCancel={onCancelReopen} loading={actionLoading} />
      <ConfirmationDialog open={!!deleteTarget} title="Delete Reconciliation" message="Delete this reconciliation? This cannot be undone." confirmText="Delete" cancelText="Cancel" onConfirm={onConfirmDelete} onCancel={onCancelDelete} loading={actionLoading} />
      <BlockedBankReconciliationDialog
        open={!!blockedDeleteTarget}
        onClose={onCancelBlockedDelete}
        onReopenOnly={onReopenOnly}
        onReopenAndDelete={onReopenAndDelete}
        loading={actionLoading}
      />
    </>
  )
}
