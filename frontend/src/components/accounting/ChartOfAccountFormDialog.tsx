import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Typography,
  Box,
} from '@mui/material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useDispatch, useSelector } from 'react-redux'
import { useNotification } from '@/hooks/useNotification'
import {
  createAccount,
  updateAccount,
  selectChartOfAccounts,
  type ChartOfAccount,
} from '@/store/slices/chartOfAccountsSlice'

interface ChartOfAccountFormDialogProps {
  open: boolean
  account: ChartOfAccount | null
  onClose: () => void
  onSuccess: () => void
}

interface FormData {
  code: string
  name: string
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense'
  parentId?: string | null
  description?: string
  isActive: boolean
}

const accountSchema = yup.object({
  code: yup.string().required('Account code is required').min(2, 'Code must be at least 2 characters'),
  name: yup.string().required('Account name is required').min(2, 'Name must be at least 2 characters'),
  type: yup.string().required('Account type is required').oneOf(['asset', 'liability', 'equity', 'revenue', 'expense'], 'Invalid account type'),
  parentId: yup.string().optional().nullable(),
  description: yup.string().optional(),
  isActive: yup.boolean().required(),
})

const ChartOfAccountFormDialog: React.FC<ChartOfAccountFormDialogProps> = ({
  open,
  account,
  onClose,
  onSuccess,
}) => {
  const dispatch = useDispatch() as any
  const { showSuccess, showError } = useNotification()
  const accounts = useSelector(selectChartOfAccounts) || []
  const [submitting, setSubmitting] = useState(false)

  const {
    control,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: yupResolver(accountSchema) as any,
    defaultValues: {
      code: '',
      name: '',
      type: 'asset',
      parentId: null,
      description: '',
      isActive: true,
    },
  })

  const watchedType = watch('type')

  // Reset form when dialog opens or account changes
  useEffect(() => {
    if (open) {
      if (account) {
        reset({
          code: account.code,
          name: account.name,
          type: account.type,
          parentId: account.parentId || null,
          description: account.description || '',
          isActive: account.isActive,
        })
      } else {
        reset({
          code: '',
          name: '',
          type: 'asset',
          parentId: null,
          description: '',
          isActive: true,
        })
      }
    }
  }, [open, account, reset])

  const onSubmit = async (data: FormData) => {
    try {
      setSubmitting(true)

      const accountData = {
        ...data,
        parentId: data.parentId || null,
        description: data.description || '',
      }

      if (account) {
        await dispatch(updateAccount({ id: account.id, data: accountData })).unwrap()
        showSuccess('Account updated successfully')
      } else {
        await dispatch(createAccount(accountData)).unwrap()
        showSuccess('Account created successfully')
      }

      onSuccess()
    } catch (error: any) {
      console.error('Account save error:', error)

      if (error?.includes?.('unique') || error?.includes?.('duplicate')) {
        showError('An account with this code already exists. Please choose a different code.')
      } else {
        showError(error || 'Failed to save account')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const getAvailableParentAccounts = () => {
    // Filter accounts of the same type and exclude the current account (for edit mode)
    return accounts.filter(acc => {
      // Same type as selected
      if (acc.type !== watchedType) return false

      // Exclude current account in edit mode
      if (account && acc.id === account.id) return false

      // Exclude children of current account (to prevent circular references)
      if (account) {
        let current = acc
        while (current.parentId) {
          if (current.parentId === account.id) return false
          const parent = accounts.find(a => a.id === current.parentId)
          if (!parent) break
          current = parent
        }
      }

      return true
    })
  }

  const parentAccounts = getAvailableParentAccounts()

  const getAccountTypeDescription = (type: string) => {
    switch (type) {
      case 'asset':
        return 'Resources owned by the company (Cash, Inventory, Equipment)'
      case 'liability':
        return 'Obligations owed to others (Loans, Accounts Payable)'
      case 'equity':
        return "Owner's stake in the company (Capital, Retained Earnings)"
      case 'revenue':
        return 'Income from business activities (Sales, Services)'
      case 'expense':
        return 'Costs incurred in operations (Salaries, Rent, Utilities)'
      default:
        return ''
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        {account ? 'Edit Account' : 'Add New Account'}
      </DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          <Grid container spacing={3} sx={{ mt: 0.5 }}>
            <Grid size={6}>
              <Controller
                name="code"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Account Code"
                    error={!!errors.code}
                    helperText={errors.code?.message}
                    placeholder="e.g., 1000, 2000, 4000"
                  />
                )}
              />
            </Grid>
            <Grid size={6}>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.type}>
                    <InputLabel>Account Type</InputLabel>
                    <Select
                      {...field}
                      label="Account Type"
                    >
                      <MenuItem value="asset">Asset</MenuItem>
                      <MenuItem value="liability">Liability</MenuItem>
                      <MenuItem value="equity">Equity</MenuItem>
                      <MenuItem value="revenue">Revenue</MenuItem>
                      <MenuItem value="expense">Expense</MenuItem>
                    </Select>
                    {errors.type && (
                      <Typography variant="caption" color="error" sx={{ mt: 0.5, ml: 1.75 }}>
                        {errors.type.message}
                      </Typography>
                    )}
                  </FormControl>
                )}
              />
            </Grid>

            {watchedType && (
              <Grid size={12}>
                <Box sx={{
                  p: 1.5,
                  borderRadius: 1,
                  bgcolor: 'info.lighter',
                  border: '1px solid',
                  borderColor: 'info.light'
                }}>
                  <Typography variant="caption" color="info.dark">
                    {getAccountTypeDescription(watchedType)}
                  </Typography>
                </Box>
              </Grid>
            )}

            <Grid size={12}>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Account Name"
                    error={!!errors.name}
                    helperText={errors.name?.message}
                    placeholder="e.g., Cash in Bank, Sales Revenue"
                  />
                )}
              />
            </Grid>

            <Grid size={12}>
              <Controller
                name="parentId"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth>
                    <InputLabel>Parent Account (Optional)</InputLabel>
                    <Select
                      {...field}
                      value={field.value || ''}
                      onChange={(e) => field.onChange(e.target.value || null)}
                      label="Parent Account (Optional)"
                    >
                      <MenuItem value="">
                        <em>None (Root Account)</em>
                      </MenuItem>
                      {parentAccounts.map((acc) => (
                        <MenuItem key={acc.id} value={acc.id}>
                          {acc.code} - {acc.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
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
                    label="Description (Optional)"
                    multiline
                    rows={3}
                    placeholder="Add a description for this account"
                  />
                )}
              />
            </Grid>

            <Grid size={12}>
              <Controller
                name="isActive"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={field.value}
                        onChange={(e) => field.onChange(e.target.checked)}
                      />
                    }
                    label="Active (Enable for transactions)"
                  />
                )}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={submitting}
          >
            {submitting ? 'Saving...' : account ? 'Update' : 'Create'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default ChartOfAccountFormDialog
