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
import { useBlocker, useLocation, useNavigate, useParams } from 'react-router-dom'
import * as yup from 'yup'

import { AppButton } from '@/components/common/AppButton'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import PageHeader from '@/components/common/PageHeader'
import { useDocumentNumberPreview } from '@/hooks/useDocumentNumberPreview'
import { useNotification } from '@/hooks/useNotification'
import {
  useCreateExpenseMutation,
  useGetAccountingSettingsQuery,
  useGetAccountTreeQuery,
  useGetExpenseQuery,
  useUpdateExpenseMutation,
} from '@/store/api/accountingApi'
import type { AccountTreeNode } from '@/types'
import { getCurrentDate, toMuiDatePickerFormat } from '@/utils/formatters'
import { rtkErrorMessage } from '@/utils/errorMessage'
import { normalizeAmountInput, toAmountInputValue, toScaledAmount } from '@/utils/currency'

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

// Mirrors backend/src/modules/accounting/dto/expense.dto.ts — keep in sync.
const AMOUNT_GRAMMAR = /^\d+(\.\d{1,4})?$/

const ExpenseFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const isEdit = !!id

  // Edit can be opened from the Expenses list or from Expense Detail. The list
  // marks its origin explicitly; everything else — including a directly typed or
  // shared /edit URL — falls back to Detail, which is the historical behaviour.
  const location = useLocation()
  const isListOrigin =
    (location.state as { expenseEditOrigin?: string } | null)?.expenseEditOrigin === 'list'

  const expenseNumberPreview = useDocumentNumberPreview('Expenses', !isEdit)

  const { data: expense, isLoading: loadingExpense, isError: expenseLoadFailed } = useGetExpenseQuery(id!, { skip: !isEdit })
  const { data: accountTreeData = [], isLoading: loadingAccounts } = useGetAccountTreeQuery({ type: 'Expense', isActive: true })
  const { data: settings } = useGetAccountingSettingsQuery()
  const [createExpense, { isLoading: isCreating }] = useCreateExpenseMutation()
  const [updateExpense, { isLoading: isUpdating }] = useUpdateExpenseMutation()

  const isSaving = isCreating || isUpdating
  const hasPayments = (expense?.payments?.length ?? 0) > 0
  // No arbitrary 0.01 floor — backend accepts any positive scale-4 amount
  // (e.g. 0.0001); the only lower bound is the net paid amount when editing.
  // Compared in scale-4 minor units: paidAmount is NUMERIC(18,4) and parsing a
  // large one into binary64 loses fractional cents.
  const minPaidUnits = isEdit ? (toScaledAmount(expense?.paidAmount ?? '0') ?? 0n) : 0n

  useEffect(() => {
    if (isEdit && expense) {
      // Mirrors the backend: settled expenses are non-editable. Keyed to both
      // lifecycle and settlement so a temporarily inconsistent DRAFT + PAID /
      // OVERPAID row is still refused.
      const isNonEditable =
        expense.documentStatus !== 'DRAFT' ||
        expense.paymentStatus === 'PAID' ||
        expense.paymentStatus === 'OVERPAID'
      if (isNonEditable) {
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
      // The DTO regex verbatim (backend expense.dto.ts) — the frontend must
      // accept exactly what the API accepts, not an approximation (#1001).
      // Blank yields to `required`, which owns empty input; without this guard
      // a blank field reports two messages under abortEarly: false.
      .test('format', 'Enter a valid amount (up to 4 decimal places)',
        (v) => !v || AMOUNT_GRAMMAR.test(v))
      // The resolver runs with abortEarly: false, so every test runs regardless
      // of order. These two yield to `format` so a malformed value reports one
      // message, and so toScaledAmount — which trims whitespace and accepts
      // signs — only ever sees strings already matching the grammar.
      .test('is-positive', 'Amount must be greater than 0', (v) => {
        if (!v || !AMOUNT_GRAMMAR.test(v)) return true
        return (toScaledAmount(v) ?? 0n) > 0n
      })
      .test('min-paid', 'Amount cannot be less than paid amount', (v) => {
        if (!v || !AMOUNT_GRAMMAR.test(v)) return true
        return (toScaledAmount(v) ?? 0n) >= minPaidUnits
      }),
    notes: yup.string().nullable().transform((v) => v?.trim() || null),
  }), [minPaidUnits])

  const defaultExpenseAccountId = settings?.defaultExpenseAccountId ?? ''

  const {
    control,
    getValues,
    handleSubmit,
    reset,
    setError,
    setValue,
    watch,
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

  const selectedExpenseAccountId = watch('expenseAccountId')
  const accountOptions = useMemo(() => {
    const all = flattenAccountTree(accountTreeData)
    const cogsId = settings?.cogsAccountId
    if (!cogsId) return all
    return all.filter(
      (o) => o.value !== cogsId || (isEdit && selectedExpenseAccountId === cogsId),
    )
  }, [accountTreeData, settings?.cogsAccountId, isEdit, selectedExpenseAccountId])

  const storedFormat = useMemo(() => localStorage.getItem('dateFormat') || 'DD/MM/YYYY', [])
  const pickerFormat = useMemo(() => toMuiDatePickerFormat(storedFormat), [storedFormat])

  useEffect(() => {
    if (isEdit && expense && !loadingExpense) {
      reset({
        expenseDate: expense.expenseDate,
        payee: expense.payee ?? '',
        description: expense.description,
        expenseAccountId: expense.expenseAccountId,
        totalAmount: toAmountInputValue(expense.totalAmount),
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

  // `expense?.id ?? id` is string | undefined: `id` comes from useParams and the
  // load-failure early return doesn't narrow it for the compiler. Handle the gap
  // explicitly rather than asserting with `id!`.
  const returnAfterEdit = (expenseId: string | undefined) => {
    if (isListOrigin) {
      navigate('/accounting/expenses', {
        // Omit the highlight when the id is unknown rather than sending undefined;
        // the list just skips highlighting, which is already best-effort.
        state: expenseId ? { highlightExpenseId: expenseId } : null,
      })
    } else if (expenseId) {
      navigate(`/accounting/expenses/${expenseId}`)
    } else {
      navigate('/accounting/expenses')
    }
  }

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
    if (isEdit) {
      returnAfterEdit(expense?.id ?? id)
    } else {
      navigate('/accounting/expenses')
    }
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
        returnAfterEdit(expense.id)
      } else {
        await createExpense(cleanedData).unwrap()
        showSuccess('Expense created successfully')
        navigate('/accounting/expenses')
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

  // Enter with the Amount field still focused submits without firing blur, so
  // the blur-time repair never runs. Normalizing here keeps mouse and keyboard
  // submission consistent (#1001). shouldValidate is omitted deliberately —
  // handleSubmit validates on the next line, and requesting both would run the
  // resolver twice. The setValue write is synchronous, so handleSubmit reads
  // the normalized value.
  const normalizeBeforeValidate = (e: React.FormEvent) => {
    const current = getValues('totalAmount')
    const normalized = normalizeAmountInput(current ?? '')
    if (normalized !== current) {
      setValue('totalAmount', normalized, { shouldDirty: true })
    }
    return handleSubmit(handleFormSubmit)(e)
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit Expense' : 'New Expense'}
        subtitle={isEdit ? `Editing ${expense?.expenseNumber ?? ''}` : 'Record a new business expense'}
        variant="workflow"
        backAction={handleCancel}
      />

      <form noValidate onSubmit={normalizeBeforeValidate}>
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
                          format={pickerFormat}
                          onChange={(date) =>
                            field.onChange(
                              // Guard: the picker emits Invalid Date mid-typing.
                              date && !Number.isNaN(date.getTime())
                                ? format(date, 'yyyy-MM-dd')
                                : '',
                            )
                          }
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
                          value={isEdit ? (expense?.expenseNumber ?? '') : (expenseNumberPreview ?? '')}
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
                          onBlur={() => {
                            // RHF defaults to onSubmit validation, so field.onBlur
                            // only marks the field touched — setValue with
                            // shouldValidate is what clears a stale format error
                            // once the value has been repaired (#1001).
                            setValue('totalAmount', normalizeAmountInput(field.value ?? ''), {
                              shouldValidate: true,
                              shouldDirty: true,
                            })
                            field.onBlur()
                          }}
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
