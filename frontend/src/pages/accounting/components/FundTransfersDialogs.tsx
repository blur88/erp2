import { Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, TextField } from '@mui/material'

import { AppButton } from '@/components/common/AppButton'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import type { ChartOfAccount, FundTransfer } from '@/types'

export interface FundTransferFormState {
  sourceAccountId: string
  destinationAccountId: string
  amount: string
  transferDate: string
  description: string
}

interface Props {
  formOpen: boolean
  editTarget: FundTransfer | null
  canManageTransfers: boolean
  saving: boolean
  form: FundTransferFormState
  cashAccounts: ChartOfAccount[]
  availableDestinations: ChartOfAccount[]
  onCloseForm: () => void
  onFormChange: (field: keyof FundTransferFormState, value: string) => void
  onSave: () => void
  postTarget: FundTransfer | null
  deleteTarget: FundTransfer | null
  unpostTarget: FundTransfer | null
  restoreTarget: FundTransfer | null
  actionLoading: boolean
  onConfirmPost: () => void
  onCancelPost: () => void
  onConfirmDelete: () => void
  onCancelDelete: () => void
  onConfirmUnpost: () => void
  onCancelUnpost: () => void
  onConfirmRestore: () => void
  onCancelRestore: () => void
}

export function FundTransfersDialogs({
  formOpen,
  editTarget,
  canManageTransfers,
  saving,
  form,
  cashAccounts,
  availableDestinations,
  onCloseForm,
  onFormChange,
  onSave,
  postTarget,
  deleteTarget,
  unpostTarget,
  restoreTarget,
  actionLoading,
  onConfirmPost,
  onCancelPost,
  onConfirmDelete,
  onCancelDelete,
  onConfirmUnpost,
  onCancelUnpost,
  onConfirmRestore,
  onCancelRestore,
}: Props) {
  const isEditing = !!editTarget

  return (
    <>
      <Dialog open={formOpen && canManageTransfers} onClose={onCloseForm} maxWidth="sm" fullWidth>
        <DialogTitle>{isEditing ? 'Edit Fund Transfer' : 'New Fund Transfer'}</DialogTitle>
        <DialogContent>
          <TextField select fullWidth size="small" sx={{ mt: 1, mb: 2 }} label="From Account *" value={form.sourceAccountId} onChange={(e) => onFormChange('sourceAccountId', e.target.value)}>
            {cashAccounts.map((a) => <MenuItem key={a.id} value={a.id}>{a.code} - {a.name}</MenuItem>)}
          </TextField>
          <TextField select fullWidth size="small" sx={{ mb: 2 }} label="To Account *" value={form.destinationAccountId} onChange={(e) => onFormChange('destinationAccountId', e.target.value)} disabled={!form.sourceAccountId}>
            {availableDestinations.map((a) => <MenuItem key={a.id} value={a.id}>{a.code} - {a.name}</MenuItem>)}
          </TextField>
          <TextField fullWidth label="Amount *" type="number" sx={{ mb: 2 }} slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }} value={form.amount} onChange={(e) => onFormChange('amount', e.target.value)} />
          <TextField fullWidth label="Date *" type="date" sx={{ mb: 2 }} value={form.transferDate} onChange={(e) => onFormChange('transferDate', e.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField fullWidth label="Description" multiline rows={2} value={form.description} onChange={(e) => onFormChange('description', e.target.value)} />
        </DialogContent>
        <DialogActions>
          <AppButton variant="outlined" onClick={onCloseForm}>Cancel</AppButton>
          <AppButton variant="primary" onClick={onSave} disabled={saving}>
            {saving ? (isEditing ? 'Saving...' : 'Creating...') : (isEditing ? 'Save Changes' : 'Create Transfer')}
          </AppButton>
        </DialogActions>
      </Dialog>

      <ConfirmationDialog
        open={!!postTarget}
        title="Post Transfer"
        message={`Post transfer ${postTarget?.referenceNumber}? This will create a journal entry.`}
        confirmText={actionLoading ? 'Posting...' : 'Post Transfer'}
        cancelText="Cancel"
        onConfirm={onConfirmPost}
        onCancel={onCancelPost}
        loading={actionLoading}
        severity="info"
      />

      <ConfirmationDialog
        open={!!deleteTarget}
        title="Delete Transfer"
        message={`Delete transfer ${deleteTarget?.referenceNumber}? This can be undone from View Deleted.`}
        confirmText={actionLoading ? 'Deleting...' : 'Delete'}
        cancelText="Keep"
        onConfirm={onConfirmDelete}
        onCancel={onCancelDelete}
        loading={actionLoading}
        severity="error"
      />

      <ConfirmationDialog
        open={!!unpostTarget}
        title="Unpost Transfer"
        message={`Unpost transfer ${unpostTarget?.referenceNumber}? This will post a reversing journal entry.`}
        confirmText={actionLoading ? 'Unposting...' : 'Unpost Transfer'}
        cancelText="Cancel"
        onConfirm={onConfirmUnpost}
        onCancel={onCancelUnpost}
        loading={actionLoading}
        severity="error"
      />

      <ConfirmationDialog
        open={!!restoreTarget}
        title="Restore Transfer"
        message={`Restore transfer ${restoreTarget?.referenceNumber}?`}
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
