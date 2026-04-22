import { Dialog, DialogActions, DialogContent, DialogTitle, TextField, Typography } from '@mui/material'
import { AppButton } from '@/components/common/AppButton'
import type { ChartOfAccount, FundTransfer } from '@/types'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'

interface FormState {
  sourceAccountId: string
  destinationAccountId: string
  amount: string
  transferDate: string
  description: string
}

interface Props {
  dialogOpen: boolean
  canManageTransfers: boolean
  creating: boolean
  form: FormState
  cashAccounts: ChartOfAccount[]
  availableDestinations: ChartOfAccount[]
  onCloseDialog: () => void
  onFormChange: (field: keyof FormState, value: string) => void
  onCreate: () => void
  cancelTarget: FundTransfer | null
  cancelling: boolean
  onConfirmCancel: () => void
  onCancelCancel: () => void
}

export function FundTransfersDialogs({
  dialogOpen,
  canManageTransfers,
  creating,
  form,
  cashAccounts,
  availableDestinations,
  onCloseDialog,
  onFormChange,
  onCreate,
  cancelTarget,
  cancelling,
  onConfirmCancel,
  onCancelCancel,
}: Props) {
  return (
    <>
      <Dialog open={dialogOpen && canManageTransfers} onClose={onCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>New Fund Transfer</DialogTitle>
        <DialogContent>
          <TextField select fullWidth size="small" sx={{ mt: 1, mb: 2 }} label="From Account *" value={form.sourceAccountId} onChange={(event) => onFormChange('sourceAccountId', event.target.value)}>
            {cashAccounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
          </TextField>
          <TextField select fullWidth size="small" sx={{ mb: 2 }} label="To Account *" value={form.destinationAccountId} onChange={(event) => onFormChange('destinationAccountId', event.target.value)} disabled={!form.sourceAccountId}>
            {availableDestinations.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
          </TextField>
          <TextField fullWidth label="Amount *" type="number" sx={{ mb: 2 }} slotProps={{ htmlInput: { min: 0.01, step: 0.01 } }} value={form.amount} onChange={(event) => onFormChange('amount', event.target.value)} />
          <TextField fullWidth label="Date *" type="date" sx={{ mb: 2 }} value={form.transferDate} onChange={(event) => onFormChange('transferDate', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
          <TextField fullWidth label="Description" multiline rows={2} value={form.description} onChange={(event) => onFormChange('description', event.target.value)} />
        </DialogContent>
        <DialogActions>
          <AppButton variant="outlined" onClick={onCloseDialog}>Cancel</AppButton>
          <AppButton variant="primary" onClick={onCreate} disabled={creating}>{creating ? 'Creating...' : 'Create Transfer'}</AppButton>
        </DialogActions>
      </Dialog>
      <ConfirmationDialog
        open={!!cancelTarget}
        title="Cancel Transfer"
        message={`Cancel transfer ${cancelTarget?.referenceNumber}? This will post a reversing journal entry.`}
        confirmText={cancelling ? 'Cancelling...' : 'Cancel Transfer'}
        cancelText="Keep"
        onConfirm={onConfirmCancel}
        onCancel={onCancelCancel}
        loading={cancelling}
        severity="error"
      />
    </>
  )
}
