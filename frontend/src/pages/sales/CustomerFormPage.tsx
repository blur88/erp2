import React, { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  FormControlLabel,
  Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from '@mui/material'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Controller, useForm } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'

import AddressSection from '@/components/common/AddressSection'
import { AppButton } from '@/components/common/AppButton'
import ConfirmationDialog from '@/components/common/ConfirmationDialog'
import PageHeader from '@/components/common/PageHeader'
import PriceListSelector from '@/components/price-lists/PriceListSelector'
import { useFieldDuplicateCheck } from '@/hooks/useFieldDuplicateCheck'
import { useNotification } from '@/hooks/useNotification'
import api from '@/services/api'
import {
  useCreateCustomerMutation,
  useLazyGetCustomerBySlugQuery,
  useRestoreCustomerMutation,
  useUpdateCustomerMutation,
} from '@/store/api/salesApi'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'

const customerSchema = yup.object({
  name: yup.string().required('Name is required').max(200, 'Name must be less than 200 characters'),
  type: yup.string().oneOf(['individual', 'business']).required('Type is required'),
  phone: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20, 'Phone must be less than 20 characters'),
  email: yup.string().optional().nullable().email('Invalid email address').transform((value) => value?.trim() || null).max(255, 'Email must be less than 255 characters'),
  billingStreetAddress: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(255),
  billingCity: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100),
  billingState: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100),
  billingPostalCode: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20),
  billingCountry: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100),
  shippingStreetAddress: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(255),
  shippingCity: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100),
  shippingState: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100),
  shippingPostalCode: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20),
  shippingCountry: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100),
  priceListId: yup.string().optional().nullable(),
  notes: yup.string().optional().nullable().transform((value) => value?.trim() || null),
})

interface CustomerFormData {
  name: string
  type: CustomerType
  phone?: string | null
  email?: string | null
  billingStreetAddress?: string | null
  billingCity?: string | null
  billingState?: string | null
  billingPostalCode?: string | null
  billingCountry?: string | null
  shippingStreetAddress?: string | null
  shippingCity?: string | null
  shippingState?: string | null
  shippingPostalCode?: string | null
  shippingCountry?: string | null
  priceListId?: string | null
  notes?: string | null
}

