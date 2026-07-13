import { useEffect } from 'react'
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  MenuItem,
  TextField,
} from '@mui/material'
import { Controller, useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'

import { useNotification } from '@/hooks/useNotification'
import { useCreateAccountMutation, useUpdateAccountMutation } from '@/store/api/accountingApi'
import type { Account, AccountTreeNode, AccountType } from '@/types'

const ACCOUNT_TYPES: { value: AccountType; label: string }[] = [
  { value: 'Asset', label: 'Asset' },
  { value: 'Liability', label: 'Liability' },
  { value: 'Equity', label: 'Equity' },
  { value: 'Income', label: 'Income' },
  { value: 'Expense', label: 'Expense' },
]

function flattenForParent(tree: AccountTreeNode[]): { id: string; name: string; depth: number }[] {
  const result: { id: string; name: string; depth: number }[] = []
  const walk = (nodes: AccountTreeNode[], depth: number) => {
    for (const node of nodes) {
      result.push({ id: node.id, name: node.name, depth })
      if (node.children.length > 0) {
        walk(node.children, depth + 1)
      }
    }
  }
  walk(tree, 0)
  return result
}

interface AccountFormData {
  code: string
  name: string
  type: AccountType
  parentId: string
  openingBalance: string
  description: string
}

interface AccountFormDialogProps {
  open: boolean
  account: AccountTreeNode | null
  // Set when the form was opened from a group row's "Add Child Account": prefills
  // the parent and inherits its type. The backend rejects a child whose type
  // differs from its parent, so the two must be seeded together.
  parent?: AccountTreeNode | null
  tree: AccountTreeNode[]
  onClose: () => void
  onSuccess: () => void
}

const accountSchema = yup.object({
  code: yup.string().required('Code is required').max(20, 'Code must be 20 characters or less'),
  name: yup.string().required('Name is required').max(120, 'Name must be 120 characters or less'),
  type: yup.string().oneOf(ACCOUNT_TYPES.map((t) => t.value)).required('Type is required'),
  parentId: yup.string().nullable().default(''),
  openingBalance: yup.string().nullable().default(''),
  description: yup.string().nullable().default(''),
})

export default function AccountFormDialog({ open, account, parent = null, tree, onClose, onSuccess }: AccountFormDialogProps) {
  const { showError } = useNotification()
  const [createAccount] = useCreateAccountMutation()
  const [updateAccount] = useUpdateAccountMutation()

  const isEdit = !!account

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AccountFormData>({
    resolver: yupResolver(accountSchema) as any,
    defaultValues: { code: '', name: '', type: 'Asset', parentId: '', openingBalance: '', description: '' },
  })

  useEffect(() => {
    if (open) {
      if (account) {
        reset({
          code: account.code,
          name: account.name,
          type: account.type,
          parentId: account.parentId ?? '',
          openingBalance: account.openingBalance,
          description: account.description ?? '',
        })
      } else {
        reset({
          code: '',
          name: '',
          // A child must share its parent's type — the backend rejects it otherwise.
          type: parent?.type ?? 'Asset',
          parentId: parent?.id ?? '',
          openingBalance: '',
          description: '',
        })
      }
    }
  }, [account, parent, open, reset])

  const parentOptions = flattenForParent(tree)

  const onSubmit = async (data: AccountFormData) => {
    try {
      const payload: Record<string, unknown> = {
        code: data.code,
        name: data.name,
        type: data.type,
        parentId: data.parentId || undefined,
        openingBalance: data.openingBalance || undefined,
        description: data.description?.trim() || undefined,
      }

      if (account) {
        await updateAccount({ id: account.id, data: payload as any }).unwrap()
      } else {
        await createAccount(payload as any).unwrap()
      }
      onSuccess()
    } catch (err: any) {
      showError(err?.data?.message ?? err.message ?? 'Failed to save account')
    }
  }

  const handleClose = () => {
    onClose()
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>{isEdit ? 'Edit Account' : 'Add New Account'}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent dividers>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="code"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Code"
                    disabled={isEdit}
                    error={!!errors.code}
                    helperText={errors.code?.message}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Name"
                    error={!!errors.name}
                    helperText={errors.name?.message}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    select
                    label="Type"
                    // A child's type is dictated by its parent; letting the user
                    // change it here would guarantee a 400 on submit.
                    disabled={isEdit || !!parent}
                    error={!!errors.type}
                    helperText={parent ? `Inherited from ${parent.name}` : undefined}
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <MenuItem key={t.value} value={t.value}>
                        {t.label}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="parentId"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    select
                    label="Parent Account"
                    disabled={isEdit}
                    error={!!errors.parentId}
                  >
                    <MenuItem value="">(None — Top Level)</MenuItem>
                    {parentOptions.map((p) => (
                      <MenuItem key={p.id} value={p.id} sx={{ pl: 2 + p.depth * 2 }}>
                        {p.name}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="openingBalance"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Opening Balance"
                    type="number"
                    disabled={isEdit}
                    slotProps={{ htmlInput: { step: '0.0001' } }}
                    error={!!errors.openingBalance}
                    helperText={errors.openingBalance?.message || 'Initial balance amount'}
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
                    value={field.value || ''}
                    fullWidth
                    label="Description"
                    multiline
                    rows={3}
                    error={!!errors.description}
                    helperText={errors.description?.message}
                  />
                )}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button type="submit" variant="contained">
            {isEdit ? 'Update Account' : 'Create Account'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
