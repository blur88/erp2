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
import { useFieldDuplicateCheck } from '@/hooks/useFieldDuplicateCheck'
import { useNotification } from '@/hooks/useNotification'
import {
  useCreateSupplierMutation,
  useLazyCheckDuplicateCompanyNameQuery,
  useLazyGetSupplierBySlugQuery,
  useRestoreSupplierMutation,
  useUpdateSupplierMutation,
} from '@/store/api/purchasingApi'
import type { Supplier } from '@/types'
import { SupplierType } from '@/types'

const supplierSchema = yup.object({
  companyName: yup.string().required('Company name is required').max(200, 'Name must be less than 200 characters'),
  type: yup.string().oneOf(['local', 'international']).required('Type is required'),
  contactPerson: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(200),
  phone: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20),
  email: yup.string().optional().nullable().email('Invalid email address').transform((value) => value?.trim() || null).max(255),
  billingStreetAddress: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(255),
  billingStreetAddress2: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(255),
  billingCity: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100),
  billingState: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100),
  billingPostalCode: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20),
  billingCountry: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100),
  shippingStreetAddress: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(255),
  shippingStreetAddress2: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(255),
  shippingCity: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100),
  shippingState: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100),
  shippingPostalCode: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(20),
  shippingCountry: yup.string().optional().nullable().transform((value) => value?.trim() || null).max(100),
  notes: yup.string().optional().nullable().transform((value) => value?.trim() || null),
})

interface SupplierFormData {
  companyName: string
  type: SupplierType
  contactPerson?: string | null
  phone?: string | null
  email?: string | null
  billingStreetAddress?: string | null
  billingStreetAddress2?: string | null
  billingCity?: string | null
  billingState?: string | null
  billingPostalCode?: string | null
  billingCountry?: string | null
  shippingStreetAddress?: string | null
  shippingStreetAddress2?: string | null
  shippingCity?: string | null
  shippingState?: string | null
  shippingPostalCode?: string | null
  shippingCountry?: string | null
  notes?: string | null
}

interface DuplicateNameResult {
  exists: boolean
  isInactive?: boolean
  supplier?: Supplier
  message?: string
}

