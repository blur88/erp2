import React, { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import { useNavigate, useParams } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'

import AddressSection from '@/components/common/AddressSection'
import { AppButton } from '@/components/common/AppButton'
import PageHeader from '@/components/common/PageHeader'
import { useFieldDuplicateCheck } from '@/hooks/useFieldDuplicateCheck'
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

const fieldSx = {
  '& .MuiInputBase-input': { fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
}

const SupplierFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const isEdit = !!id

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [loadingSupplier, setLoadingSupplier] = useState(isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)

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

  const watchedCompanyName = watch('companyName')

  useEffect(() => {
    if (!id) {
      return
    }

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

  const companyNameCheckFn = useCallback(async (name: string, excludeId?: string) => {
    const result = await checkDuplicateCompanyName({ companyName: name, excludeId }).unwrap()

    return {
      exists: result?.exists ?? false,
      message: result?.message,
    }
  }, [checkDuplicateCompanyName])

  const {
    isChecking: isCheckingDuplicate,
    hasDuplicate: hasCompanyNameDuplicate,
    hasChecked: hasCheckedCompanyName,
    error: companyNameError,
    successMessage: companyNameSuccess,
  } = useFieldDuplicateCheck(watchedCompanyName ?? '', companyNameCheckFn, {
    excludeId: supplier?.id,
    skipCheck: supplier ? watchedCompanyName === supplier.companyName : false,
  })

  const handleFormSubmit = async (data: SupplierFormData) => {
    if (hasCompanyNameDuplicate) {
      showError(companyNameError ?? 'Company name already exists')
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
        variant="workflow"
        backAction={() => navigate('/purchasing/suppliers')}
      />

      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 8 }}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Basic Information</Typography>

                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Controller
                      name="type"
                      control={control}
                      render={({ field }) => (
                        <FormControl fullWidth size="small" error={!!errors.type} sx={fieldSx}>
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
                          size="small"
                          label="Company Name"
                          error={!!errors.companyName || hasCompanyNameDuplicate}
                          helperText={
                            errors.companyName?.message
                            || companyNameError
                            || (hasCheckedCompanyName && !hasCompanyNameDuplicate ? companyNameSuccess : '')
                          }
                          slotProps={{
                            input: {
                              endAdornment: isCheckingDuplicate ? (
                                <InputAdornment position="end">
                                  <CircularProgress size={16} />
                                </InputAdornment>
                              ) : undefined,
                            },
                          }}
                          sx={{
                            ...fieldSx,
                            '& .MuiFormHelperText-root': {
                              color: hasCompanyNameDuplicate
                                ? 'error.main'
                                : hasCheckedCompanyName && !hasCompanyNameDuplicate
                                  ? 'success.main'
                                  : undefined,
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
                          size="small"
                          label="Contact Person"
                          error={!!errors.contactPerson}
                          helperText={errors.contactPerson?.message}
                          sx={fieldSx}
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
                          size="small"
                          label="Phone"
                          error={!!errors.phone}
                          helperText={errors.phone?.message}
                          sx={fieldSx}
                        />
                      )}
                    />
                  </Grid>

                  <AddressSection control={control} errors={errors} />
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 4 }}>
            <Card sx={{ height: '100%' }}>
              <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                <Controller
                  name="notes"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      value={field.value || ''}
                      fullWidth
                      multiline
                      rows={6}
                      size="small"
                      label="Notes"
                      error={!!errors.notes}
                      helperText={errors.notes?.message}
                      sx={{ mb: 2, ...fieldSx }}
                    />
                  )}
                />

                <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <AppButton
                    variant="secondary"
                    fullWidth
                    onClick={() => navigate('/purchasing/suppliers')}
                    disabled={isSaving}
                  >
                    Cancel
                  </AppButton>

                  <AppButton
                    variant="primary"
                    type="submit"
                    fullWidth
                    disabled={isSaving || isCheckingDuplicate || hasCompanyNameDuplicate}
                  >
                    {isSaving
                      ? (isEdit ? 'Updating...' : 'Creating...')
                      : (isEdit ? 'Update Supplier' : 'Create Supplier')}
                  </AppButton>
                </Box>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      </form>
    </>
  )
}

export default SupplierFormPage
