import React, { useEffect, useMemo } from 'react'
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from '@mui/material'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import { yupResolver } from '@hookform/resolvers/yup'
import { format, parseISO } from 'date-fns'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router-dom'
import * as yup from 'yup'

import { AppButton } from '@/components/common/AppButton'
import PageHeader from '@/components/common/PageHeader'
import { useDocumentNumberPreview } from '@/hooks/useDocumentNumberPreview'
import { useNotification } from '@/hooks/useNotification'
import {
  useCreateOwnerEquityMutation,
  useGetOwnerEquityQuery,
  useUpdateOwnerEquityMutation,
} from '@/store/api/accountingApi'
import { useGetProductQuery, useGetProductsQuery } from '@/store/api/inventoryApi'
import { getCurrentDate, toMuiDatePickerFormat } from '@/utils/formatters'
import { rtkErrorMessage } from '@/utils/errorMessage'
import { normalizeAmountInput, toAmountInputValue, toScaledAmount } from '@/utils/currency'
import type {
  CreateOwnerEquityRequest,
  OwnerEquityDocument,
  OwnerEquityType,
  UpdateOwnerEquityRequest,
} from '@/types'

interface OwnerEquityFormData {
  type: OwnerEquityType
  equityDate: string
  description: string
  notes: string
  totalAmount: string
  productId: string
  quantity: string
}