const fieldSx = {
  '& .MuiInputBase-input': { fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
}

interface DuplicateNameResult {
  exists: boolean
  isInactive?: boolean
  customer?: Customer
  message?: string
}

const CustomerFormPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { showSuccess, showError } = useNotification()
  const isEdit = !!slug

  const returnTo = (location.state as any)?.returnTo as string | undefined

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loadingCustomer, setLoadingCustomer] = useState(isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sameAsBilling, setSameAsBilling] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [duplicateNameResult, setDuplicateNameResult] = useState<DuplicateNameResult | null>(null)

  const [fetchCustomerBySlug] = useLazyGetCustomerBySlugQuery()
  const [createCustomer, { isLoading: isCreating }] = useCreateCustomerMutation()
  const [updateCustomer, { isLoading: isUpdating }] = useUpdateCustomerMutation()
  const [restoreCustomer, { isLoading: isRestoring }] = useRestoreCustomerMutation()
  const isSaving = isCreating || isUpdating

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<CustomerFormData>({
    resolver: yupResolver(customerSchema) as any,
    defaultValues: {
      name: '',
      type: CustomerType.BUSINESS,
      phone: null,
      email: null,
      billingStreetAddress: null,
      billingCity: null,
      billingState: null,
      billingPostalCode: null,
      billingCountry: null,
      shippingStreetAddress: null,
      shippingCity: null,
      shippingState: null,
      shippingPostalCode: null,
      shippingCountry: null,
      priceListId: null,
      notes: null,
    },
  })

  const watchedPhone = watch('phone')
  const watchedName = watch('name')
  const watchedBilling = watch([
    'billingStreetAddress',
    'billingCity',
    'billingState',
    'billingPostalCode',
    'billingCountry',
  ])

  useEffect(() => {
    if (!sameAsBilling) {
      return
    }

    setValue('shippingStreetAddress', watchedBilling[0])
    setValue('shippingCity', watchedBilling[1])
    setValue('shippingState', watchedBilling[2])
    setValue('shippingPostalCode', watchedBilling[3])
    setValue('shippingCountry', watchedBilling[4])
  }, [sameAsBilling, setValue, watchedBilling])

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
          email: currentCustomer.email || null,
          billingStreetAddress: currentCustomer.billingStreetAddress || null,
          billingCity: currentCustomer.billingCity || null,
          billingState: currentCustomer.billingState || null,
          billingPostalCode: currentCustomer.billingPostalCode || null,
          billingCountry: currentCustomer.billingCountry || null,
          shippingStreetAddress: currentCustomer.shippingStreetAddress || null,
          shippingCity: currentCustomer.shippingCity || null,
          shippingState: currentCustomer.shippingState || null,
          shippingPostalCode: currentCustomer.shippingPostalCode || null,
          shippingCountry: currentCustomer.shippingCountry || null,
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

  const nameCheckFn = useCallback(async (
    name: string,
    excludeId?: string,
  ): Promise<{ exists: boolean; message?: string }> => {
    const normalizedName = name.trim().toLowerCase()
    const [activeResponse, deletedResponse] = await Promise.all([
      api.get('/customers', { params: { search: name } }),
      api.get('/customers/deleted', { params: { search: name } }),
    ])
    const activeCustomers: Customer[] = activeResponse.data?.data || []
    const deletedCustomers: Customer[] = deletedResponse.data?.data || []

    const activeDuplicate = activeCustomers.find(
      (current) => current.name.trim().toLowerCase() === normalizedName && current.id !== excludeId,
    )
    if (activeDuplicate) {
      setDuplicateNameResult({ exists: true, isInactive: false, customer: activeDuplicate })
      return { exists: true, message: 'A customer with this name already exists' }
    }

    const inactiveDuplicate = deletedCustomers.find(
      (current) => current.name.trim().toLowerCase() === normalizedName && current.id !== excludeId,
    )
    if (inactiveDuplicate) {
      setDuplicateNameResult({ exists: true, isInactive: true, customer: inactiveDuplicate })
      return { exists: true, message: 'An inactive customer with this name exists' }
    }

    setDuplicateNameResult(null)
    return { exists: false }
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

  const {
    isChecking: isCheckingName,
    hasDuplicate: hasNameDuplicate,
  } = useFieldDuplicateCheck(watchedName ?? '', nameCheckFn, {
    excludeId: customer?.id,
    skipCheck: !watchedName || watchedName.length < 2,
  })

  useEffect(() => {
    if (!hasNameDuplicate) {
      setDuplicateNameResult(null)
    }
  }, [hasNameDuplicate])

  const handleCancel = () => {
    if (!isDirty) {
      navigate('/sales/customers')
      return
    }

    setShowDiscardDialog(true)
  }

  const handleReactivate = async () => {
    if (!duplicateNameResult?.customer) {
      return
    }

    try {
      await restoreCustomer(duplicateNameResult.customer.id).unwrap()
      showSuccess('Customer reactivated successfully')
      navigate('/sales/customers')
    } catch {
      showError('Failed to reactivate customer')
    }
  }

  const handleFormSubmit = async (data: CustomerFormData) => {
    if (hasPhoneDuplicate) {
      showError(phoneError ?? 'Phone number already exists')
      return
    }

    if (hasNameDuplicate) {
      showError('A customer with this name already exists')
      return
    }

    const cleanedData = {
      ...data,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      billingStreetAddress: data.billingStreetAddress?.trim() || null,
      billingCity: data.billingCity?.trim() || null,
      billingState: data.billingState?.trim() || null,
      billingPostalCode: data.billingPostalCode?.trim() || null,
      billingCountry: data.billingCountry?.trim() || null,
      shippingStreetAddress: data.shippingStreetAddress?.trim() || null,
      shippingCity: data.shippingCity?.trim() || null,
      shippingState: data.shippingState?.trim() || null,
      shippingPostalCode: data.shippingPostalCode?.trim() || null,
      shippingCountry: data.shippingCountry?.trim() || null,
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

      if (returnTo === 'sales-order') {
        navigate('/sales/sales-orders/create', {
          state: { preselectCustomerId: savedCustomer.id },
        })
      } else {
        navigate(`/sales/customers?highlight=${savedCustomer.id}`)
      }
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
        backAction={handleCancel}
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
                          required
                          error={!!errors.name || hasNameDuplicate}
                          helperText={errors.name?.message}
                          slotProps={{
                            input: {
                              endAdornment: isCheckingName ? (
                                <InputAdornment position="end">
                                  <CircularProgress size={16} />
                                </InputAdornment>
                              ) : undefined,
                            },
                          }}
                          sx={fieldSx}
                        />
                      )}
                    />

                    {hasNameDuplicate && duplicateNameResult?.isInactive === false && (
                      <Alert severity="warning" sx={{ mt: 1 }}>
                        A customer with this name already exists.
                      </Alert>
                    )}

                    {hasNameDuplicate && duplicateNameResult?.isInactive === true && (
                      <Alert
                        severity="info"
                        sx={{ mt: 1 }}
                        action={
                          <Button
                            size="small"
                            onClick={handleReactivate}
                            disabled={isRestoring}
                            startIcon={isRestoring ? <CircularProgress size={14} /> : undefined}
                          >
                            Reactivate
                          </Button>
                        }
                      >
                        This customer is inactive. Would you like to reactivate them?
                      </Alert>
                    )}
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

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Controller
                      name="email"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          value={field.value || ''}
                          fullWidth
                          size="small"
                          label="Email Address"
                          type="email"
                          error={!!errors.email}
                          helperText={errors.email?.message}
                          sx={fieldSx}
                        />
                      )}
                    />
                  </Grid>

                  <AddressSection
                    control={control}
                    errors={errors}
                    prefix="billing"
                    title="Billing Address"
                  />

                  <Grid size={12}>
                    <Box sx={{ display: 'flex', alignItems: 'center', mt: 2, mb: 0 }}>
                      <Typography variant="h6" sx={{ flexGrow: 1 }}>Shipping Address</Typography>
                      <FormControlLabel
                        control={
                          <Switch
                            size="small"
                            checked={sameAsBilling}
                            onChange={(event) => setSameAsBilling(event.target.checked)}
                          />
                        }
                        label="Same as Billing"
                        labelPlacement="start"
                      />
                    </Box>
                  </Grid>

                  <AddressSection
                    control={control}
                    errors={errors}
                    prefix="shipping"
                    title=""
                    disabled={sameAsBilling}
                  />
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
                    onClick={handleCancel}
                    disabled={isSaving}
                  >
                    Cancel
                  </AppButton>

                  <AppButton
                    variant="primary"
                    type="submit"
                    fullWidth
                    disabled={
                      isSaving
                      || hasNameDuplicate
                      || isCheckingName
                      || hasPhoneDuplicate
                      || isCheckingPhone
                    }
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

      <ConfirmationDialog
        open={showDiscardDialog}
        title="Discard changes?"
        message="You have unsaved changes. Are you sure you want to leave without saving?"
        confirmText="Discard"
        cancelText="Keep editing"
        severity="warning"
        onConfirm={() => navigate('/sales/customers')}
        onCancel={() => setShowDiscardDialog(false)}
      />
    </>
  )
}

export default CustomerFormPage
