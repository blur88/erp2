import React, { useEffect, useMemo } from 'react'
import {
  Alert,
  Autocomplete,
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
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import * as yup from 'yup'

import { currentListPath, forwardListQuery } from '@/utils/listQuery'

import { AppButton } from '@/components/common/AppButton'
import PageHeader from '@/components/common/PageHeader'
import { useDocumentNumberPreview } from '@/hooks/useDocumentNumberPreview'
import { useNotification } from '@/hooks/useNotification'
import { useProductSearch } from '@/hooks/useProductSearch'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
import {
  useCreateOwnerEquityMutation,
  useGetOwnerEquityQuery,
  useUpdateOwnerEquityMutation,
} from '@/store/api/accountingApi'
import { useGetProductQuery } from '@/store/api/inventoryApi'
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

const AMOUNT_GRAMMAR = /^\d+(\.\d{1,4})?$/

const isMonetaryType = (type: OwnerEquityType | undefined) =>
  type === 'CAPITAL_INJECTION' || type === 'CASH_DRAWING'

const isStockType = (type: OwnerEquityType | undefined) => type === 'STOCK_DRAWING'

const OwnerEquityFormPage: React.FC = () => {
  const { referenceNumber } = useParams<{ referenceNumber: string }>()
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const isEdit = !!referenceNumber

  // Edit can be opened from the Owner Equity list or from Owner Equity Detail.
  // The list marks its origin explicitly; everything else — including a
  // directly typed or shared /edit URL, which is indistinguishable from a
  // Detail-opened one here — falls back to Detail, the historical behaviour.
  // Issue #1090, mirroring ExpenseFormPage's expenseEditOrigin.
  const location = useLocation()
  // The ticket carried from the list (or forwarded by Detail). Same-module
  // returns rebuild the list URL from it; Form→Detail forwards it onward.
  const listPath = currentListPath('/accounting/owner-equity')
  const isListOrigin =
    (location.state as { ownerEquityEditOrigin?: string } | null)?.ownerEquityEditOrigin === 'list'

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
    formState: { errors, isDirty, isSubmitting },
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

  // Cancel, the PageHeader back arrow and any sidebar navigation all go
  // through the router, so one blocker covers every exit. The hook's saved
  // latch is what keeps the post-save navigate() in handleFormSubmit from
  // being blocked by the still-dirty form. Issue #1092.
  const { UnsavedChangesDialog } = useUnsavedChangesGuard(isDirty, isSubmitting)

  const selectedType = watch('type')
  const selectedProductId = watch('productId')

  // Products are searched server-side (name/barcode ILIKE) rather than fetched
  // as a whole catalogue, so the option list stays bounded. The active +
  // Stocked Product filters are applied by the backend, which is what keeps
  // Service products out of the selector. Issue #1086.
  const { products, loadProducts, seedProducts } = useProductSearch({
    onlyActive: true,
    type: 'Stocked Product',
  })

  useEffect(() => {
    loadProducts()
    // Initial unfiltered page only; later loads are driven by typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { data: selectedProduct } = useGetProductQuery(selectedProductId, {
    skip: !selectedProductId,
  })

  // A saved product is not guaranteed to appear in the current search results
  // (edit mode opens with an unfiltered page, and typing narrows it away), so
  // seed it into the option list to keep the Autocomplete showing its name.
  useEffect(() => {
    if (selectedProduct) {
      seedProducts([selectedProduct as unknown as { id: string }])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProduct])

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

  // Create returns to the list and hands the new row back in history state, the
  // way Expenses does. The id, not the reference number: EntityTable matches
  // selectedId against row.id. Omit the highlight when the response carries no
  // id rather than sending undefined — the list just skips highlighting, which
  // is already best-effort. Issue #1088.
  const returnAfterCreate = (id?: string) => {
    navigate(listPath, {
      state: id ? { highlightOwnerEquityId: id } : null,
    })
  }

  // List-origin Save/Cancel/Back go back to the list, handing the edited row
  // back the way create does — the id, not the reference number, since
  // EntityTable matches selectedId against row.id. Omit the highlight when the
  // id is unknown rather than sending undefined.
  const returnAfterEdit = (ref?: string) => {
    if (isListOrigin) {
      navigate(listPath, {
        state: document?.id ? { highlightOwnerEquityId: document.id } : null,
      })
    } else if (ref) {
      navigate(forwardListQuery(`/accounting/owner-equity/${ref}/view`))
    } else {
      navigate(listPath)
    }
  }

  const handleCancel = () => {
    if (isEdit) {
      returnAfterEdit(document?.referenceNumber ?? referenceNumber)
    } else {
      navigate(listPath)
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
        returnAfterCreate(created?.id)
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
          backAction={() => navigate(listPath)}
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
                          <Autocomplete
                            options={products}
                            getOptionLabel={(option: any) => option?.name || ''}
                            isOptionEqualToValue={(option: any, value: any) => option.id === value.id}
                            // The selectedProduct fallback covers a saved id that
                            // the current search results do not contain, but it
                            // must stay gated on field.value: RTK Query keeps the
                            // last result after the query is skipped, so an
                            // ungated fallback re-displays a cleared product.
                            value={
                              field.value
                                ? (products.find((p: any) => p.id === field.value) ??
                                  (selectedProduct as any) ??
                                  null)
                                : null
                            }
                            onChange={(_, value: any) => field.onChange(value?.id ?? '')}
                            onInputChange={(_, value, reason) => {
                              if (reason === 'input') loadProducts(value.trim())
                            }}
                            // The backend already applied the search; re-filtering
                            // client-side would hide matches it returned.
                            filterOptions={(options) => options}
                            noOptionsText="No matching products"
                            fullWidth
                            size="small"
                            // Only `type` is immutable after create; the backend
                            // revalidates and accepts a product change on a draft
                            // (owner-equity.service.ts:127).
                            disabled={isSaving}
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label="Product"
                                placeholder="Search by name or barcode..."
                                error={!!errors.productId}
                                helperText={errors.productId?.message}
                              />
                            )}
                          />
                        )}
                      />
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
                          />
                        )}
                      />
                    </Grid>
                    <Grid size={{ xs: 12, md: 3 }}>
                      <Typography
                        variant="body2"
                        // Mirrors a size="small" OutlinedInput's layout height:
                        // 1.4375em content + 8.5px padding top and bottom. The
                        // border is absolutely positioned and adds nothing. The
                        // em resolves against body2's own 0.875rem, which is the
                        // same size the theme gives the input, so this tracks the
                        // compact-control standard instead of hardcoding px.
                        // Centering here rather than padding the bottom keeps the
                        // text on the input row whether or not helper text shows.
                        sx={{
                          display: 'flex',
                          alignItems: 'center',
                          minHeight: 'calc(1.4375em + 17px)',
                          color: 'text.secondary',
                        }}
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

      {UnsavedChangesDialog}
    </>
  )
}

export default OwnerEquityFormPage
