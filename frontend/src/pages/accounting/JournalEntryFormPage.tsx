import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Box,
  Button,
  Grid,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Paper,
  Alert,
  CircularProgress,
  Card,
  CardContent,
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Chip,
  Stack,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
  Save as SaveIcon,
  PostAdd as PostIcon,
} from '@mui/icons-material'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useNotification } from '@/hooks/useNotification'
import { useAppDispatch, useAppSelector } from '@/hooks/useRedux'
import {
  createJournalEntry,
  updateJournalEntry,
  fetchJournalEntryById,
  selectSelectedEntry,
  selectJournalEntriesLoading,
  selectJournalEntriesError,
  clearError,
} from '@/store/slices/journalEntriesSlice'
import {
  fetchChartOfAccounts,
  selectChartOfAccounts,
  selectChartOfAccountsLoading,
} from '@/store/slices/chartOfAccountsSlice'
import {
  fetchCurrentPeriod,
  selectCurrentPeriod,
} from '@/store/slices/fiscalPeriodsSlice'
import { formatCurrency, getCurrentDate } from '@/utils/formatters'
import { JournalEntryStatus } from '@/types'

interface JournalEntryLineForm {
  accountId: string
  debitAmount: number
  creditAmount: number
  memo?: string
}

interface JournalEntryFormData {
  entryDate: string
  referenceNumber?: string
  description: string
  lines: JournalEntryLineForm[]
}

const schema = yup.object({
  entryDate: yup.string().required('Entry date is required'),
  referenceNumber: yup.string().optional(),
  description: yup.string().required('Description is required'),
  lines: yup
    .array()
    .of(
      yup.object({
        accountId: yup.string().required('Account is required'),
        debitAmount: yup.number().min(0).required(),
        creditAmount: yup.number().min(0).required(),
        memo: yup.string().optional(),
      })
    )
    .min(2, 'At least 2 lines are required')
    .test('at-least-one-amount', 'Each line must have either debit or credit amount', (lines) => {
      if (!lines) return false
      return lines.every((line) => {
        const hasDebit = line.debitAmount > 0
        const hasCredit = line.creditAmount > 0
        return hasDebit || hasCredit
      })
    })
    .test('not-both-amounts', 'Each line cannot have both debit and credit amounts', (lines) => {
      if (!lines) return false
      return lines.every((line) => {
        const hasDebit = line.debitAmount > 0
        const hasCredit = line.creditAmount > 0
        return !(hasDebit && hasCredit)
      })
    }),
})

