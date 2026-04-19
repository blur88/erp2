import { Button, Dialog, DialogActions, DialogContent, DialogTitle, FormControl, InputLabel, MenuItem, Select, Stack, TextField } from '@mui/material'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import type { OwnerEquityTransaction, PaymentMethodConfig } from '@/types'

interface FormState {
  id?: string
  transactionDate: string
  type: 'capital_injection' | 'owner_drawing'
  amount: string
  paymentMethodId: string
  description: string
}

interface Props {
  dialogOpen: boolean
  form: FormState
  paymentMethods: PaymentMethodConfig[]
  onCloseDialog: () => void
  onFormChange: (field: keyof FormState, value: string) => void
  onSave: () => void
  reverseTarget: OwnerEquityTransaction | null
  deleteTarget: OwnerEquityTransaction | null
  postTarget: OwnerEquityTransaction | null
  onCancelReverse: () => void
  onCancelDelete: () => void
  onCancelPost: () => void
  onConfirmReverse: () => void
  onConfirmDelete: () => void
  onConfirmPost: () => void
}

export function OwnerEquityDialogs({
  dialogOpen,
  form,
  paymentMethods,
  onCloseDialog,
  onFormChange,
  onSave,
  reverseTarget,
  deleteTarget,
  postTarget,
  onCancelReverse,
  onCancelDelete,
  onCancelPost,
  onConfirmReverse,
  onConfirmDelete,
  onConfirmPost,
}: Props) {
  return (
    <>
      <Dialog open={dialogOpen} onClose={onCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{form.id ? 'Edit Transaction' : 'New Transaction'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Type</InputLabel>
              <Select value={form.type} label="Type" onChange={(event) => onFormChange('type', event.target.value as FormState['type'])}>
                <MenuItem value="capital_injection">Capital Injection</MenuItem>
                <MenuItem value="owner_drawing">Owner Drawing</MenuItem>
              </Select>
            </FormControl>
            <TextField label="Date" type="date" size="small" value={form.transactionDate} onChange={(event) => onFormChange('transactionDate', event.target.value)} slotProps={{ inputLabel: { shrink: true } }} />
            <TextField label="Amount" size="small" type="number" value={form.amount} onChange={(event) => onFormChange('amount', event.target.value)} />
            <FormControl fullWidth size="small">
              <InputLabel>Payment Method</InputLabel>
              <Select value={form.paymentMethodId} label="Payment Method" onChange={(event) => onFormChange('paymentMethodId', event.target.value)}>
                {paymentMethods.map((paymentMethod) => <MenuItem key={paymentMethod.id} value={paymentMethod.id}>{paymentMethod.name}</MenuItem>)}
              </Select>
            </FormControl>
            <TextField label="Description" multiline minRows={2} value={form.description} onChange={(event) => onFormChange('description', event.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions><Button onClick={onCloseDialog}>Cancel</Button><Button variant="contained" onClick={onSave}>Save</Button></DialogActions>
      </Dialog>
      <ConfirmationDialog open={!!postTarget} title="Post Transaction" message={`Post transaction ${postTarget?.referenceNumber}?`} confirmText="Post" cancelText="Cancel" onConfirm={onConfirmPost} onCancel={onCancelPost} />
      <ConfirmationDialog open={!!deleteTarget} title="Delete Transaction" message={`Delete transaction ${deleteTarget?.referenceNumber}?`} confirmText="Delete" cancelText="Cancel" onConfirm={onConfirmDelete} onCancel={onCancelDelete} severity="error" />
      <ConfirmationDialog open={!!reverseTarget} title="Reverse Transaction" message="Are you sure you want to reverse this transaction? This will create a reversal journal entry." confirmText="Confirm" cancelText="Cancel" onConfirm={onConfirmReverse} onCancel={onCancelReverse} severity="error" />
    </>
  )
}
