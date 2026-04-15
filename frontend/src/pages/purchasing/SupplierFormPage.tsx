import React, { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, Controller, type Control, type FieldErrors } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'

import PageHeader from '@/components/common/PageHeader'
import { useNotification } from '@/hooks/useNotification'
import api from '@/services/api'
import {
  useCreateSupplierMutation,
  useLazyCheckDuplicateCompanyNameQuery,
  useUpdateSupplierMutation,
} from '@/store/api/purchasingApi'
import type { Supplier } from '@/types'
import { SupplierType } from '@/types'

const supplierSchema = yup.object({
  companyName: yup.string().required('Company name is required').max(200, 'Name must be less than 200 characters'),
  type: yup.string().oneOf(['local', 'international']).required('Type is required'),
  contactPerson: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(200, 'Name must be less than 200 characters'),
  phone: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Phone must be less than 20 characters'),
  streetAddress: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(255, 'Street address must be less than 255 characters'),
  city: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'City must be less than 100 characters'),
  state: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'State must be less than 100 characters'),
  postalCode: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Postal code must be less than 20 characters'),
  country: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'Country must be less than 100 characters'),
  notes: yup.string().optional().nullable().transform((value) => value?.trim() || null),
})

interface SupplierFormData {
  companyName: string
  type: SupplierType
  contactPerson?: string | null
  phone?: string | null
  streetAddress?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  notes?: string | null
}

interface SupplierAddressSectionProps {
  control: Control<SupplierFormData>
  errors: FieldErrors<SupplierFormData>
}

const SupplierAddressSection: React.FC<SupplierAddressSectionProps> = ({ control, errors }) => (
  <>
    <Grid size={12}>
      <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>Address Information</Typography>
    </Grid>

    <Grid size={12}>
      <Controller
        name="streetAddress"
        control={control}
        render={({ field }) => (
          <TextField
            {...field}
            value={field.value || ''}
            fullWidth
            label="Street Address"
            error={!!errors.streetAddress}
            helperText={errors.streetAddress?.message}
          />
        )}
      />
    </Grid>

    <Grid size={{ xs: 12, md: 6 }}>
      <Controller
        name="city"
        control={control}
        render={({ field }) => (
          <TextField {...field} value={field.value || ''} fullWidth label="City" error={!!errors.city} helperText={errors.city?.message} />
        )}
      />
    </Grid>

    <Grid size={{ xs: 12, md: 6 }}>
      <Controller
        name="state"
        control={control}
        render={({ field }) => (
          <TextField {...field} value={field.value || ''} fullWidth label="State" error={!!errors.state} helperText={errors.state?.message} />
        )}
      />
    </Grid>

    <Grid size={{ xs: 12, md: 6 }}>
      <Controller
        name="postalCode"
        control={control}
        render={({ field }) => (
          <TextField {...field} value={field.value || ''} fullWidth label="Postal Code" error={!!errors.postalCode} helperText={errors.postalCode?.message} />
        )}
      />
    </Grid>

    <Grid size={{ xs: 12, md: 6 }}>
      <Controller
        name="country"
        control={control}
        render={({ field }) => (
          <TextField {...field} value={field.value || ''} fullWidth label="Country" error={!!errors.country} helperText={errors.country?.message} />
        )}
      />
    </Grid>
  </>
)

interface SupplierFormActionsProps {
  disabled: boolean
  isEdit: boolean
  isSaving: boolean
  onCancel: () => void
}

const SupplierFormActions: React.FC<SupplierFormActionsProps> = ({
  disabled,
  isEdit,
  isSaving,
  onCancel,
}) => (
  <Grid size={12}>
    <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', pt: 1 }}>
      <Button onClick={onCancel}>Cancel</Button>
      <Button type="submit" variant="contained" disabled={disabled}>
        {isSaving ? <CircularProgress size={20} /> : (isEdit ? 'Update' : 'Create')}
      </Button>
    </Box>
  </Grid>
)

const SupplierFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const isEdit = !!id

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [loadingSupplier, setLoadingSupplier] = useState(isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [companyNameError, setCompanyNameError] = useState<string | null>(null)
  const [isCheckingDuplicate, setIsCheckingDuplicate] = useState(false)

  const [createSupplier, { isLoading: isCreating }] = useCreateSupplierMutation()
  const [updateSupplier, { isLoading: isUpdating }] = useUpdateSupplierMutation()
  const [checkDuplicateCompanyName] = useLazyCheckDuplicateCompanyNameQuery()
  const isSaving = isCreating || isUpdating

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<SupplierFormData>({
    resolver: yupResolver(supplierSchema) as any,
    defaultValues: {
      companyName: '',
      type: SupplierType.LOCAL,
      contactPerson: null,
      phone: null,
      streetAddress: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      notes: null,
    },
  })

  const companyName = watch('companyName')

  useEffect(() => {
    if (!id) return

    setLoadingSupplier(true)
    api.get(`/purchasing/suppliers/${id}`)
      .then((res) => {
        const currentSupplier: Supplier = res.data?.data ?? res.data
        setSupplier(currentSupplier)
        reset({
          companyName: currentSupplier.companyName,
          type: currentSupplier.type,
          contactPerson: currentSupplier.contactPerson || null,
          phone: currentSupplier.phone || null,
          streetAddress: currentSupplier.streetAddress || null,
          city: currentSupplier.city || null,
          state: currentSupplier.state || null,
          postalCode: currentSupplier.postalCode || null,
          country: currentSupplier.country || null,
          notes: currentSupplier.notes || null,
        })
      })
      .catch(() => setLoadError('Supplier not found.'))
      .finally(() => setLoadingSupplier(false))
  }, [id, reset])

  useEffect(() => {
    if (supplier && companyName === supplier.companyName) {
      setCompanyNameError(null)
      setIsCheckingDuplicate(false)
      return
    }

    const check = async () => {
      if (!companyName || companyName.trim().length < 2) {
        setCompanyNameError(null)
        return
      }

      setIsCheckingDuplicate(true)
      try {
        const result = await checkDuplicateCompanyName({
          companyName: companyName.trim(),
          excludeId: supplier?.id,
        }).unwrap()
        setCompanyNameError(result?.exists ? (result.message || 'This company name already exists') : null)
      } catch {
        setCompanyNameError(null)
      } finally {
        setIsCheckingDuplicate(false)
      }
    }

    const timer = setTimeout(check, 500)
    return () => clearTimeout(timer)
  }, [companyName, supplier, checkDuplicateCompanyName])

  const handleFormSubmit = async (data: SupplierFormData) => {
    if (companyNameError) {
      showError(companyNameError)
      return
    }

    const cleanedData = {
      ...data,
      contactPerson: data.contactPerson?.trim() || null,
      phone: data.phone?.trim() || null,
      streetAddress: data.streetAddress?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim() || null,
      postalCode: data.postalCode?.trim() || null,
      country: data.country?.trim() || null,
      notes: data.notes?.trim() || null,
    }

    try {
      if (isEdit && id) {
        await updateSupplier({ id, data: cleanedData }).unwrap()
        showSuccess('Supplier updated successfully')
      } else {
        await createSupplier(cleanedData).unwrap()
        showSuccess('Supplier created successfully')
      }
      navigate('/purchasing/suppliers')
    } catch (error: any) {
      showError(`Failed to ${isEdit ? 'update' : 'create'} supplier: ${error?.message ?? error}`)
    }
  }

  if (loadingSupplier) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (loadError) {
    return <Alert severity="error">{loadError}</Alert>
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit Supplier' : 'New Supplier'}
        subtitle={isEdit ? `Editing ${supplier?.companyName ?? ''}` : 'Add a new supplier to your account'}
        variant="standard"
      />
      <Paper sx={{ p: 3, maxWidth: 800 }}>
        <form onSubmit={handleSubmit(handleFormSubmit)}>
          <Grid container spacing={2}>
            <Grid size={12}>
              <Typography variant="h6" gutterBottom>Basic Information</Typography>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="type"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.type}>
                    <InputLabel>Supplier Type</InputLabel>
                    <Select {...field} label="Supplier Type">
                      <MenuItem value={SupplierType.LOCAL}>Local</MenuItem>
                      <MenuItem value={SupplierType.INTERNATIONAL}>International</MenuItem>
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>

            <Grid size={12}>
              <Controller
                name="companyName"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Company Name"
                    error={!!errors.companyName || !!companyNameError}
                    helperText={errors.companyName?.message || companyNameError || (isCheckingDuplicate ? 'Checking availability...' : '')}
                    slotProps={{
                      input: {
                        endAdornment: isCheckingDuplicate ? <CircularProgress size={20} /> : null,
                      },
                    }}
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="contactPerson"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value || ''}
                    fullWidth
                    label="Contact Person"
                    error={!!errors.contactPerson}
                    helperText={errors.contactPerson?.message}
                  />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="phone"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value || ''}
                    fullWidth
                    label="Phone"
                    error={!!errors.phone}
                    helperText={errors.phone?.message}
                  />
                )}
              />
            </Grid>

            <SupplierAddressSection control={control} errors={errors} />

            <Grid size={12}>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    value={field.value || ''}
                    fullWidth
                    multiline
                    rows={3}
                    label="Notes"
                    error={!!errors.notes}
                    helperText={errors.notes?.message}
                  />
                )}
              />
            </Grid>

            <SupplierFormActions
              disabled={isSaving || isCheckingDuplicate || !!companyNameError}
              isEdit={isEdit}
              isSaving={isSaving}
              onCancel={() => navigate('/purchasing/suppliers')}
            />
          </Grid>
        </form>
      </Paper>
    </>
  )
}

export default SupplierFormPage
