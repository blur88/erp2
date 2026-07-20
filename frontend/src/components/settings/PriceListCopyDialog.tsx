import React, { useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Typography,
} from '@mui/material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useNotification } from '@/hooks/useNotification'
import { useCopyPriceListMutation } from '@/store/api/priceListApi'
import type { PriceList } from '@/types'
import { toDateInputValue } from '@/utils/formatters'

// Form validation schema
const copyPriceListSchema = yup.object({
  code: yup
    .string()
    .required('Code is required')
    .max(50, 'Code must be less than 50 characters')
    .matches(/^[a-zA-Z0-9_-]+$/, 'Code can only contain letters, numbers, underscores, and hyphens'),
  name: yup.string().required('Name is required').max(200, 'Name must be less than 200 characters'),
  description: yup
    .string()
    .optional()
    .nullable()
    .transform((value) => value?.trim() || null),
  effectiveFrom: yup
    .string()
    .optional()
    .nullable()
    .transform((value) => value?.trim() || null),
  effectiveTo: yup
    .string()
    .optional()
    .nullable()
    .transform((value) => value?.trim() || null),
})

interface CopyPriceListFormData {
  code: string
  name: string
  description?: string | null
  effectiveFrom?: string | null
  effectiveTo?: string | null
}

interface PriceListCopyDialogProps {
  open: boolean
  priceList: PriceList | null
  onClose: () => void
  onSuccess: () => void
}

const PriceListCopyDialog: React.FC<PriceListCopyDialogProps> = ({ open, priceList, onClose, onSuccess }) => {
  const { showError } = useNotification()
  const [copyPriceList] = useCopyPriceListMutation()
  const [submitting, setSubmitting] = React.useState(false)

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CopyPriceListFormData>({
    resolver: yupResolver(copyPriceListSchema) as any,
    defaultValues: {
      code: '',
      name: '',
      description: null,
      effectiveFrom: null,
      effectiveTo: null,
    },
  })

  // Reset form when priceList changes or dialog opens
  useEffect(() => {
    if (open && priceList) {
      reset({
        code: `${priceList.code}_COPY`,
        name: `${priceList.name} (Copy)`,
        description: priceList.description || null,
        effectiveFrom: priceList.effectiveFrom
          ? toDateInputValue(priceList.effectiveFrom)
          : null,
        effectiveTo: priceList.effectiveTo ? toDateInputValue(priceList.effectiveTo) : null,
      })
    }
  }, [priceList, open, reset])

  const onSubmit = async (data: CopyPriceListFormData) => {
    if (!priceList) return

    try {
      setSubmitting(true)

      // Prepare data
      const submitData: any = {
        code: data.code,
        name: data.name,
        description: data.description?.trim() || undefined,
        effectiveFrom: data.effectiveFrom || undefined,
        effectiveTo: data.effectiveTo || undefined,
      }

      await copyPriceList({ priceListId: priceList.id, data: submitData }).unwrap()
      onSuccess()
    } catch (err: any) {
      console.error('Failed to copy price list:', err)
      showError(err.response?.data?.message || err.message || 'Failed to copy price list')
    } finally {
      setSubmitting(false)
    }
  }

  const handleClose = () => {
    if (!submitting) {
      onClose()
    }
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Copy Price List</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent dividers>
          <Typography
            variant="body2"
            sx={{
              color: "text.secondary",
              mb: 3
            }}>
            Create a copy of "{priceList?.name}" with all its items. You can modify the details below.
          </Typography>

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
                    error={!!errors.code}
                    helperText={errors.code?.message || 'Unique identifier for the new price list'}
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

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="effectiveFrom"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value || ''}
                    fullWidth
                    label="Effective From"
                    type="date"
                    slotProps={{
                      inputLabel: {
                        shrink: true,
                      },
                    }}
                    error={!!errors.effectiveFrom}
                    helperText={errors.effectiveFrom?.message}
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="effectiveTo"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value || ''}
                    fullWidth
                    label="Effective To"
                    type="date"
                    slotProps={{
                      inputLabel: {
                        shrink: true,
                      },
                    }}
                    error={!!errors.effectiveTo}
                    helperText={errors.effectiveTo?.message}
                  />
                )}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'Copying...' : 'Copy Price List'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default PriceListCopyDialog