const JournalEntryFormPage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { id } = useParams<{ id: string }>()
  const isEditMode = !!id
  const { showSuccess, showError } = useNotification()

  // Redux state
  const selectedEntry = useAppSelector(selectSelectedEntry)
  const loading = useAppSelector(selectJournalEntriesLoading)
  const error = useAppSelector(selectJournalEntriesError)
  const accounts = useAppSelector(selectChartOfAccounts) || []
  const accountsLoading = useAppSelector(selectChartOfAccountsLoading)
  const currentPeriod = useAppSelector(selectCurrentPeriod)

  // Local state
  const [submitting, setSubmitting] = useState(false)
  const [shouldPost, setShouldPost] = useState(false)

  // Form setup
  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<JournalEntryFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      entryDate: getCurrentDate(),
      referenceNumber: '',
      description: '',
      lines: [
        { accountId: '', debitAmount: 0, creditAmount: 0, memo: '' },
        { accountId: '', debitAmount: 0, creditAmount: 0, memo: '' },
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'lines',
  })

  const watchedLines = watch('lines')
  const watchedDate = watch('entryDate')

  // Calculate totals
  const { totalDebits, totalCredits, difference, isBalanced } = useMemo(() => {
    const debits = watchedLines.reduce((sum, line) => sum + (Number(line.debitAmount) || 0), 0)
    const credits = watchedLines.reduce((sum, line) => sum + (Number(line.creditAmount) || 0), 0)
    const diff = debits - credits
    const balanced = Math.abs(diff) < 0.01 // Allow for floating point precision

    return {
      totalDebits: debits,
      totalCredits: credits,
      difference: diff,
      isBalanced: balanced,
    }
  }, [watchedLines])

  // Load data on mount
  useEffect(() => {
    dispatch(fetchChartOfAccounts({ isActive: true, limit: 1000 }))
    dispatch(fetchCurrentPeriod())
  }, [dispatch])

  // Load entry in edit mode
  useEffect(() => {
    if (isEditMode && id) {
      dispatch(fetchJournalEntryById(id))
    }
  }, [isEditMode, id, dispatch])

  // Populate form in edit mode
  useEffect(() => {
    if (isEditMode && selectedEntry && selectedEntry.id === id) {
      // Check if entry can be edited
      if (selectedEntry.status !== JournalEntryStatus.DRAFT) {
        showError('Only draft entries can be edited')
        navigate('/accounting/journal-entries')
        return
      }

      reset({
        entryDate: selectedEntry.entryDate
          ? new Date(selectedEntry.entryDate).toISOString().split('T')[0]
          : getCurrentDate(),
        referenceNumber: selectedEntry.referenceNumber || '',
        description: selectedEntry.description || '',
        lines:
          selectedEntry.lines && selectedEntry.lines.length > 0
            ? selectedEntry.lines.map((line) => ({
                accountId: line.accountId || '',
                debitAmount: line.debitAmount || 0,
                creditAmount: line.creditAmount || 0,
                memo: line.memo || '',
              }))
            : [
                { accountId: '', debitAmount: 0, creditAmount: 0, memo: '' },
                { accountId: '', debitAmount: 0, creditAmount: 0, memo: '' },
              ],
      })
    }
  }, [isEditMode, selectedEntry, id, reset, navigate, showError])

  // Clear error on unmount
  useEffect(() => {
    return () => {
      dispatch(clearError())
    }
  }, [dispatch])

  // Handle form submission
  const onSubmit = async (data: JournalEntryFormData) => {
    // Validate balance
    if (!isBalanced) {
      showError('Journal entry must be balanced (total debits must equal total credits)')
      return
    }

    setSubmitting(true)
    try {
      const payload = {
        entryDate: data.entryDate,
        referenceNumber: data.referenceNumber?.trim() || undefined,
        description: data.description.trim(),
        lines: data.lines.map((line) => ({
          accountId: line.accountId,
          debitAmount: Number(line.debitAmount) || 0,
          creditAmount: Number(line.creditAmount) || 0,
          memo: line.memo?.trim() || undefined,
        })),
      }

      if (isEditMode && id) {
        await dispatch(updateJournalEntry({ id, data: payload })).unwrap()
        showSuccess('Journal entry updated successfully')
      } else {
        const result = await dispatch(createJournalEntry(payload)).unwrap()
        showSuccess('Journal entry created successfully')

        // If should post, navigate to detail page to allow posting
        if (shouldPost && result && result.id) {
          navigate(`/accounting/journal-entries/${result.id}`)
          return
        }
      }

      navigate('/accounting/journal-entries')
    } catch (err: any) {
      showError(err || 'Failed to save journal entry')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle add line
  const handleAddLine = () => {
    append({ accountId: '', debitAmount: 0, creditAmount: 0, memo: '' })
  }

  // Handle remove line
  const handleRemoveLine = (index: number) => {
    if (fields.length <= 2) {
      showError('At least 2 lines are required')
      return
    }
    remove(index)
  }

  // Handle back
  const handleBack = () => {
    navigate('/accounting/journal-entries')
  }

  // Get account display name
  const getAccountDisplay = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId)
    return account ? `${account.code} - ${account.name}` : ''
  }

  // Get fiscal period display
  const getFiscalPeriodDisplay = () => {
    if (!currentPeriod) return 'No active period'
    return `${currentPeriod.code} - ${currentPeriod.name}`
  }

  if (loading && isEditMode) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    )
  }

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2 }}>
        <IconButton onClick={handleBack}>
          <ArrowBackIcon />
        </IconButton>
        <Typography variant="h4" sx={{ fontWeight: 600 }}>
          {isEditMode ? 'Edit Journal Entry' : 'New Journal Entry'}
        </Typography>
      </Box>

      {/* Error Alert */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => dispatch(clearError())}>
          {error}
        </Alert>
      )}

      <form onSubmit={handleSubmit(onSubmit)}>
        <Grid container spacing={3}>
          {/* Entry Header */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  Entry Header
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={4}>
                    <Controller
                      name="entryDate"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          fullWidth
                          label="Entry Date"
                          type="date"
                          required
                          error={!!errors.entryDate}
                          helperText={errors.entryDate?.message}
                          InputLabelProps={{ shrink: true }}
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <Controller
                      name="referenceNumber"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          fullWidth
                          label="Reference Number"
                          placeholder="Auto-generated if empty"
                          error={!!errors.referenceNumber}
                          helperText={errors.referenceNumber?.message || 'Leave empty to auto-generate'}
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={12} md={4}>
                    <TextField
                      fullWidth
                      label="Fiscal Period"
                      value={getFiscalPeriodDisplay()}
                      InputProps={{ readOnly: true }}
                      helperText="Based on entry date"
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Controller
                      name="description"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          fullWidth
                          label="Description"
                          required
                          multiline
                          rows={2}
                          error={!!errors.description}
                          helperText={errors.description?.message}
                        />
                      )}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Line Items */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6" sx={{ fontWeight: 600 }}>
                    Line Items
                  </Typography>
                  <Button variant="outlined" startIcon={<AddIcon />} onClick={handleAddLine}>
                    Add Line
                  </Button>
                </Box>

                {errors.lines && typeof errors.lines.message === 'string' && (
                  <Alert severity="error" sx={{ mb: 2 }}>
                    {errors.lines.message}
                  </Alert>
                )}

                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell sx={{ fontWeight: 600 }}>Account</TableCell>
                        <TableCell sx={{ fontWeight: 600 }} align="right">
                          Debit
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }} align="right">
                          Credit
                        </TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>Memo</TableCell>
                        <TableCell sx={{ fontWeight: 600 }} align="center">
                          Actions
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {fields.map((field, index) => (
                        <TableRow key={field.id}>
                          <TableCell sx={{ minWidth: 250 }}>
                            <Controller
                              name={`lines.${index}.accountId`}
                              control={control}
                              render={({ field }) => (
                                <FormControl
                                  fullWidth
                                  size="small"
                                  error={!!errors.lines?.[index]?.accountId}
                                >
                                  <Select
                                    {...field}
                                    displayEmpty
                                    disabled={accountsLoading}
                                  >
                                    <MenuItem value="">
                                      <em>Select Account</em>
                                    </MenuItem>
                                    {accounts.map((account) => (
                                      <MenuItem key={account.id} value={account.id}>
                                        {account.code} - {account.name}
                                      </MenuItem>
                                    ))}
                                  </Select>
                                </FormControl>
                              )}
                            />
                          </TableCell>
                          <TableCell sx={{ minWidth: 150 }}>
                            <Controller
                              name={`lines.${index}.debitAmount`}
                              control={control}
                              render={({ field }) => (
                                <TextField
                                  {...field}
                                  fullWidth
                                  type="number"
                                  size="small"
                                  inputProps={{ min: 0, step: 0.01 }}
                                  error={!!errors.lines?.[index]?.debitAmount}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value) || 0
                                    field.onChange(value)
                                    if (value > 0) {
                                      setValue(`lines.${index}.creditAmount`, 0)
                                    }
                                  }}
                                />
                              )}
                            />
                          </TableCell>
                          <TableCell sx={{ minWidth: 150 }}>
                            <Controller
                              name={`lines.${index}.creditAmount`}
                              control={control}
                              render={({ field }) => (
                                <TextField
                                  {...field}
                                  fullWidth
                                  type="number"
                                  size="small"
                                  inputProps={{ min: 0, step: 0.01 }}
                                  error={!!errors.lines?.[index]?.creditAmount}
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value) || 0
                                    field.onChange(value)
                                    if (value > 0) {
                                      setValue(`lines.${index}.debitAmount`, 0)
                                    }
                                  }}
                                />
                              )}
                            />
                          </TableCell>
                          <TableCell sx={{ minWidth: 200 }}>
                            <Controller
                              name={`lines.${index}.memo`}
                              control={control}
                              render={({ field }) => (
                                <TextField
                                  {...field}
                                  fullWidth
                                  size="small"
                                  placeholder="Optional memo"
                                />
                              )}
                            />
                          </TableCell>
                          <TableCell align="center">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => handleRemoveLine(index)}
                              disabled={fields.length <= 2}
                            >
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              </CardContent>
            </Card>
          </Grid>

          {/* Totals Summary */}
          <Grid item xs={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" sx={{ mb: 2, fontWeight: 600 }}>
                  Totals
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={12} md={3}>
                    <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Total Debits
                      </Typography>
                      <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
                        {formatCurrency(totalDebits)}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Total Credits
                      </Typography>
                      <Typography variant="h6" sx={{ fontFamily: 'monospace' }}>
                        {formatCurrency(totalCredits)}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Difference
                      </Typography>
                      <Typography
                        variant="h6"
                        sx={{
                          fontFamily: 'monospace',
                          color: isBalanced ? 'success.main' : 'error.main',
                        }}
                      >
                        {formatCurrency(Math.abs(difference))}
                      </Typography>
                    </Box>
                  </Grid>
                  <Grid item xs={12} md={3}>
                    <Box sx={{ p: 2, bgcolor: isBalanced ? 'success.50' : 'error.50', borderRadius: 1 }}>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        Status
                      </Typography>
                      <Chip
                        label={isBalanced ? 'Balanced' : 'Not Balanced'}
                        color={isBalanced ? 'success' : 'error'}
                        size="small"
                      />
                    </Box>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Action Buttons */}
          <Grid item xs={12}>
            <Stack direction="row" spacing={2} justifyContent="flex-end">
              <Button variant="outlined" onClick={handleBack} disabled={submitting}>
                Cancel
              </Button>
              <Button
                variant="contained"
                color="primary"
                startIcon={<SaveIcon />}
                type="submit"
                disabled={submitting || !isBalanced}
                onClick={() => setShouldPost(false)}
              >
                {submitting ? 'Saving...' : isEditMode ? 'Update Draft' : 'Save as Draft'}
              </Button>
              {!isEditMode && (
                <Button
                  variant="contained"
                  color="success"
                  startIcon={<PostIcon />}
                  type="submit"
                  disabled={submitting || !isBalanced}
                  onClick={() => setShouldPost(true)}
                >
                  {submitting ? 'Saving...' : 'Save and Post'}
                </Button>
              )}
            </Stack>
          </Grid>
        </Grid>
      </form>
    </Box>
  )
}

export default JournalEntryFormPage
