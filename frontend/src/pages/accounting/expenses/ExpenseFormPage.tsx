import React, { useEffect, useMemo } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Tooltip,
  Typography,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers'
import { yupResolver } from '@hookform/resolvers/yup'
import { format, parseISO } from 'date-fns'
import { Controller, useForm } from 'react-hook-form'
import { useBlocker, useNavigate, useParams } from 'react-router-dom'
import * as yup from 'yup'

import { AppButton } from '@/components/common/AppButton'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import PageHeader from '@/components/common/PageHeader'
import { useNotification } from '@/hooks/useNotification'
import {
  useCreateExpenseMutation,
  useGetAccountingSettingsQuery,
  useGetAccountTreeQuery,
  useGetExpenseQuery,
  useUpdateExpenseMutation,
} from '@/store/api/accountingApi'
import type { AccountTreeNode } from '@/types'
import { getCurrentDate } from '@/utils/formatters'
import { rtkErrorMessage } from '@/utils/errorMessage'

interface ExpenseFormData {
  expenseDate: string
  payee: string
  description: string
  expenseAccountId: string
  totalAmount: string
  notes: string
}

function flattenAccountTree(nodes: AccountTreeNode[]): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = []
  const flatten = (items: AccountTreeNode[]) => {
    for (const item of items) {
      if (item.isPostable) {
        options.push({ value: item.id, label: `${item.code} ${item.name}` })
      }
      if (item.children?.length) flatten(item.children)
    }
  }
  flatten(nodes)
  return options
}

