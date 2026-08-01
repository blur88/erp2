import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  Alert,
  Autocomplete,
  Box,
  Card,
  CardContent,
  Grid,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  useTheme,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import DeleteIcon from '@mui/icons-material/Delete'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { DatePicker } from '@mui/x-date-pickers'
import { parseISO, format, isValid } from 'date-fns'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'

import { AppButton } from '@/components/common/AppButton'
import {
  useGetProductsQuery,
  useGetStockAdjustmentQuery,
  useCreateStockAdjustmentMutation,
  useUpdateStockAdjustmentMutation,
} from '@/store/api/inventoryApi'
import { useGetDocumentNumberSettingsQuery } from '@/store/api/settingsApi'
import { getCurrentDate, toDateInputValue, toMuiDatePickerFormat } from '@/utils/formatters'
import TransactionFormShell from '@/components/transactions/TransactionFormShell'
import { formatCurrency } from '@/utils/currency'
import { LINE_ITEM_TABLE_SX } from '@/components/transactions/transactionTableStyles'
import { useNotification } from '@/hooks/useNotification'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'

interface ItemRow {
  productId: string
  liveStock: number
  difference: number | '' | '-'
  unitCost: number
}

interface FormData {
  adjustmentDate: string
  notes?: string
  items: ItemRow[]
}

const schema = yup.object({
  adjustmentDate: yup.string().required('Adjustment date is required'),
  notes: yup.string().optional(),
  items: yup.array().of(
    yup.object({
      productId: yup.string().required('Product is required'),
      liveStock: yup.number().required(),
      difference: yup
        .number()
        .transform((value, originalValue) =>
          originalValue === '' || originalValue === '-' ? undefined : value,
        )
        .required('Quantity change is required')
        .notOneOf([0], 'Quantity change cannot be zero'),
      unitCost: yup.number().required(),
    }),
  ).min(1, 'At least one item is required'),
})

const fieldSx = {
  '& .MuiInputBase-input': { fontSize: '0.875rem' },
  '& .MuiInputLabel-root': { fontSize: '0.875rem' },
}

const calculateQtyAfter = (
  liveStock: number | string,
  difference: number | string,
): number => (Number(liveStock) || 0) + (Number(difference) || 0)

const getAdjustmentItemProductId = (item: any): string =>
  item?.productId ?? item?.product?.id ?? ''

