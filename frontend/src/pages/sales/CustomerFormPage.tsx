import React, { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Box,
  Button,
  CircularProgress,
  FormControl,
  Grid,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
  Paper,
  Alert,
} from '@mui/material'
import { useNavigate, useParams } from 'react-router-dom'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useNotification } from '@/hooks/useNotification'
import {
  useCreateCustomerMutation,
  useUpdateCustomerMutation,
} from '@/store/api/salesApi'
import type { Customer } from '@/types'
import { CustomerType } from '@/types'
import api from '@/services/api'
import PriceListSelector from '@/components/price-lists/PriceListSelector'
import PageHeader from '@/components/common/PageHeader'

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

const CustomerFormPage: React.FC = () => {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const isEdit = !!id

  const [customer, setCustomer] = useState<Customer | null>(null)
  const [loadingCustomer, setLoadingCustomer] = useState(isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [phoneValue, setPhoneValue] = useState('')
  const [isCheckingPhone, setIsCheckingPhone] = useState(false)
  const [phoneError, setPhoneError] = useState<string | null>(null)

  const [createCustomer, { isLoading: isCreating }] = useCreateCustomerMutation()
  const [updateCustomer, { isLoading: isUpdating }] = useUpdateCustomerMutation()
  const isSaving = isCreating || isUpdating

  const { control, handleSubmit, reset, formState: { errors } } = useForm<CustomerFormData>({
    resolver: yupResolver(customerSchema) as any,
    defaultValues: {
      name: '',
      type: CustomerType.BUSINESS,
      priceListId: null,
      phone: null,
      streetAddress: null,
      city: null,
      state: null,
      postalCode: null,
      country: null,
      notes: null,
    },
  })

  useEffect(() => {
    if (!id) return
    setLoadingCustomer(true)
    api.get(`/customers/${id}`)
      .then((res) => {
        const c: Customer = res.data?.data ?? res.data
        setCustomer(c)
        reset({
          name: c.name,
          type: c.type,
          priceListId: c.priceListId || null,
          phone: c.phone || null,
          streetAddress: c.streetAddress || null,
          city: c.city || null,
          state: c.state || null,
          postalCode: c.postalCode || null,
          country: c.country || null,
          notes: c.notes || null,
        })
        setPhoneValue(c.phone || '')
      })
      .catch(() => setLoadError('Customer not found.'))
      .finally(() => setLoadingCustomer(false))
  }, [id, reset])

  const checkPhoneDuplicate = useCallback(async (phone: string) => {
    if (!phone || phone.trim().length === 0) {
      setPhoneError(null)
      return
    }
    const normalizedPhone = phone.replace(/[\s\-\(\)\+]/g, '')
    if (normalizedPhone.length === 0) {
      setPhoneError(null)
      return
    }
    setIsCheckingPhone(true)
    setPhoneError(null)
    try {
      const [activeResponse, deletedResponse] = await Promise.all([
        api.get('/customers', { params: { search: phone } }),
        api.get('/customers/deleted', { params: { search: phone } }),
      ])
      const allCustomers = [
        ...(activeResponse.data?.data || []),
        ...(deletedResponse.data?.data || []),
      ]
      if (allCustomers.length > 0) {
        const duplicateCustomer = allCustomers.find((c: Customer) => {
          if (!c.phone) return false
          const existing = c.phone.replace(/[\s\-\(\)\+]/g, '')
          return existing === normalizedPhone && (!customer || c.id !== customer.id)
        })
        if (duplicateCustomer) {
          setPhoneError(`Phone number already exists for customer: ${duplicateCustomer.name}`)
        }
      }
    } catch {
      // ignore duplicate check errors
    } finally {
      setIsCheckingPhone(false)
    }
  }, [customer])

  const debouncedPhoneCheck = useMemo(() => {
    let timeoutId: ReturnType<typeof setTimeout>
    return (phone: string) => {
      clearTimeout(timeoutId)
      timeoutId = setTimeout(() => checkPhoneDuplicate(phone), 500)
    }
  }, [checkPhoneDuplicate])

  const handleFormSubmit = async (data: CustomerFormData) => {
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
      if (isEdit && id) {
        await updateCustomer({ id, data: cleanedData }).unwrap()
        showSuccess('Customer updated successfully')
      } else {
        await createCustomer(cleanedData).unwrap()
        showSuccess('Customer created successfully')
      }
      navigate('/sales/customers')
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
                    <InputLabel>Customer Type</InputLabel>
                    <Select {...field} label="Customer Type">
                      <MenuItem value={CustomerType.INDIVIDUAL}>Individual</MenuItem>
                      <MenuItem value={CustomerType.BUSINESS}>Business</MenuItem>
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
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
            </Grid>

            <Grid size={12}>
              <Controller
                name="name"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Customer Name"
                    error={!!errors.name}
                    helperText={errors.name?.message}
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
                    error={!!errors.phone || !!phoneError}
                    helperText={errors.phone?.message || phoneError}
                    onChange={(e) => {
                      field.onChange(e)
                      setPhoneValue(e.target.value)
                      debouncedPhoneCheck(e.target.value)
                    }}
                    InputProps={{
                      endAdornment: isCheckingPhone ? (
                        <InputAdornment position="end">
                          <CircularProgress size={20} />
                        </InputAdornment>
                      ) : undefined,
                    }}
                  />
                )}
              />
            </Grid>

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
                  <TextField {...field} value={field.value || ''} fullWidth label="City"
                    error={!!errors.city} helperText={errors.city?.message} />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="state"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth label="State"
                    error={!!errors.state} helperText={errors.state?.message} />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="postalCode"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth label="Postal Code"
                    error={!!errors.postalCode} helperText={errors.postalCode?.message} />
                )}
              />
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="country"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth label="Country"
                    error={!!errors.country} helperText={errors.country?.message} />
                )}
              />
            </Grid>

            <Grid size={12}>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <TextField {...field} value={field.value || ''} fullWidth multiline rows={3}
                    label="Notes" error={!!errors.notes} helperText={errors.notes?.message} />
                )}
              />
            </Grid>

            <Grid size={12}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', pt: 1 }}>
                <Button onClick={() => navigate('/sales/customers')}>Cancel</Button>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={isSaving || !!phoneError || isCheckingPhone}
                >
                  {isSaving ? <CircularProgress size={20} /> : (isEdit ? 'Update' : 'Create')}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </>
  )
}

export default CustomerFormPage
