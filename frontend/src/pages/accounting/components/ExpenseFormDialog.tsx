import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
} from '@mui/material'

import { AppButton } from '@/components/common/AppButton'
import { useNotification } from '@/hooks/useNotification'
import {
  useCreateExpenseMutation,
  useGetChartOfAccountsQuery,
  useGetPaymentMethodsQuery,
  useUpdateExpenseMutation,
} from '@/store/api/accountingApi'
import type { ChartOfAccount, ExpenseRecord } from '@/types'
import { getErrorMessage } from '@/utils/errorMessage'

interface Props {
  open: boolean
  editTarget: ExpenseRecord | null
  onClose: () => void
  onSaved: () => void
}

type FormState = {
  expenseDate: string
  expenseAccountId: string
  amount: string
  paymentMethodId: string
  vendor: string
  description: string
}

function defaultForm(): FormState {
  return {
    expenseDate: new Date().toISOString().slice(0, 10),
    expenseAccountId: '',
    amount: '',
    paymentMethodId: '',
    vendor: '',
    description: '',
  }
}

export function ExpenseFormDialog({ open, editTarget, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(defaultForm())

  const { data: paymentMethodsResponse } = useGetPaymentMethodsQuery({ isActive: true })
  const paymentMethods = useMemo(() => paymentMethodsResponse?.data ?? [], [paymentMethodsResponse?.data])
  const { data: expenseAccountsResponse } = useGetChartOfAccountsQuery({ type: 'EXPENSE', isActive: true })
  const expenseAccounts = useMemo(
    () => (expenseAccountsResponse?.data ?? []) as ChartOfAccount[],
    [expenseAccountsResponse?.data],
  )

  const { showError } = useNotification()
  const [createExpense] = useCreateExpenseMutation()
  const [updateExpense] = useUpdateExpenseMutation()

  const firstExpenseAccountId = expenseAccounts[0]?.id ?? ''
  const firstPaymentMethodId = paymentMethods[0]?.id ?? ''

  useEffect(() => {
    if (!open) return
    if (editTarget) {
      setForm({
        expenseDate: String(editTarget.expenseDate).slice(0, 10),
        expenseAccountId: editTarget.expenseAccountId,
        amount: String(editTarget.amount),
        paymentMethodId: editTarget.paymentMethodId,
        vendor: editTarget.vendor ?? '',
        description: editTarget.description ?? '',
      })
    }
    else {
      setForm({
        ...defaultForm(),
        expenseAccountId: firstExpenseAccountId,
        paymentMethodId: firstPaymentMethodId,
      })
    }
  }, [open, editTarget, firstExpenseAccountId, firstPaymentMethodId])

  const handleSave = async () => {
    if (!form.expenseAccountId || !form.paymentMethodId || !form.amount || Number(form.amount) <= 0) {
      return
    }
    const payload = {
      expenseDate: form.expenseDate,
      expenseAccountId: form.expenseAccountId,
      amount: Number(form.amount),
      paymentMethodId: form.paymentMethodId,
      vendor: form.vendor || undefined,
      description: form.description || undefined,
    }
    try {
      if (editTarget) {
        await updateExpense({ id: editTarget.id, data: payload }).unwrap()
      }
      else {
        await createExpense(payload).unwrap()
      }
      onSaved()
      onClose()
    }
    catch (error: unknown) {
      showError(getErrorMessage(error, 'Failed to save expense'))
    }
  }

  const set = (field: keyof FormState) => (event: ChangeEvent<HTMLInputElement>) =>
    setForm((current) => ({ ...current, [field]: event.target.value }))

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{editTarget ? 'Edit Expense' : 'New Expense'}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 1 }}>
          <TextField
            label="Date"
            type="date"
            size="small"
            value={form.expenseDate}
            onChange={set('expenseDate')}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <FormControl fullWidth size="small">
            <InputLabel>Expense Account</InputLabel>
            <Select
              value={form.expenseAccountId}
              label="Expense Account"
              onChange={(event) => setForm((current) => ({ ...current, expenseAccountId: event.target.value }))}
            >
              {expenseAccounts.map((account) => (
                <MenuItem key={account.id} value={account.id}>{account.code} - {account.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField label="Amount" size="small" type="number" value={form.amount} onChange={set('amount')} />
          <FormControl fullWidth size="small">
            <InputLabel>Payment Method</InputLabel>
            <Select
              value={form.paymentMethodId}
              label="Payment Method"
              onChange={(event) => setForm((current) => ({ ...current, paymentMethodId: event.target.value }))}
            >
              {paymentMethods.map((paymentMethod) => (
                <MenuItem key={paymentMethod.id} value={paymentMethod.id}>{paymentMethod.name}</MenuItem>
              ))}
            </Select>
          </FormControl>
          <TextField label="Vendor" value={form.vendor} onChange={set('vendor')} />
          <TextField label="Description" multiline minRows={2} value={form.description} onChange={set('description')} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <AppButton variant="outlined" onClick={onClose}>Cancel</AppButton>
        <AppButton variant="primary" onClick={() => void handleSave()}>Save</AppButton>
      </DialogActions>
    </Dialog>
  )
}
