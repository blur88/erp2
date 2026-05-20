import { Dialog, DialogActions, DialogContent, DialogTitle, TextField } from '@mui/material'

import CreateSettlementDialog from '@/components/accounting/CreateSettlementDialog'
import { AppButton } from '@/components/common/AppButton'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import type { Settlement } from '@/types'

export interface SettlementEditFormState {
  settlementDate: string
  reference: string
  notes: string
}

interface Props {
  dialogOpen: boolean
  onCloseDialog: () => void
  onCreate: (data: { paymentMethodId: string; settlementDate: string; paymentIds: string[]; reference?: string; notes?: string }) => Promise<void> | void
  formOpen: boolean
  editTarget: Settlement | null
  canManage: boolean
  saving: boolean
  editForm: SettlementEditFormState
  onCloseForm: () => void
  onEditFormChange: (field: keyof SettlementEditFormState, value: string) => void
  onSaveEdit: () => void
  postTarget: Settlement | null
  reverseTarget: Settlement | null
  deleteTarget: Settlement | null
  restoreTarget: Settlement | null
  actionLoading: boolean
  onConfirmPost: () => void
  onCancelPost: () => void
  onConfirmReverse: () => void
  onCancelReverse: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onConfirmRestore: () => void
  onCancelRestore: () => void
}

export function SettlementsDialogs({
  dialogOpen,
  onCloseDialog,
  onCreate,
  formOpen,
  editTarget,
  canManage,
  saving,
  editForm,
  onCloseForm,
  onEditFormChange,
  onSaveEdit,
  postTarget,
  reverseTarget,
  deleteTarget,
  restoreTarget,
  actionLoading,
  onConfirmPost,
  onCancelPost,
  onConfirmReverse,
  onCancelReverse,
  onConfirmDelete,
  onCancelDelete,
  onConfirmRestore,
  onCancelRestore,
}: Props) {
  return (
    <>
      <CreateSettlementDialog open={dialogOpen} onClose={onCloseDialog} onCreate={onCreate} />

      <Dialog open={formOpen && canManage && Boolean(editTarget)} onClose={onCloseForm} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Settlement</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Settlement Date *"
            type="date"
            sx={{ mt: 1, mb: 2 }}
            value={editForm.settlementDate}
            onChange={(event) => onEditFormChange('settlementDate', event.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            fullWidth
            label="Reference"
            sx={{ mb: 2 }}
            value={editForm.reference}
            onChange={(event) => onEditFormChange('reference', event.target.value)}
          />
          <TextField
            fullWidth
            label="Notes"
            multiline
            rows={3}
            value={editForm.notes}
            onChange={(event) => onEditFormChange('notes', event.target.value)}
          />
        </DialogContent>
        <DialogActions>
          <AppButton variant="outlined" onClick={onCloseForm}>Cancel</AppButton>
          <AppButton variant="primary" onClick={onSaveEdit} disabled={saving || !editForm.settlementDate}>
            {saving ? 'Saving...' : 'Save Changes'}
          </AppButton>
        </DialogActions>
      </Dialog>

      <ConfirmationDialog
        open={Boolean(postTarget)}
        title="Post Settlement"
        message={`Post settlement ${postTarget?.settlementNumber}? This will create a journal entry and mark reserved payments as settled.`}
        confirmText={actionLoading ? 'Posting...' : 'Post Settlement'}
        cancelText="Cancel"
        onConfirm={onConfirmPost}
        onCancel={onCancelPost}
        loading={actionLoading}
        severity="info"
      />

      <ConfirmationDialog
        open={Boolean(reverseTarget)}
        title="Reverse Settlement"
        message={`Reverse settlement ${reverseTarget?.settlementNumber}? This will reverse its journal entry and return its reserved payments to pending.`}
        confirmText={actionLoading ? 'Reversing...' : 'Reverse Settlement'}
        cancelText="Cancel"
        onConfirm={onConfirmReverse}
        onCancel={onCancelReverse}
        loading={actionLoading}
        severity="error"
      />

      <ConfirmationDialog
        open={Boolean(deleteTarget)}
        title="Delete Settlement"
        message={`Delete settlement ${deleteTarget?.settlementNumber}? This can be undone from View Deleted.`}
        confirmText={actionLoading ? 'Deleting...' : 'Delete'}
        cancelText="Keep"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        loading={actionLoading}
        severity="error"
      />

      <ConfirmationDialog
        open={Boolean(restoreTarget)}
        title="Restore Settlement"
        message={`Restore settlement ${restoreTarget?.settlementNumber}?`}
        confirmText={actionLoading ? 'Restoring...' : 'Restore'}
        cancelText="Cancel"
        onConfirm={onConfirmRestore}
        onCancel={onCancelRestore}
        loading={actionLoading}
        severity="info"
      />
    </>
  )
}