const fieldSx = {
  '& .MuiInputBase-input': { fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
}

const SupplierFormPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { showSuccess, showError } = useNotification()
  const isEdit = !!slug

  const returnTo = (location.state as any)?.returnTo as string | undefined
  const profilePath = (location.state as any)?.profilePath as string | undefined

  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [loadingSupplier, setLoadingSupplier] = useState(isEdit)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sameAsBilling, setSameAsBilling] = useState(false)
  const [showDiscardDialog, setShowDiscardDialog] = useState(false)
  const [duplicateNameResult, setDuplicateNameResult] = useState<DuplicateNameResult | null>(null)

  const [fetchSupplierBySlug] = useLazyGetSupplierBySlugQuery()
  const [createSupplier, { isLoading: isCreating }] = useCreateSupplierMutation()
  const [updateSupplier, { isLoading: isUpdating }] = useUpdateSupplierMutation()
  const [restoreSupplier, { isLoading: isRestoring }] = useRestoreSupplierMutation()
  const [checkDuplicateCompanyName] = useLazyCheckDuplicateCompanyNameQuery()
  const isSaving = isCreating || isUpdating

  const {
    control,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isDirty },
  } = useForm<SupplierFormData>({
    resolver: yupResolver(supplierSchema) as any,
    defaultValues: {
      companyName: '',
      type: SupplierType.LOCAL,
      contactPerson: null,
      phone: null,
      email: null,
      billingStreetAddress: null,
      billingStreetAddress2: null,
      billingCity: null,
      billingState: null,
      billingPostalCode: null,
      billingCountry: null,
      shippingStreetAddress: null,
      shippingStreetAddress2: null,
      shippingCity: null,
      shippingState: null,
      shippingPostalCode: null,
      shippingCountry: null,
      notes: null,
    },
  })

  const watchedCompanyName = watch('companyName')
  const watchedBilling = watch([
    'billingStreetAddress',
    'billingStreetAddress2',
    'billingCity',
    'billingState',
    'billingPostalCode',
    'billingCountry',
  ])

  useEffect(() => {
    if (!sameAsBilling) return
    setValue('shippingStreetAddress', watchedBilling[0], { shouldDirty: true })
    setValue('shippingStreetAddress2', watchedBilling[1], { shouldDirty: true })
    setValue('shippingCity', watchedBilling[2], { shouldDirty: true })
    setValue('shippingState', watchedBilling[3], { shouldDirty: true })
    setValue('shippingPostalCode', watchedBilling[4], { shouldDirty: true })
    setValue('shippingCountry', watchedBilling[5], { shouldDirty: true })
  }, [sameAsBilling, setValue, watchedBilling])

  useEffect(() => {
    if (!slug) return
    setLoadingSupplier(true)
    fetchSupplierBySlug(slug)
      .unwrap()
      .then((currentSupplier) => {
        setSupplier(currentSupplier)
        const shippingMatchesBilling =
          !!currentSupplier.billingStreetAddress &&
          (currentSupplier.shippingStreetAddress ?? null) === (currentSupplier.billingStreetAddress ?? null) &&
          (currentSupplier.shippingStreetAddress2 ?? null) === (currentSupplier.billingStreetAddress2 ?? null) &&
          (currentSupplier.shippingCity ?? null) === (currentSupplier.billingCity ?? null) &&
          (currentSupplier.shippingState ?? null) === (currentSupplier.billingState ?? null) &&
          (currentSupplier.shippingPostalCode ?? null) === (currentSupplier.billingPostalCode ?? null) &&
          (currentSupplier.shippingCountry ?? null) === (currentSupplier.billingCountry ?? null)
        reset({
          companyName: currentSupplier.companyName,
          type: currentSupplier.type as SupplierType,
          contactPerson: currentSupplier.contactPerson || null,
          phone: currentSupplier.phone || null,
          email: currentSupplier.email || null,
          billingStreetAddress: currentSupplier.billingStreetAddress || null,
          billingStreetAddress2: currentSupplier.billingStreetAddress2 || null,
          billingCity: currentSupplier.billingCity || null,
          billingState: currentSupplier.billingState || null,
          billingPostalCode: currentSupplier.billingPostalCode || null,
          billingCountry: currentSupplier.billingCountry || null,
          shippingStreetAddress: currentSupplier.shippingStreetAddress || null,
          shippingStreetAddress2: currentSupplier.shippingStreetAddress2 || null,
          shippingCity: currentSupplier.shippingCity || null,
          shippingState: currentSupplier.shippingState || null,
          shippingPostalCode: currentSupplier.shippingPostalCode || null,
          shippingCountry: currentSupplier.shippingCountry || null,
          notes: currentSupplier.notes || null,
        })
        setSameAsBilling(shippingMatchesBilling)
      })
      .catch(() => setLoadError('Supplier not found.'))
      .finally(() => setLoadingSupplier(false))
  }, [fetchSupplierBySlug, reset, slug])

  const companyNameCheckFn = useCallback(async (name: string, excludeId?: string) => {
    const result = await checkDuplicateCompanyName({ companyName: name, excludeId }).unwrap() as any
    return {
      exists: result?.exists ?? false,
      message: result?.message,
      isInactive: result?.isInactive,
      supplier: result?.supplier,
    }
  }, [checkDuplicateCompanyName])

  const {
    isChecking: isCheckingName,
    hasDuplicate: hasNameDuplicate,
    error: nameDuplicateError,
    successMessage: nameSuccessMessage,
  } = useFieldDuplicateCheck(watchedCompanyName ?? '', async (name, excludeId) => {
    const result = await companyNameCheckFn(name, excludeId)
    if (result.exists) {
      setDuplicateNameResult({ exists: true, isInactive: result.isInactive, supplier: result.supplier as any })
    } else {
      setDuplicateNameResult(null)
    }
    return { exists: result.exists, message: result.message }
  }, {
    excludeId: supplier?.id,
    skipCheck: !watchedCompanyName || watchedCompanyName.length < 2 || (supplier ? watchedCompanyName === supplier.companyName : false),
  })

  useEffect(() => {
    if (!hasNameDuplicate) setDuplicateNameResult(null)
  }, [hasNameDuplicate])

  const cancelDestination = returnTo === 'profile' && profilePath
    ? profilePath
    : '/purchasing/suppliers'

  const handleCancel = () => {
    if (!isDirty) {
      navigate(cancelDestination)
      return
    }
    setShowDiscardDialog(true)
  }

  const handleReactivate = async () => {
    if (!duplicateNameResult?.supplier) return
    try {
      await restoreSupplier(duplicateNameResult.supplier.id).unwrap()
      showSuccess('Supplier reactivated successfully')
      navigate(cancelDestination)
    } catch {
      showError('Failed to reactivate supplier')
    }
  }

  const handleFormSubmit = async (data: SupplierFormData) => {
    if (hasNameDuplicate && !duplicateNameResult?.isInactive) {
      showError('A supplier with this name already exists')
      return
    }

    const cleanedData = {
      ...data,
      contactPerson: data.contactPerson?.trim() || null,
      phone: data.phone?.trim() || null,
      email: data.email?.trim() || null,
      billingStreetAddress: data.billingStreetAddress?.trim() || null,
      billingStreetAddress2: data.billingStreetAddress2?.trim() || null,
      billingCity: data.billingCity?.trim() || null,
      billingState: data.billingState?.trim() || null,
      billingPostalCode: data.billingPostalCode?.trim() || null,
      billingCountry: data.billingCountry?.trim() || null,
      shippingStreetAddress: data.shippingStreetAddress?.trim() || null,
      shippingStreetAddress2: data.shippingStreetAddress2?.trim() || null,
      shippingCity: data.shippingCity?.trim() || null,
      shippingState: data.shippingState?.trim() || null,
      shippingPostalCode: data.shippingPostalCode?.trim() || null,
      shippingCountry: data.shippingCountry?.trim() || null,
      notes: data.notes?.trim() || null,
    }

    try {
      let savedSupplier: Supplier
      if (isEdit && supplier?.id) {
        savedSupplier = await updateSupplier({ id: supplier.id, data: cleanedData }).unwrap()
        showSuccess(`${savedSupplier.companyName} updated successfully`)
      } else {
        savedSupplier = await createSupplier(cleanedData).unwrap()
        showSuccess(`${savedSupplier.companyName} created successfully`)
      }

      if (returnTo === 'profile' && profilePath) {
        navigate(profilePath)
      } else {
        navigate(`/purchasing/suppliers?highlight=${savedSupplier.id}`)
      }
    } catch {
      showError(`Failed to ${isEdit ? 'update' : 'create'} supplier`)
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
        backAction={handleCancel}
      />

      <form noValidate onSubmit={handleSubmit(handleFormSubmit)}>
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
            <Card sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
              <CardContent>
                <Typography variant="h6" gutterBottom>Basic Information</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Controller
                      name="type"
                      control={control}
                      render={({ field }) => (
                        <FormControl fullWidth size="small" error={!!errors.type} disabled={isSaving} sx={fieldSx}>
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
                          required
                          disabled={isSaving}
                          error={!!errors.companyName || (hasNameDuplicate && !duplicateNameResult?.isInactive)}
                          helperText={errors.companyName?.message || nameDuplicateError || nameSuccessMessage}
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
                        A supplier with this name already exists.
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
                        This supplier is inactive. Would you like to reactivate them?
                      </Alert>
                    )}
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
                          disabled={isSaving}
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
                          disabled={isSaving}
                          error={!!errors.phone}
                          helperText={errors.phone?.message}
                          sx={fieldSx}
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
                          disabled={isSaving}
                          error={!!errors.email}
                          helperText={errors.email?.message}
                          sx={fieldSx}
                        />
                      )}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
            <Card sx={{ display: 'flex', flexDirection: 'column', flexGrow: 1 }}>
              <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
                <Typography variant="h6" gutterBottom>Additional</Typography>
                <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', mt: 1 }}>
                  <Controller
                    name="notes"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        value={field.value || ''}
                        fullWidth
                        multiline
                        size="small"
                        label="Notes / Remarks"
                        disabled={isSaving}
                        error={!!errors.notes}
                        helperText={errors.notes?.message}
                        sx={{
                          ...fieldSx,
                          flexGrow: 1,
                          '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' },
                          '& .MuiInputBase-input': {
                            ...fieldSx['& .MuiInputBase-input'],
                            height: '100% !important',
                            overflow: 'auto !important',
                          },
                        }}
                      />
                    )}
                  />
                </Box>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Addresses</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}>
                    <Grid container spacing={2}>
                      <Grid size={12}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mt: 2, minHeight: 38 }}>
                          <Typography variant="h6" sx={{ flexGrow: 1 }}>Billing Address</Typography>
                        </Box>
                      </Grid>
                      <AddressSection
                        control={control}
                        errors={errors}
                        prefix="billing"
                        title=""
                        disabled={isSaving}
                      />
                    </Grid>
                  </Grid>

                  <Grid size={{ xs: 12, md: 6 }}>
                    <Grid container spacing={2}>
                      <Grid size={12}>
                        <Box sx={{ display: 'flex', alignItems: 'center', mt: 2, minHeight: 38 }}>
                          <Typography variant="h6" sx={{ flexGrow: 1 }}>Shipping Address</Typography>
                          <FormControlLabel
                            control={
                              <Switch
                                size="small"
                                checked={sameAsBilling}
                                onChange={(event) => setSameAsBilling(event.target.checked)}
                                disabled={isSaving}
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
                        disabled={sameAsBilling || isSaving}
                      />
                    </Grid>
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <AppButton
                variant="secondary"
                onClick={handleCancel}
                disabled={isSaving}
              >
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                type="submit"
                disabled={isSaving || (hasNameDuplicate && !duplicateNameResult?.isInactive) || isCheckingName}
              >
                {isSaving
                  ? (isEdit ? 'Updating...' : 'Creating...')
                  : (isEdit ? 'Update Supplier' : 'Create Supplier')}
              </AppButton>
            </Box>
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
        onConfirm={() => navigate(cancelDestination)}
        onCancel={() => setShowDiscardDialog(false)}
      />
    </>
  )
}

export default SupplierFormPage
