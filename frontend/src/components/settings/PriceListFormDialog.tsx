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
  FormControlLabel,
  Switch,
} from '@mui/material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useNotification } from '@/hooks/useNotification'
import { useCreatePriceListMutation, useUpdatePriceListMutation } from '@/store/api/priceListApi'
import type { PriceList } from '@/types'
import { toDateInputValue } from '@/utils/formatters'

// Form validation schema
const priceListSchema = yup.object({
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
  isDefault: yup.boolean().default(false),
  isActive: yup.boolean().default(true),
})

interface PriceListFormData {
  code: string
  name: string
  description?: string | null
  effectiveFrom?: string | null
  effectiveTo?: string | null
  isDefault: boolean
  isActive: boolean
}

interface PriceListFormDialogProps {
  open: boolean
  priceList: PriceList | null
  onClose: () => void
  onSuccess: () => void
}

const PriceListFormDialog: React.FC<PriceListFormDialogProps> = ({ open, priceList, onClose, onSuccess }) => {
  const { showError } = useNotification()
  const [createPriceList] = useCreatePriceListMutation()
  const [updatePriceList] = useUpdatePriceListMutation()
  const [submitting, setSubmitting] = React.useState(false)

  const isEdit = !!priceList

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<PriceListFormData>({
    resolver: yupResolver(priceListSchema) as any,
    defaultValues: {
      code: '',
      name: '',
      description: null,
      effectiveFrom: null,
      effectiveTo: null,
      isDefault: false,
      isActive: true,
    },
  })

  // Reset form when priceList changes or dialog opens
  useEffect(() => {
    if (open) {
      if (priceList) {
        reset({
          code: priceList.code,
          name: priceList.name,
          description: priceList.description || null,
          effectiveFrom: priceList.effectiveFrom
            ? toDateInputValue(priceList.effectiveFrom)
            : null,
          effectiveTo: priceList.effectiveTo ? toDateInputValue(priceList.effectiveTo) : null,
          isDefault: priceList.isDefault,
          isActive: priceList.isActive,
        })
      } else {
        reset({
          code: '',
          name: '',
          description: null,
          effectiveFrom: null,
          effectiveTo: null,
          isDefault: false,
          isActive: true,
        })
      }
    }
  }, [priceList, open, reset])

  const onSubmit = async (data: PriceListFormData) => {
    try {
      setSubmitting(true)

      // Prepare data
      const submitData: any = {
        code: data.code,
        name: data.name,
        description: data.description?.trim() || null,
        effectiveFrom: data.effectiveFrom || null,
        effectiveTo: data.effectiveTo || null,
        isDefault: data.isDefault,
        isActive: data.isActive,
      }

      if (priceList) {
        // Update existing price list
        await updatePriceList({ id: priceList.id, data: submitData }).unwrap()
      } else {
        // Create new price list
        await createPriceList(submitData).unwrap()
      }

      onSuccess()
    } catch (err: any) {
      console.error('Failed to save price list:', err)
      showError(err.response?.data?.message || err.message || 'Failed to save price list')
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
      <DialogTitle>{isEdit ? 'Edit Price List' : 'Add New Price List'}</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent dividers>
          <Grid container spacing={2}>
            {/* Basic Information */}
            <Grid size={12}>
              <Typography variant="h6" gutterBottom>
                Basic Information
              </Typography>
            </Grid>

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
                    helperText={errors.code?.message || 'Unique identifier for the price list'}
                    disabled={isEdit} // Code cannot be changed once created
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

            {/* Effective Dates */}
            <Grid size={12}>
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                Validity Period
              </Typography>
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
                    helperText={errors.effectiveFrom?.message || 'When this price list becomes active'}
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
                    helperText={errors.effectiveTo?.message || 'When this price list expires (optional)'}
                  />
                )}
              />
            </Grid>

            {/* Settings */}
            <Grid size={12}>
              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                Settings
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="isDefault"
                control={control}
                render={({ field }) => (
                  <FormControlLabel
                    control={<Switch {...field} checked={field.value} />}
                    label="Set as Default Price List"
                  />
                )}
              />
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "block",
                  ml: 4,
                  mt: -1
                }}>
                The default price list is used when no specific price list is assigned
              </Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="isActive"
                control={control}
                render={({ field }) => (
                  <FormControlLabel control={<Switch {...field} checked={field.value} />} label="Active" />
                )}
              />
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  display: "block",
                  ml: 4,
                  mt: -1
                }}>
                Inactive price lists cannot be used in transactions
              </Typography>
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={submitting}>
            {submitting ? 'Saving...' : isEdit ? 'Update Price List' : 'Create Price List'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

export default PriceListFormDialog