const CreateStockAdjustmentPage: React.FC = () => {
  const theme = useTheme()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const revertFrom = searchParams.get('revertFrom')
  const fromView = searchParams.get('from') === 'view'
  const isEditMode = !!id
  const editReturnPath = fromView && id ? `/inventory/stock-adjustments/${id}/view` : null
  const { showSuccess, showError } = useNotification()

  const { data: productsData, isLoading: productsLoading } = useGetProductsQuery({ isActive: true, type: 'Stocked Product' })
  const { data: adjustment, isLoading: adjustmentLoading } = useGetStockAdjustmentQuery(id!, { skip: !id })
  const { data: sourceAdjustment, isLoading: sourceLoading } = useGetStockAdjustmentQuery(revertFrom!, { skip: !revertFrom })

  const { data: docNumberSettings, isLoading: loadingDocNumbers } =
    useGetDocumentNumberSettingsQuery()

  const adjustmentNumberPreview = useMemo(() => {
    if (isEditMode) return null
    if (loadingDocNumbers) return 'Loading...'
    if (!docNumberSettings) return 'Auto-generated'
    const config = docNumberSettings.configurations?.find(
      (c: any) => c.documentName === 'Stock Adjustment',
    )
    if (!config) return 'Auto-generated'
    const yy = String(new Date().getFullYear() % 100).padStart(2, '0')
    const seq = String(config.nextNumber).padStart(config.paddingDigits, '0')
    return `${config.prefix}-${yy}-${seq}`
  }, [docNumberSettings, isEditMode, loadingDocNumbers])

  const storedFormat = useMemo(() => localStorage.getItem('dateFormat') || 'DD/MM/YYYY', [])
  const pickerFormat = useMemo(() => toMuiDatePickerFormat(storedFormat), [storedFormat])

  const [createStockAdjustment, { isLoading: isCreating }] = useCreateStockAdjustmentMutation()
  const [updateStockAdjustment, { isLoading: isUpdating }] = useUpdateStockAdjustmentMutation()
  const isSaving = isCreating || isUpdating

  const products = (productsData?.data ?? []) as any[]
  const fallbackProductsById = useMemo(() => {
    const map = new Map<string, any>()
    const sources = [adjustment, sourceAdjustment]
    for (const src of sources) {
      for (const item of ((src as any)?.items ?? [])) {
        const id = getAdjustmentItemProductId(item)
        if (!id || !item.product || map.has(id)) continue
        map.set(id, {
          ...item.product,
          stockQuantity: item.liveStock ?? item.oldQuantity ?? 0,
          baseCost: item.unitCost ?? 0,
        })
      }
    }
    return map
  }, [adjustment, sourceAdjustment])
  const [duplicateError, setDuplicateError] = useState<string | null>(null)
  const [pageError, setPageError] = useState<string | null>(null)

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<FormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      adjustmentDate: getCurrentDate(),
      notes: '',
      items: [{ productId: '', liveStock: 0, difference: 0, unitCost: 0 }],
    },
  })
  const { UnsavedChangesDialog } = useUnsavedChangesGuard(isDirty, isSubmitting)

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const watchedItems = watch('items')

  const editAppliedRef = useRef(false)
  const revertAppliedRef = useRef(false)

  useEffect(() => {
    editAppliedRef.current = false
  }, [id])

  useEffect(() => {
    revertAppliedRef.current = false
  }, [revertFrom])

  useEffect(() => {
    if (!adjustment || !isEditMode || editAppliedRef.current) return
    editAppliedRef.current = true
    reset({
      adjustmentDate: adjustment.adjustmentDate
        ? toDateInputValue(adjustment.adjustmentDate)
        : getCurrentDate(),
      notes: (adjustment as any).notes || '',
      items: ((adjustment as any).items ?? []).map((item: any) => ({
        productId: getAdjustmentItemProductId(item),
        // Prefer current live stock (backend-enriched) over the stored oldQuantity snapshot,
        // so a re-edited draft derives old/new from up-to-date stock (matches spec).
        liveStock: Number(item.liveStock ?? item.oldQuantity ?? 0),
        difference: Number(item.difference ?? 0),
        unitCost: Number(item.unitCost ?? 0),
      })),
    })
  }, [adjustment, isEditMode, reset])

  useEffect(() => {
    if (!adjustment || !isEditMode || !editAppliedRef.current) return

    const liveStockByProductId = ((adjustment as any).items ?? []).reduce(
      (map: Map<string, number>, item: any) => {
        const pid = getAdjustmentItemProductId(item)
        if (pid) map.set(pid, Number(item.liveStock ?? item.oldQuantity ?? 0))
        return map
      },
      new Map<string, number>(),
    )

    ;(watchedItems ?? []).forEach((item, index) => {
      if (!item.productId) return
      const liveStock = liveStockByProductId.get(item.productId)
      if (liveStock === undefined || liveStock === item.liveStock) return

      setValue(`items.${index}.liveStock`, liveStock, {
        shouldDirty: false,
        shouldValidate: false,
      })
    })
  }, [adjustment, isEditMode, watchedItems, setValue])

  useEffect(() => {
    if (!revertFrom || !sourceAdjustment || revertAppliedRef.current) return
    if ((sourceAdjustment as any).status !== 'completed') {
      showError('Cannot revert an adjustment that is not completed')
      navigate(`/inventory/stock-adjustments/${revertFrom}/view`)
      return
    }
    revertAppliedRef.current = true
    const grouped = new Map<string, { productId: string; unitCost: number; diffSum: number }>()
    ;((sourceAdjustment as any).items ?? []).forEach((item: any) => {
      const productId = getAdjustmentItemProductId(item)
      if (!productId) return
      const existing = grouped.get(productId)
      if (existing) {
        existing.diffSum += Number(item.difference) || 0
      } else {
        grouped.set(productId, {
          productId,
          unitCost: Number(item.unitCost) || 0,
          diffSum: Number(item.difference) || 0,
        })
      }
    })
    const prefillItems = Array.from(grouped.values())
      .map((g) => {
        const product =
          products.find((p: any) => p.id === g.productId) ??
          fallbackProductsById.get(g.productId)
        return {
          productId: g.productId,
          liveStock: Number(product?.stockQuantity ?? 0),
          difference: -g.diffSum,
          unitCost: g.unitCost,
        }
      })
      .filter((item) => item.difference !== 0)
    reset({
      adjustmentDate: getCurrentDate(),
      notes: '',
      items: prefillItems.length > 0 ? prefillItems : [{ productId: '', liveStock: 0, difference: 0, unitCost: 0 }],
    })
  }, [revertFrom, sourceAdjustment, products, fallbackProductsById, reset, navigate, showError])

  const hasNegativeStock = (watchedItems ?? []).some((item) => {
    if (!item.productId) return false
    return calculateQtyAfter(item.liveStock, item.difference) < 0
  })

  const selectedProductIds = useMemo(
    () =>
      new Set(
        (watchedItems ?? []).map((item) => item.productId).filter(Boolean),
      ),
    [watchedItems],
  )

  const handleProductSelect = (index: number, product: any) => {
    if (!product) {
      setDuplicateError(null)
      setValue(`items.${index}.productId`, '', { shouldDirty: true, shouldValidate: true })
      setValue(`items.${index}.liveStock`, 0, { shouldDirty: true })
      setValue(`items.${index}.unitCost`, 0, { shouldDirty: true })
      return
    }
    const existing = (watchedItems ?? []).find(
      (item, i) => i !== index && item.productId === product.id,
    )
    if (existing) {
      setDuplicateError(`Product "${product.name}" is already in the items list`)
      return
    }
    setDuplicateError(null)
    setValue(`items.${index}.productId`, product.id, { shouldDirty: true, shouldValidate: true })
    setValue(`items.${index}.liveStock`, Number(product.stockQuantity) || 0, { shouldDirty: true })
    setValue(`items.${index}.unitCost`, Number(product.baseCost) || 0, { shouldDirty: true })
  }

  const onSubmit = async (data: FormData) => {
    setPageError(null)
    try {
      const items = data.items
        .filter((item) => item.productId && (Number(item.difference) || 0) !== 0)
        .map((item) => ({
          productId: item.productId,
          oldQuantity: Number(item.liveStock),
          difference: Number(item.difference),
          unitCost: Number(item.unitCost),
        }))
      const payload = {
        adjustmentDate: data.adjustmentDate,
        notes: data.notes || undefined,
        items,
      }
      if (isEditMode && id) {
        const updated = await updateStockAdjustment({ id, data: payload }).unwrap()
        showSuccess(`Stock adjustment ${updated.adjustmentNumber || ''} updated successfully`)
        navigate(editReturnPath ?? '/inventory/stock-adjustments')
      } else {
        const created = await createStockAdjustment(payload).unwrap()
        showSuccess(`Stock adjustment ${created.adjustmentNumber || ''} created successfully`)
        navigate('/inventory/stock-adjustments')
      }
    } catch (err: any) {
      const msg = err?.data?.message || err?.message || 'Failed to save stock adjustment'
      setPageError(msg)
      showError(msg)
    }
  }

  const pageLoading = productsLoading || (isEditMode && adjustmentLoading) || (!!revertFrom && sourceLoading)

  if (pageLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <Typography>Loading...</Typography>
      </Box>
    )
  }

  return (
    <>
      <TransactionFormShell
        title={isEditMode ? 'Edit Stock Adjustment' : revertFrom ? 'Revert Stock Adjustment' : 'Create Stock Adjustment'}
        subtitle={isEditMode ? 'Update adjustment details and quantities' : 'Adjust stock quantities for inventory corrections'}
        backAction={() => navigate(editReturnPath ?? '/inventory/stock-adjustments')}
        onSubmit={handleSubmit(onSubmit)}
        isSaving={isSaving}
        submitLabel={isEditMode ? 'Update Adjustment' : 'Create Adjustment'}
        submitDisabled={hasNegativeStock}
        onCancel={() => navigate(editReturnPath ?? '/inventory/stock-adjustments')}
      >
        <Grid size={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Adjustment Info
              </Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}>
                  <TextField
                    fullWidth
                    size="small"
                    label="Adjustment Number"
                    value={isEditMode ? (adjustment?.adjustmentNumber ?? '') : (adjustmentNumberPreview ?? '')}
                    slotProps={{ input: { readOnly: true }, inputLabel: { shrink: true } }}
                    sx={fieldSx}
                  />
                </Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Controller
                    name="adjustmentDate"
                    control={control}
                    render={({ field }) => (
                      <DatePicker
                        label="Adjustment Date"
                        value={field.value ? parseISO(field.value) : null}
                        format={pickerFormat}
                        onChange={(date) =>
                          field.onChange(date && isValid(date) ? format(date, 'yyyy-MM-dd') : '')
                        }
                        slotProps={{
                          textField: {
                            required: true,
                            fullWidth: true,
                            size: 'small',
                            error: !!errors.adjustmentDate,
                            helperText: errors.adjustmentDate?.message,
                            sx: fieldSx,
                          },
                        }}
                      />
                    )}
                  />
                </Grid>
              </Grid>
            </CardContent>
          </Card>
        </Grid>

        <Grid size={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Line Items
              </Typography>

              {duplicateError && (
                <Alert severity="warning" sx={{ mb: 2 }} onClose={() => setDuplicateError(null)}>
                  {duplicateError}
                </Alert>
              )}

              {hasNegativeStock && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  This adjustment will result in negative stock for some products. Reduce quantity or
                  adjust stock first.
                </Alert>
              )}

              <TableContainer component={Paper} sx={{ border: `1px solid ${theme.palette.divider}` }}>
                <Table size="small" sx={LINE_ITEM_TABLE_SX(theme)}>
                  <TableHead>
                    <TableRow>
                      <TableCell sx={{ width: '25%', minWidth: 200 }}>Product</TableCell>
                      <TableCell align="center" sx={{ width: '12%', minWidth: 80 }}>
                        Current Stock
                      </TableCell>
                      <TableCell align="center" sx={{ width: '12%', minWidth: 80 }}>
                        Qty Change
                      </TableCell>
                      <TableCell align="center" sx={{ width: '12%', minWidth: 80 }}>
                        Qty After
                      </TableCell>
                      <TableCell align="center" sx={{ width: '12%', minWidth: 80 }}>
                        Unit Cost
                      </TableCell>
                      <TableCell align="center" sx={{ width: '12%', minWidth: 80 }}>
                        Total
                      </TableCell>
                      <TableCell align="center" sx={{ width: '8%', minWidth: 60 }} />
                      <TableCell align="center" sx={{ width: '5%', minWidth: 40 }}>
                        #
                      </TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {fields.map((field, index) => (
                      <TableRow key={field.id}>
                        <TableCell sx={{ padding: '2px !important' }}>
                          <Controller
                            name={`items.${index}.productId`}
                            control={control}
                            render={({ field: pdField }) => (
                              <Autocomplete
                                options={(() => {
                                  const base = products.filter(
                                    (p: any) =>
                                      p.id === pdField.value ||
                                      !selectedProductIds.has(p.id),
                                  )
                                  const fb = fallbackProductsById.get(pdField.value)
                                  return fb && !base.some((p: any) => p.id === fb.id)
                                    ? [...base, fb]
                                    : base
                                })()}
                                getOptionLabel={(option: any) => option?.name || ''}
                                isOptionEqualToValue={(option: any, value: any) => option.id === value.id}
                                value={
                                  products.find((p: any) => p.id === pdField.value) ??
                                  fallbackProductsById.get(pdField.value) ??
                                  null
                                }
                                onChange={(_, value) => handleProductSelect(index, value)}
                                size="small"
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    placeholder="Search product..."
                                    variant="outlined"
                                    error={!!errors.items?.[index]?.productId}
                                    helperText={errors.items?.[index]?.productId?.message}
                                    sx={{
                                      '& .MuiInputBase-input': {
                                        textAlign: 'left !important',
                                        padding: '2px 8px !important',
                                        fontSize: '0.875rem',
                                      },
                                    }}
                                  />
                                )}
                                slotProps={{
                                  paper: {
                                    sx: {
                                      '& .MuiAutocomplete-option': { fontSize: '0.875rem' },
                                    },
                                  },
                                }}
                              />
                            )}
                          />
                        </TableCell>
                        <TableCell align="center" sx={{ padding: '2px 8px !important' }}>
                          <Typography
                            variant="body2"
                            sx={{ color: 'text.secondary' }}
                            data-testid={`liveStock-${index}`}
                          >
                            {watchedItems?.[index]?.liveStock ?? 0}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ padding: '2px !important' }}>
                          <Controller
                            name={`items.${index}.difference`}
                            control={control}
                            render={({ field: diffField }) => {
                              const displayValue = String(diffField.value ?? '')
                              return (
                                <TextField
                                  value={displayValue}
                                  onChange={(e) => {
                                    const raw = e.target.value
                                    if (raw === '' || raw === '-') {
                                      diffField.onChange(raw)
                                      return
                                    }
                                    const num = Number(raw)
                                    if (!isNaN(num)) diffField.onChange(num)
                                  }}
                                  variant="outlined"
                                  error={!!errors.items?.[index]?.difference}
                                  helperText={errors.items?.[index]?.difference?.message}
                                  slotProps={{
                                    htmlInput: {
                                      style: { textAlign: 'center', fontSize: '0.875rem' },
                                      inputMode: 'numeric',
                                      'data-testid': `items.${index}.difference`,
                                    },
                                  }}
                                />
                              )
                            }}
                          />
                        </TableCell>
                        <TableCell align="center" sx={{ padding: '2px 8px !important' }}>
                          <Typography
                            variant="body2"
                            data-testid={`qtyAfter-${index}`}
                            sx={{
                              fontWeight: 600,
                              color:
                                calculateQtyAfter(
                                  watchedItems?.[index]?.liveStock ?? 0,
                                  watchedItems?.[index]?.difference ?? 0,
                                ) < 0
                                  ? 'error.main'
                                  : 'text.primary',
                            }}
                          >
                            {calculateQtyAfter(
                              watchedItems?.[index]?.liveStock ?? 0,
                              watchedItems?.[index]?.difference ?? 0,
                            )}
                          </Typography>
                        </TableCell>
                        <TableCell align="center" sx={{ padding: '2px 8px !important' }}>
                          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                            {formatCurrency(watchedItems?.[index]?.unitCost ?? 0)}
                          </Typography>
                        </TableCell>
                        <TableCell align="center" sx={{ padding: '2px 8px !important' }}>
                          <Typography variant="body2" sx={{ fontWeight: 600 }}>
                            {formatCurrency(
                              Math.abs(Number(watchedItems?.[index]?.difference) || 0) *
                                (Number(watchedItems?.[index]?.unitCost) || 0),
                            )}
                          </Typography>
                        </TableCell>
                        <TableCell align="center" sx={{ padding: '2px !important' }}>
                          <IconButton
                            onClick={() => remove(index)}
                            disabled={fields.length === 1}
                            size="small"
                            sx={{
                              color: theme.palette.error.main,
                              '&.Mui-disabled': { color: theme.palette.action.disabled },
                            }}
                          >
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </TableCell>
                        <TableCell sx={{ width: 40, padding: '2px !important' }}>
                          <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
                            {index + 1}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>

              <Box sx={{ mt: 2 }}>
                <AppButton
                  variant="secondary"
                  startIcon={<AddIcon />}
                  onClick={() => append({ productId: '', liveStock: 0, difference: 0, unitCost: 0 })}
                >
                  Add Item
                </AppButton>
              </Box>

              {errors.items && !Array.isArray(errors.items) && (
                <Alert severity="error" sx={{ mt: 1 }}>
                  {(errors.items as any).message}
                </Alert>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid size={12}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Additional
              </Typography>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Additional Notes (Optional)"
                    multiline
                    rows={3}
                    fullWidth
                    sx={fieldSx}
                  />
                )}
              />
            </CardContent>
          </Card>
        </Grid>

        {pageError && (
          <Grid size={12}>
            <Alert severity="error">{pageError}</Alert>
          </Grid>
        )}
      </TransactionFormShell>
      {UnsavedChangesDialog}
    </>
  )
}

export default CreateStockAdjustmentPage