const fieldSx = {
  '& .MuiInputBase-input': { fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
}

const ExpenseFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const isEdit = !!id

  const { data: expense, isLoading: loadingExpense, isError: expenseLoadFailed } = useGetExpenseQuery(id!, { skip: !isEdit })
  const { data: accountTreeData = [], isLoading: loadingAccounts } = useGetAccountTreeQuery({ type: 'Expense', isActive: true })
  const { data: settings } = useGetAccountingSettingsQuery()
  const [createExpense, { isLoading: isCreating }] = useCreateExpenseMutation()
  const [updateExpense, { isLoading: isUpdating }] = useUpdateExpenseMutation()

  const isSaving = isCreating || isUpdating
  const accountOptions = useMemo(() => flattenAccountTree(accountTreeData), [accountTreeData])
  const hasPayments = (expense?.payments?.length ?? 0) > 0
  const paidAmountNum = parseFloat(expense?.paidAmount ?? '0')
  // No arbitrary 0.01 floor — backend accepts any positive scale-4 amount
  // (e.g. 0.0001); the only lower bound is the net paid amount when editing.
  const minAmount = isEdit ? paidAmountNum : 0

  useEffect(() => {
    if (isEdit && expense) {
      if (expense.documentStatus === 'CANCELLED' || expense.paymentStatus === 'PAID') {
        navigate(`/accounting/expenses/${expense.id}`, { replace: true })
      }
    }
  }, [isEdit, expense, navigate])

  const schema = useMemo(() => yup.object({
    expenseDate: yup.string().required('Expense date is required'),
    payee: yup.string().nullable().transform((v) => v?.trim() || null),
    description: yup.string().required('Description is required'),
    expenseAccountId: yup.string().required('Account is required'),
    totalAmount: yup
      .string()
      .required('Amount is required')
      .test('is-positive', 'Amount must be greater than 0', (v) => parseFloat(v ?? '0') > 0)
      .test('min-paid', 'Amount cannot be less than paid amount', (v) => parseFloat(v ?? '0') >= minAmount),
    notes: yup.string().nullable().transform((v) => v?.trim() || null),
  }), [minAmount])

  const defaultExpenseAccountId = settings?.defaultExpenseAccountId ?? ''

  const {
    control,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<ExpenseFormData>({
    resolver: yupResolver(schema, { abortEarly: false }) as any,
    defaultValues: {
      expenseDate: getCurrentDate(),
      payee: '',
      description: '',
      expenseAccountId: defaultExpenseAccountId,
      totalAmount: '',
      notes: '',
    },
  })

  useEffect(() => {
    if (isEdit && expense && !loadingExpense) {
      reset({
        expenseDate: expense.expenseDate,
        payee: expense.payee ?? '',
        description: expense.description,
        expenseAccountId: expense.expenseAccountId,
        totalAmount: expense.totalAmount,
        notes: expense.notes ?? '',
      })
    }
  }, [isEdit, expense, loadingExpense, reset])

  useEffect(() => {
    if (!isEdit && defaultExpenseAccountId) {
      reset((prev) => ({ ...prev, expenseAccountId: defaultExpenseAccountId }))
    }
  }, [isEdit, defaultExpenseAccountId, reset])

  const blocker = useBlocker(() => isDirty && !isSubmitting)

  const UnsavedChangesDialog = (
    <ConfirmationDialog
      open={blocker.state === 'blocked'}
      title="Discard this expense?"
      message="You have unsaved changes. Are you sure you want to leave without saving?"
      confirmText="Discard"
      cancelText="Keep editing"
      severity="warning"
      onConfirm={() => { if (blocker.state === 'blocked') blocker.proceed() }}
      onCancel={() => { if (blocker.state === 'blocked') blocker.reset() }}
    />
  )

  const handleCancel = () => {
    navigate(isEdit ? `/accounting/expenses/${expense?.id ?? id}` : '/accounting/expenses')
  }

  const handleFormSubmit = async (data: ExpenseFormData) => {
    const cleanedData = {
      expenseDate: data.expenseDate,
      payee: data.payee?.trim() || null,
      description: data.description.trim(),
      expenseAccountId: data.expenseAccountId,
      totalAmount: data.totalAmount,
      notes: data.notes?.trim() || null,
    }

    try {
      if (isEdit) {
        // Never fall through to create in edit mode — a failed detail load
        // must not silently duplicate the expense.
        if (!expense?.id) {
          showError('Expense could not be loaded — cannot save changes')
          return
        }
        await updateExpense({ id: expense.id, data: cleanedData }).unwrap()
        showSuccess('Expense updated successfully')
        navigate(`/accounting/expenses/${expense.id}`)
      } else {
        const saved = await createExpense(cleanedData).unwrap()
        showSuccess('Expense created successfully')
        navigate(`/accounting/expenses/${saved.id}`)
      }
    } catch (error: any) {
      const message = error?.data?.message
      if (Array.isArray(message)) {
        message.forEach((msg: string) => {
          const lowerMsg = msg.toLowerCase()
          if (lowerMsg.includes('amount')) setError('totalAmount', { message: msg })
          else if (lowerMsg.includes('description')) setError('description', { message: msg })
        })
        showError('Please fix the highlighted errors')
      } else {
        showError(rtkErrorMessage(error, `Failed to ${isEdit ? 'update' : 'create'} expense`))
      }
    }
  }

  if (loadingExpense) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isEdit && (expenseLoadFailed || !expense)) {
    return (
      <>
        <PageHeader
          title="Edit Expense"
          subtitle=""
          variant="workflow"
          backAction={() => navigate('/accounting/expenses')}
        />
        <Alert severity="error" sx={{ mt: 2 }}>
          Failed to load this expense. Go back and try again.
        </Alert>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit Expense' : 'New Expense'}
        subtitle={isEdit ? `Editing ${expense?.expenseNumber ?? ''}` : 'Record a new business expense'}
        variant="workflow"
        backAction={handleCancel}
      />

      <form noValidate onSubmit={handleSubmit(handleFormSubmit)}>
        <Grid container spacing={3}>

          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Expense Information</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Controller
                      name="expenseDate"
                      control={control}
                      render={({ field }) => (
                        <DatePicker
                          label="Expense Date"
                          value={field.value ? parseISO(field.value) : null}
                          onChange={(date) => field.onChange(date ? format(date, 'yyyy-MM-dd') : '')}
                          slotProps={{
                            textField: {
                              fullWidth: true,
                              size: 'small',
                              required: true,
                              error: !!errors.expenseDate,
                              helperText: errors.expenseDate?.message,
                              disabled: isSaving,
                              sx: fieldSx,
                            },
                          }}
                        />
                      )}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Controller
                      name="expenseDate"
                      control={control}
                      render={() => (
                        <TextField
                          label="Expense No."
                          value={isEdit ? (expense?.expenseNumber ?? '') : 'Auto-generated'}
                          disabled
                          fullWidth
                          size="small"
                          sx={fieldSx}
                        />
                      )}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Controller
                      name="payee"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          value={field.value || ''}
                          fullWidth
                          size="small"
                          label="Payee"
                          disabled={isSaving}
                          sx={fieldSx}
                        />
                      )}
                    />
                  </Grid>
                  <Grid size={12}>
                    <Controller
                      name="description"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          fullWidth
                          size="small"
                          label="Description"
                          required
                          disabled={isSaving}
                          error={!!errors.description}
                          helperText={errors.description?.message}
                          sx={fieldSx}
                        />
                      )}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Accounting</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Controller
                      name="expenseAccountId"
                      control={control}
                      render={({ field }) => {
                        const selectField = (
                          <FormControl fullWidth size="small" error={!!errors.expenseAccountId} disabled={hasPayments || isSaving} sx={fieldSx}>
                            <InputLabel id="account-label">Account</InputLabel>
                            <Select labelId="account-label" id="account-select" label="Account" {...field}>
                              {accountOptions.map((opt) => (
                                <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        )
                        return hasPayments ? (
                          <Tooltip title="Locked after first payment" arrow>
                            <span>{selectField}</span>
                          </Tooltip>
                        ) : selectField
                      }}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Controller
                      name="totalAmount"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          fullWidth
                          size="small"
                          label="Amount"
                          required
                          disabled={isSaving}
                          error={!!errors.totalAmount}
                          helperText={errors.totalAmount?.message}
                          slotProps={{ htmlInput: { inputMode: 'decimal' as const } }}
                          sx={fieldSx}
                        />
                      )}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Additional Information</Typography>
                <Controller
                  name="notes"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value || ''}
                      fullWidth
                      multiline
                      size="small"
                      label="Notes"
                      disabled={isSaving}
                      error={!!errors.notes}
                      helperText={errors.notes?.message}
                      minRows={3}
                      sx={fieldSx}
                    />
                  )}
                />
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <AppButton variant="secondary" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </AppButton>
              <AppButton variant="primary" type="submit" disabled={isSaving}>
                {isSaving
                  ? (isEdit ? 'Updating...' : 'Creating...')
                  : (isEdit ? 'Save Expense' : 'Create Expense')}
              </AppButton>
            </Box>
          </Grid>

        </Grid>
      </form>

      {UnsavedChangesDialog}
    </>
  )
}

export default ExpenseFormPage
