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
import PriceListSelector from '@/components/price-lists/PriceListSelector'
import { useFieldDuplicateCheck } from '@/hooks/useFieldDuplicateCheck'
import { useNotification } from '@/hooks/useNotification'
import api from '@/services/api'
import {
  useCreateCustomerMutation,
  useLazyGetCustomerBySlugQuery,
  useUpdateCustomerMutation,
} from '@/store/api/salesApi'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'

const customerSchema = yup.object({
  name: yup.string().required('Name is required').max(200, 'Name must be less than 200 characters'),
  type: yup.string().oneOf(['individual', 'business']).required('Type is required'),
  phone: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Phone must be less than 20 characters'),
  streetAddress: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(255, 'Street address must be less than 255 characters'),
  city: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'City must be less than 100 characters'),
  state: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'State must be less than 100 characters'),
  postalCode: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Postal code must be less than 20 characters'),
  country: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100, 'Country must be less than 100 characters'),
  priceListId: yup.string().optional().nullable(),
  notes: yup.string().optional().nullable().transform((value) => value?.trim() || null),
})

interface CustomerFormData {
  name: string
  type: CustomerType
  phone?: string | null
  streetAddress?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  priceListId?: string | null
  notes?: string | null
}

const fieldSx = {
  '& .MuiInputBase-input': { fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
}

const CustomerFormPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const isEdit = !!slug

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loadingCustomer, setLoadingCustomer] = useState(isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [fetchCustomerBySlug] = useLazyGetCustomerBySlugQuery()
  const [createCustomer, { isLoading: isCreating }] = useCreateCustomerMutation()
  const [updateCustomer, { isLoading: isUpdating }] = useUpdateCustomerMutation()
  const isSaving = isCreating || isUpdating

  const { control, handleSubmit, reset, watch, formState: { errors } } = useForm<CustomerFormData>({
    resolver: yupResolver(customerSchema) as any,
    defaultValues: {
      name: '',
      type: CustomerType.BUSINESS,
      phone: null,
      streetAddress: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      priceListId: null,
      notes: null,
    },
  })

  const watchedPhone = watch('phone')

  useEffect(() => {
    if (!slug) {
      return
    }

    setLoadingCustomer(true)

    fetchCustomerBySlug(slug)
      .unwrap()
      .then((currentCustomer) => {
        setCustomer(currentCustomer)
        reset({
          name: currentCustomer.name,
          type: currentCustomer.type,
          phone: currentCustomer.phone || null,
          streetAddress: currentCustomer.billingStreetAddress || null,
          city: currentCustomer.billingCity || null,
          state: currentCustomer.billingState || null,
          postalCode: currentCustomer.billingPostalCode || null,
          country: currentCustomer.billingCountry || null,
          priceListId: currentCustomer.priceListId || null,
          notes: currentCustomer.notes || null,
        })
      })
      .catch(() => setLoadError('Customer not found.'))
      .finally(() => setLoadingCustomer(false))
  }, [fetchCustomerBySlug, reset, slug])

  const phoneCheckFn = useCallback(async (phone: string, excludeId?: string) => {
    const normalizedPhone = phone.replace(/[\s\-\(\)\+]/g, '')
    const [activeResponse, deletedResponse] = await Promise.all([
      api.get('/customers', { params: { search: phone } }),
      api.get('/customers/deleted', { params: { search: phone } }),
    ])
    const allCustomers = [
      ...(activeResponse.data?.data || []),
      ...(deletedResponse.data?.data || []),
    ]
    const duplicateCustomer = allCustomers.find((current: Customer) => {
      if (!current.phone) {
        return false
      }

      return current.phone.replace(/[\s\-\(\)\+]/g, '') === normalizedPhone && current.id !== excludeId
    })

    return {
      exists: !!duplicateCustomer,
      message: duplicateCustomer
        ? `Phone already exists for customer: ${duplicateCustomer.name}`
        : undefined,
    }
  }, [])

  const {
    isChecking: isCheckingPhone,
    hasDuplicate: hasPhoneDuplicate,
    hasChecked: hasCheckedPhone,
    error: phoneError,
    successMessage: phoneSuccess,
  } = useFieldDuplicateCheck(watchedPhone ?? '', phoneCheckFn, {
    excludeId: customer?.id,
    skipCheck: !watchedPhone,
  })

  const handleFormSubmit = async (data: CustomerFormData) => {
    if (hasPhoneDuplicate) {
      showError(phoneError ?? 'Phone number already exists')
      return
    }

    const cleanedData = {
      ...data,
      phone: data.phone?.trim() || null,
      streetAddress: data.streetAddress?.trim() || null,
      city: data.city?.trim() || null,
      state: data.state?.trim() || null,
      postalCode: data.postalCode?.trim() || null,
      country: data.country?.trim() || null,
      notes: data.notes?.trim() || null,
    }

    try {
      let savedCustomer: Customer
      if (isEdit && customer?.id) {
        savedCustomer = await updateCustomer({ id: customer.id, data: cleanedData }).unwrap()
        showSuccess('Customer updated successfully')
      } else {
        savedCustomer = await createCustomer(cleanedData).unwrap()
        showSuccess('Customer created successfully')
      }

      navigate(`/sales/customers?highlight=${savedCustomer.id}`)
    } catch (error) {
      showError(`Failed to ${isEdit ? 'update' : 'create'} customer: ${error}`)
    }
  }

  if (loadingCustomer) {
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
        title={isEdit ? 'Edit Customer' : 'New Customer'}
        subtitle={isEdit ? `Editing ${customer?.name ?? ''}` : 'Add a new customer to your account'}
        variant="workflow"
        backAction={() => navigate('/sales/customers')}
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
                          <InputLabel>Customer Type</InputLabel>
                          <Select {...field} label="Customer Type">
                            <MenuItem value={CustomerType.INDIVIDUAL}>Individual</MenuItem>
                            <MenuItem value={CustomerType.BUSINESS}>Business</MenuItem>
                          </Select>
                        </FormControl>
                      )}
                    />
                  </Grid>

                  <Grid size={12}>
                    <Controller
                      name="name"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          fullWidth
                          size="small"
                          label="Customer Name"
                          error={!!errors.name}
                          helperText={errors.name?.message}
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
                          error={!!errors.phone || hasPhoneDuplicate}
                          helperText={
                            errors.phone?.message
                            || phoneError
                            || (hasCheckedPhone && !hasPhoneDuplicate ? phoneSuccess : '')
                          }
                          slotProps={{
                            input: {
                              endAdornment: isCheckingPhone ? (
                                <InputAdornment position="end">
                                  <CircularProgress size={16} />
                                </InputAdornment>
                              ) : undefined,
                            },
                          }}
                          sx={{
                            ...fieldSx,
                            '& .MuiFormHelperText-root': {
                              color: hasPhoneDuplicate
                                ? 'error.main'
                                : hasCheckedPhone && !hasPhoneDuplicate
                                  ? 'success.main'
                                  : undefined,
                            },
                          }}
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
                  name="priceListId"
                  control={control}
                  render={({ field }) => (
                    <PriceListSelector
                      value={field.value}
                      onChange={(value) => field.onChange(value)}
                      error={errors.priceListId?.message}
                      label="Price List"
                    />
                  )}
                />

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
                      sx={{ mt: 2, mb: 2, ...fieldSx }}
                    />
                  )}
                />

                <Box sx={{ mt: 'auto', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <AppButton
                    variant="secondary"
                    fullWidth
                    onClick={() => navigate('/sales/customers')}
                    disabled={isSaving}
                  >
                    Cancel
                  </AppButton>

                  <AppButton
                    variant="primary"
                    type="submit"
                    fullWidth
                    disabled={isSaving || hasPhoneDuplicate || isCheckingPhone}
                  >
                    {isSaving
                      ? (isEdit ? 'Updating...' : 'Creating...')
                      : (isEdit ? 'Update Customer' : 'Create Customer')}
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

export default CustomerFormPage