const fieldSx = {
  '& .MuiInputBase-input': { fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
}

const AMOUNT_GRAMMAR = /^\d+(\.\d{1,4})?$/

const isMonetaryType = (type: OwnerEquityType | undefined) =>
  type === 'CAPITAL_INJECTION' || type === 'CASH_DRAWING'

const isStockType = (type: OwnerEquityType | undefined) => type === 'STOCK_DRAWING'

const OwnerEquityFormPage: React.FC = () => {
  const { referenceNumber } = useParams<{ referenceNumber: string }>()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const isEdit = !!referenceNumber

  const equityNumberPreview = useDocumentNumberPreview('Owner Equity', !isEdit)

  const { data: document, isLoading: loadingDocument, isError: documentLoadFailed } = useGetOwnerEquityQuery(
    referenceNumber ?? '',
    { skip: !isEdit },
  )
  const [createEquity, { isLoading: isCreating }] = useCreateOwnerEquityMutation()
  const [updateEquity, { isLoading: isUpdating }] = useUpdateOwnerEquityMutation()

  const isSaving = isCreating || isUpdating

  const schema = useMemo(
    () =>
      yup.object({
        type: yup.string<OwnerEquityType>().required('Type is required'),
        equityDate: yup.string().required('Equity date is required'),
        description: yup.string().required('Description is required'),
        notes: yup
          .string()
          .nullable()
          .transform((v) => v?.trim() || null),
        totalAmount: yup.string().when('type', {
          is: (val: OwnerEquityType | undefined) => isMonetaryType(val),
          then: (s) =>
            s
              .required('Amount is required')
              .test(
                'format',
                'Enter a valid amount (up to 4 decimal places)',
                (v) => !v || AMOUNT_GRAMMAR.test(v),
              )
              .test('is-positive', 'Amount must be greater than 0', (v) => {
                if (!v || !AMOUNT_GRAMMAR.test(v)) return true
                return (toScaledAmount(v) ?? 0n) > 0n
              }),
          otherwise: (s) => s.notRequired(),
        }),
        productId: yup.string().when('type', {
          is: (val: OwnerEquityType | undefined) => isStockType(val),
          then: (s) => s.required('Product is required'),
          otherwise: (s) => s.notRequired(),
        }),
        quantity: yup.string().when('type', {
          is: (val: OwnerEquityType | undefined) => isStockType(val),
          then: (s) => s.required('Quantity is required'),
          otherwise: (s) => s.notRequired(),
        }),
      }),
    [],
  )

  const {
    control,
    getValues,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OwnerEquityFormData>({
    resolver: yupResolver(schema, { abortEarly: false }) as any,
    defaultValues: {
      type: '' as OwnerEquityType,
      equityDate: getCurrentDate(),
      description: '',
      totalAmount: '',
      productId: '',
      quantity: '',
      notes: '',
    },
  })

  const selectedType = watch('type')
  const selectedProductId = watch('productId')

  const { data: productsData } = useGetProductsQuery({ isActive: true })
  const stockedProducts = useMemo(
    () => (productsData?.data ?? []).filter((p) => p.type === 'Stocked Product'),
    [productsData],
  )
  const { data: selectedProduct } = useGetProductQuery(selectedProductId, {
    skip: !selectedProductId,
  })

  useEffect(() => {
    if (isEdit && document && !loadingDocument) {
      reset({
        type: document.type,
        equityDate: document.equityDate,
        description: document.description,
        notes: document.notes ?? '',
        totalAmount: toAmountInputValue(document.totalAmount ?? ''),
        productId: document.productId ?? '',
        quantity: document.quantity ?? '',
      })
    }
  }, [isEdit, document, loadingDocument, reset])

  const returnAfterEdit = (ref?: string) => {
    if (ref) {
      navigate(`/accounting/owner-equity/${ref}/view`)
    } else {
      navigate('/accounting/owner-equity')
    }
  }

  const handleCancel = () => {
    if (isEdit) {
      returnAfterEdit(document?.referenceNumber ?? referenceNumber)
    } else {
      navigate('/accounting/owner-equity')
    }
  }

  const handleFormSubmit = async (data: OwnerEquityFormData) => {
    const cleanedData: CreateOwnerEquityRequest | UpdateOwnerEquityRequest = {
      type: data.type,
      equityDate: data.equityDate,
      description: data.description.trim(),
      notes: data.notes?.trim() || null,
      ...(isMonetaryType(data.type)
        ? { totalAmount: data.totalAmount }
        : { productId: data.productId, quantity: data.quantity }),
    }

    try {
      if (isEdit && document?.referenceNumber) {
        await updateEquity({ referenceNumber: document.referenceNumber, data: cleanedData }).unwrap()
        showSuccess('Owner equity document updated successfully')
        returnAfterEdit(document.referenceNumber)
      } else {
        const created = await createEquity(cleanedData).unwrap()
        showSuccess('Owner equity document created successfully')
        returnAfterEdit(created?.referenceNumber)
      }
    } catch (error: any) {
      showError(rtkErrorMessage(error, `Failed to ${isEdit ? 'update' : 'create'} owner equity document`))
    }
  }

  if (loadingDocument) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 10 }}>
        <CircularProgress />
      </Box>
    )
  }

  if (isEdit && (documentLoadFailed || !document)) {
    return (
      <>
        <PageHeader
          title="Edit Owner Equity"
          subtitle=""
          variant="workflow"
          backAction={() => navigate('/accounting/owner-equity')}
        />
        <Alert severity="error" sx={{ mt: 2 }}>
          Failed to load this document. Go back and try again.
        </Alert>
      </>
    )
  }

  return (
    <>
      <PageHeader
        title={isEdit ? 'Edit Owner Equity' : 'New Owner Equity'}
        subtitle={
          isEdit
            ? `Editing ${document?.referenceNumber ?? ''}`
            : 'Record a capital injection, cash drawing or stock drawing'
        }
        variant="workflow"
        backAction={handleCancel}
      />

      <form noValidate onSubmit={handleSubmit(handleFormSubmit)}>
        <Grid container spacing={3}>
          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Equity Information</Typography>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Controller
                      name="type"
                      control={control}
                      render={({ field }) => (
                        <FormControl
                          fullWidth
                          size="small"
                          disabled={isSaving}
                          sx={fieldSx}
                          error={!!errors.type}
                        >
                          <InputLabel id="type-label">
                            Type
                          </InputLabel>
                          <Select
                            labelId="type-label"
                            id="type-select"
                            label="Type"
                            value={field.value ?? ''}
                            onChange={(e) => field.onChange(e.target.value as string)}
                            disabled={isEdit || isSaving}
                          >
                            <MenuItem value="CAPITAL_INJECTION">Capital Injection</MenuItem>
                            <MenuItem value="CASH_DRAWING">Cash Drawing</MenuItem>
                            <MenuItem value="STOCK_DRAWING">Stock Drawing</MenuItem>
                          </Select>
                        </FormControl>
                      )}
                    />
                    {errors.type && (
                      <Typography color="error" variant="caption">
                        {errors.type.message}
                      </Typography>
                    )}
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <Controller
                      name="equityDate"
                      control={control}
                      render={({ field }) => (
                        <DatePicker
                          label="Equity Date"
                          value={field.value ? parseISO(field.value) : null}
                          format={toMuiDatePickerFormat(
                            localStorage.getItem('dateFormat') || 'DD/MM/YYYY',
                          )}
                          onChange={(date) =>
                            field.onChange(
                              date && !Number.isNaN(date.getTime())
                                ? format(date, 'yyyy-MM-dd')
                                : '',
                            )
                          }
                          slotProps={{
                            textField: {
                              fullWidth: true,
                              size: 'small',
                              required: true,
                              error: !!errors.equityDate,
                              helperText: errors.equityDate?.message,
                              disabled: isSaving,
                              sx: fieldSx,
                            },
                          }}
                        />
                      )}
                    />
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}>
                    <TextField
                      label="Equity No."
                      value={isEdit ? (document?.referenceNumber ?? '') : (equityNumberPreview ?? '')}
                      disabled
                      fullWidth
                      size="small"
                      sx={fieldSx}
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
                          size="small"
                          label="Description"
                          required
                          disabled={isSaving}
                          error={!!errors.description}
                          helperText={errors.description?.message}
                          sx={fieldSx}
                        />
                      )}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {isMonetaryType(selectedType) && (
            <Grid size={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Amount</Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Controller
                        name="totalAmount"
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            value={field.value || ''}
                            onBlur={() => {
                              setValue(
                                'totalAmount',
                                normalizeAmountInput(field.value ?? ''),
                                { shouldValidate: true, shouldDirty: true },
                              )
                              field.onBlur()
                            }}
                            fullWidth
                            size="small"
                            type="text"
                            label="Amount"
                            required
                            disabled={isSaving}
                            error={!!errors.totalAmount}
                            helperText={errors.totalAmount?.message}
                            slotProps={{ htmlInput: { inputMode: 'decimal' as const } }}
                            sx={fieldSx}
                          />
                        )}
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          )}

          {isStockType(selectedType) && (
            <Grid size={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Stock Movement</Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, md: 6 }}>
                      <Controller
                        name="productId"
                        control={control}
                        render={({ field }) => (
                          <FormControl
                            fullWidth
                            size="small"
                            // Only `type` is immutable after create; the backend
                            // revalidates and accepts a product change on a draft
                            // (owner-equity.service.ts:127).
                            disabled={isSaving}
                            sx={fieldSx}
                            error={!!errors.productId}
                          >
                              <InputLabel id="product-label">
                                Product
                              </InputLabel>
                              <Select
                                labelId="product-label"
                                id="product-select"
                                label="Product"
                                value={field.value ?? ''}
                                onChange={(e) => field.onChange(e.target.value as string)}
                              >
                              {stockedProducts.map((p) => (
                                <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        )}
                      />
                      {errors.productId && (
                        <Typography color="error" variant="caption">
                          {errors.productId.message}
                        </Typography>
                      )}
                    </Grid>
                    <Grid size={{ xs: 12, md: 3 }}>
                      <Controller
                        name="quantity"
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            value={field.value || ''}
                            fullWidth
                            size="small"
                            type="text"
                            label="Quantity"
                            required
                            disabled={isSaving}
                            error={!!errors.quantity}
                            helperText={errors.quantity?.message}
                            slotProps={{ htmlInput: { inputMode: 'decimal' as const } }}
                            sx={fieldSx}
                          />
                        )}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 3 }}>
                      <Typography
                        variant="body2"
                        sx={{ color: 'text.secondary', pb: 1 }}
                        data-testid="available-stock"
                      >
                        {selectedProductId
                          ? `Available: ${selectedProduct?.stockQuantity ?? 0}`
                          : 'Available: —'}
                      </Typography>
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
            </Grid>
          )}

          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Additional Information</Typography>
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
                      label="Notes"
                      disabled={isSaving}
                      error={!!errors.notes}
                      helperText={errors.notes?.message}
                      minRows={3}
                      sx={fieldSx}
                    />
                  )}
                />
              </CardContent>
            </Card>
          </Grid>

          <Grid size={12}>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <AppButton variant="secondary" onClick={handleCancel} disabled={isSaving}>
                Cancel
              </AppButton>
              <AppButton variant="primary" type="submit" disabled={isSaving || isSubmitting}>
                {isSaving
                  ? isEdit
                    ? 'Saving...'
                    : 'Creating...'
                  : isEdit
                    ? 'Save Owner Equity'
                    : 'Create Owner Equity'}
              </AppButton>
            </Box>
          </Grid>
        </Grid>
      </form>
    </>
  )
}

export default OwnerEquityFormPage
