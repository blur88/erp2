import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Box,
  Grid,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Paper,
  Autocomplete,
  Alert,
  Card,
  CardContent,
  useTheme,
} from '@mui/material'
import { default as AddIcon } from '@mui/icons-material/Add'
import { default as DeleteIcon } from '@mui/icons-material/Delete'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { ApiService } from '@/services/api'
import { AppButton } from '@/components/common/AppButton'
import PageHeader from '@/components/common/PageHeader'
import TransactionForm from '@/components/common/TransactionForm'
import {
  useLazyGetStockAdjustmentByNumberQuery,
  useCreateStockAdjustmentMutation,
  useUpdateStockAdjustmentMutation,
} from '@/store/api/inventoryApi'
import { useProductSearch } from '@/hooks/useProductSearch'
import { getCurrentDate } from '@/utils/formatters'
import { useNotification } from '@/hooks/useNotification'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'

interface AdjustmentItem {
  productId: string
  product?: any
  newQuantity: number
  oldQuantity: number
  difference: number
}

interface CreateAdjustmentFormData {
  adjustmentDate: string
  notes?: string
  items: AdjustmentItem[]
}

const schema = yup.object({
  adjustmentDate: yup.string().required('Adjustment date is required'),
  notes: yup.string().optional(),
  items: yup.array().of(
    yup.object({
      productId: yup.string().required('Product is required'),
      newQuantity: yup.number().min(0, 'New quantity cannot be negative').required(),
      oldQuantity: yup.number().required(),
      difference: yup.number().required(),
    })
  ).min(1, 'At least one item is required'),
})

const CreateStockAdjustmentPage: React.FC = () => {
  const theme = useTheme()
  const navigate = useNavigate()
  const { adjustmentNumber } = useParams<{ adjustmentNumber: string }>()
  const isEditMode = !!adjustmentNumber
  const { showSuccess, showError } = useNotification()
  const { products, loadProducts, seedProducts } = useProductSearch()
  const [createStockAdjustment, { isLoading: isCreating }] = useCreateStockAdjustmentMutation()
  const [updateStockAdjustment, { isLoading: isUpdating }] = useUpdateStockAdjustmentMutation()
  const [triggerGetStockAdjustmentByNumber] = useLazyGetStockAdjustmentByNumberQuery()
  const loading = isCreating || isUpdating
  const [loadingAdjustment, setLoadingAdjustment] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [adjustmentToLoad, setAdjustmentToLoad] = useState<any>(null)
  const [editingAdjustmentId, setEditingAdjustmentId] = useState<string | null>(null)

  const { control, handleSubmit, watch, setValue, reset, formState: { errors, isDirty } } = useForm<CreateAdjustmentFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      adjustmentDate: getCurrentDate(),
      notes: '',
      items: [
        {
          productId: '',
          newQuantity: 0,
          oldQuantity: 0,
          difference: 0,
        }
      ],
    },
  })
  const { UnsavedChangesDialog } = useUnsavedChangesGuard(isDirty)

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  })

  const watchedItems = watch('items')

  useEffect(() => {
    loadProducts()
  }, [])

  // Load stock adjustment data in edit mode
  useEffect(() => {
    if (isEditMode && adjustmentNumber) {
      loadStockAdjustment(adjustmentNumber)
    }
  }, [adjustmentNumber, isEditMode])

  const loadStockAdjustment = async (currentAdjustmentNumber: string) => {
    setLoadingAdjustment(true)
    try {
      const adjustment = await triggerGetStockAdjustmentByNumber(currentAdjustmentNumber).unwrap()
      setEditingAdjustmentId(adjustment.id)

      // Extract products from adjustment items and add to products state
      if (adjustment.items && adjustment.items.length > 0) {
        const adjustmentProducts = adjustment.items
          .filter((item: any) => item.product)
          .map((item: any) => item.product)

        seedProducts(adjustmentProducts)
      }

      // Store adjustment data to be loaded after products are set
      setAdjustmentToLoad(adjustment)
    } catch (err: any) {
      showError(err?.data?.message || err?.message || 'Failed to load stock adjustment')
      setError('Failed to load stock adjustment')
      setLoadingAdjustment(false)
    }
  }

  // Reset form after products are loaded
  useEffect(() => {
    if (adjustmentToLoad && products.length > 0) {
      const itemsToReset = adjustmentToLoad.items?.map((item: any) => {
        const productId = item.productId || item.product?.id || ''

        return {
          productId,
          product: item.product,
          newQuantity: Number(item.newQuantity) || 0,
          oldQuantity: Number(item.oldQuantity) || 0,
          difference: Number(item.difference) || 0,
        }
      })

      // Map adjustment data to form
      reset({
        adjustmentDate: adjustmentToLoad.adjustmentDate
          ? new Date(adjustmentToLoad.adjustmentDate).toISOString().split('T')[0]
          : getCurrentDate(),
        notes: adjustmentToLoad.notes || '',
        items: itemsToReset || [
          {
            productId: '',
            newQuantity: 0,
            oldQuantity: 0,
            difference: 0,
          }
        ],
      })

      setAdjustmentToLoad(null)
      setLoadingAdjustment(false)
    }
  }, [adjustmentToLoad, products, reset])

  // Recalculate difference when quantities change
  useEffect(() => {
    watchedItems.forEach((item, index) => {
      const newQty = Number(item.newQuantity) || 0
      const oldQty = Number(item.oldQuantity) || 0
      const diff = newQty - oldQty

      if (item.difference !== diff) {
        // Derived recompute — must NOT mark the form dirty, or loading an
        // existing adjustment would flip isDirty true with no user action.
        setValue(`items.${index}.difference`, diff)
      }
    })
  }, [JSON.stringify(watchedItems), setValue])

  const onSubmit = async (data: CreateAdjustmentFormData) => {
    setError(null)

    try {
      // Filter items with differences
      const itemsWithDifference = data.items.filter(item => item.difference !== 0)

      if (itemsWithDifference.length === 0) {
        showError('No changes to record. At least one item must have a difference.')
        return
      }

      // Create stock adjustment using the proper stock adjustments API
      const adjustmentData = {
        adjustmentDate: data.adjustmentDate,
        notes: data.notes || undefined,
        items: itemsWithDifference.map(item => ({
          productId: item.productId,
          newQuantity: item.newQuantity,
          oldQuantity: item.oldQuantity,
          difference: item.difference,
        })),
      }

      if (isEditMode && editingAdjustmentId) {
        // Edit mode: Update existing adjustment
        const updatedAdjustment = await updateStockAdjustment({ id: editingAdjustmentId, data: adjustmentData }).unwrap()
        const saNumber = updatedAdjustment?.adjustmentNumber || 'N/A'

        showSuccess(`Stock adjustment ${saNumber} updated successfully`)
        navigate(`/inventory/stock-adjustments?highlight=${updatedAdjustment.id}`)
      } else {
        // Create mode: Create new adjustment (kept as draft)
        const adjustment = await createStockAdjustment(adjustmentData).unwrap()

        const saNumber = adjustment?.adjustmentNumber || 'N/A'
        const itemsAdjusted = adjustment?.itemCount || 0
        const status = adjustment?.status || 'draft'

        showSuccess(`Stock adjustment ${saNumber} created successfully (${itemsAdjusted} items) - Status: ${status}`)
        navigate(`/inventory/stock-adjustments?highlight=${adjustment.id}`)
      }
    } catch (err: any) {
      setError(err.data?.message || err.message || 'Failed to record stock adjustments')
      showError(err.data?.message || err.message || 'Failed to record stock adjustments')
    }
  }

  const handleProductSelect = async (index: number, product: any) => {
    if (product) {
      // Keep selected product in the options list so it stays visible if another row's search replaces products
      seedProducts([product])
      // Fetch fresh product data to get current stock
      try {
        const response = await ApiService.get(`/inventory/products/${product.id}`)
        const freshProduct = (response as any).data || product

        setValue(`items.${index}.productId`, freshProduct.id, { shouldDirty: true })
        setValue(`items.${index}.product`, freshProduct, { shouldDirty: true })
        seedProducts([freshProduct])
        setValue(`items.${index}.oldQuantity`, Number(freshProduct.stockQuantity || 0), { shouldDirty: true })
        setValue(`items.${index}.newQuantity`, Number(freshProduct.stockQuantity || 0), { shouldDirty: true })
      } catch (err) {
        console.error('Error fetching product:', err)
        setValue(`items.${index}.productId`, product.id, { shouldDirty: true })
        setValue(`items.${index}.product`, product, { shouldDirty: true })
        setValue(`items.${index}.oldQuantity`, Number(product.stockQuantity || 0), { shouldDirty: true })
        setValue(`items.${index}.newQuantity`, Number(product.stockQuantity || 0), { shouldDirty: true })
      }
    }
  }

  const formatNumberWithCommas = (value: number | string): string => {
    if (value === '' || value === null || value === undefined) return ''
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return ''
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  const parseFormattedNumber = (value: string): number => {
    return parseFloat(value.replace(/,/g, '')) || 0;
  }

  const addItem = () => {
    append({
      productId: '',
      newQuantity: 0,
      oldQuantity: 0,
      difference: 0,
    })
  }

  return (
    <>
      {/* Header */}
      <PageHeader
        variant="workflow"
        title={isEditMode ? 'Edit Stock Adjustment' : 'Create Stock Adjustment'}
        subtitle={isEditMode ? 'Update adjustment details and quantities' : 'Adjust stock quantities for inventory corrections'}
        backAction={() => navigate('/inventory/stock-adjustments')}
      />
      {loadingAdjustment ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <Typography>Loading stock adjustment...</Typography>
        </Box>
      ) : (
        <TransactionForm
          mode="custom"
          entityLabel={undefined}
          entityOptions={[]}
          lineItemColumns={[
            { key: 'product', label: 'Product' },
            { key: 'adjustmentType', label: 'Adjustment Type' },
            { key: 'quantity', label: 'Quantity' },
            { key: 'notes', label: 'Notes' },
          ]}
          onSubmit={handleSubmit(onSubmit, () => showError('Please fix the form errors before submitting.'))}
          onCancel={() => navigate('/inventory/stock-adjustments')}
          isSubmitting={loading}
          hideDefaultActions
          error={error ? (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          ) : null}
        >
          <Grid container spacing={3}>
          {/* Date Field */}
          <Grid size={12}>
            <Card>
              <CardContent>
                <Typography variant="h6" gutterBottom>Adjustment Information</Typography>
                <Grid container spacing={2}>
                  <Grid
                    size={{
                      xs: 12,
                      md: 6
                    }}>
                    <Controller
                      name="adjustmentDate"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label="Adjustment Date"
                          type="date"
                          slotProps={{ inputLabel: { shrink: true } }}
                          error={!!errors.adjustmentDate}
                          helperText={errors.adjustmentDate?.message}
                          required
                          fullWidth
                          size="small"
                          sx={{
                            '& .MuiInputBase-input': {
                              fontSize: '0.875rem',
                            },
                            '& .MuiInputLabel-root': {
                              fontSize: '0.875rem',
                            }
                          }}
                        />
                      )}
                    />
                  </Grid>
                </Grid>
              </CardContent>
            </Card>
          </Grid>

          {/* Items Table */}
          <Grid size={12}>
            <Card>
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                  <Typography variant="h6">Adjustment Items</Typography>
                  <AppButton
                    variant="secondary"
                    startIcon={<AddIcon />}
                    onClick={addItem}
                  >
                    Add Item
                  </AppButton>
                </Box>

                <TableContainer component={Paper} sx={{ border: `1px solid ${theme.palette.divider}` }}>
                  <Table
                    size="small"
                    sx={{
                      '& .MuiTableCell-root': {
                        border: `1px solid ${theme.palette.divider}`,
                        padding: '4px 8px',
                        fontSize: '0.875rem',
                      },
                      '& .MuiTableHead-root .MuiTableCell-root': {
                        backgroundColor: theme.palette.grey[50],
                        fontWeight: 600,
                        color: theme.palette.text.primary,
                        border: `1px solid ${theme.palette.divider}`,
                      },
                      '& .MuiTableBody-root .MuiTableRow-root:hover': {
                        backgroundColor: theme.palette.action.hover,
                      },
                      '& .MuiTextField-root': {
                        '& .MuiOutlinedInput-root': {
                          border: 'none',
                          '& fieldset': {
                            border: 'none',
                          },
                          '&:hover fieldset': {
                            border: `1px solid ${theme.palette.primary.main}`,
                          },
                          '&.Mui-focused fieldset': {
                            border: `1px solid ${theme.palette.primary.main}`,
                          },
                          backgroundColor: 'transparent',
                          fontSize: '0.875rem',
                        },
                        '& .MuiInputBase-input': {
                          padding: '6px 8px',
                          textAlign: 'center',
                        },
                        '& .MuiFormHelperText-root': {
                          position: 'absolute',
                          bottom: '-20px',
                          fontSize: '0.75rem',
                        },
                      },
                      '& .MuiAutocomplete-root .MuiTextField-root .MuiInputBase-input': {
                        textAlign: 'left',
                      }
                    }}
                  >
                    <TableHead>
                      <TableRow>
                        <TableCell align="center" sx={{ width: '35%', minWidth: 200 }}>Product</TableCell>
                        <TableCell align="center" sx={{ width: '15%', minWidth: 100 }}>New Quantity</TableCell>
                        <TableCell align="center" sx={{ width: '15%', minWidth: 100 }}>Old Quantity</TableCell>
                        <TableCell align="center" sx={{ width: '15%', minWidth: 100 }}>Difference</TableCell>
                        <TableCell align="center" sx={{ width: '8%', minWidth: 60 }}>Action</TableCell>
                        <TableCell align="center" sx={{ width: '5%', minWidth: 40 }}></TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {fields.map((field, index) => (
                        <TableRow key={field.id}>
                          <TableCell sx={{ padding: '2px !important' }}>
                            <Controller
                              name={`items.${index}.productId`}
                              control={control}
                              render={({ field: productField }) => (
                                <Autocomplete
                                  options={products}
                                  getOptionLabel={(option) => option?.name || ''}
                                  isOptionEqualToValue={(option, value) => option.id === value.id}
                                  value={watchedItems[index]?.product || products.find(p => p.id === productField.value) || null}
                                  onChange={(_, value) => handleProductSelect(index, value)}
                                  onInputChange={(_, value, reason) => {
                                    if (reason === 'input' && value.trim().length >= 1) {
                                      loadProducts(value)
                                    } else if (reason === 'input') {
                                      loadProducts('')
                                    }
                                  }}
                                  filterOptions={(options) => options}
                                  size="small"
                                  renderInput={(params) => (
                                    <TextField
                                      {...params}
                                      placeholder="Search by name or barcode..."
                                      variant="outlined"
                                      error={!!errors.items?.[index]?.productId}
                                      helperText={errors.items?.[index]?.productId?.message}
                                      sx={{
                                        '& .MuiInputBase-input': {
                                          textAlign: 'left !important',
                                          padding: '6px 8px !important',
                                          fontSize: '0.875rem',
                                        }
                                      }}
                                    />
                                  )}
                                  sx={{
                                    '& .MuiAutocomplete-inputRoot': {
                                      padding: '0 !important',
                                    }
                                  }}
                                  slotProps={{
                                    paper: {
                                      sx: {
                                        '& .MuiAutocomplete-option': {
                                          fontSize: '0.875rem',
                                        }
                                      }
                                    }
                                  }}
                                />
                              )}
                            />
                          </TableCell>
                          <TableCell sx={{ padding: '2px !important' }}>
                            <Controller
                              name={`items.${index}.newQuantity`}
                              control={control}
                              render={({ field: qtyField }) => {
                                const [displayValue, setDisplayValue] = React.useState(formatNumberWithCommas(qtyField.value))
                                const [isFocused, setIsFocused] = React.useState(false)

                                React.useEffect(() => {
                                  if (!isFocused) {
                                    setDisplayValue(formatNumberWithCommas(qtyField.value))
                                  }
                                }, [qtyField.value, isFocused])

                                return (
                                  <TextField
                                    value={displayValue}
                                    onChange={(e) => {
                                      const value = e.target.value.replace(/[^0-9]/g, '')
                                      setDisplayValue(value)
                                      qtyField.onChange(parseInt(value) || 0)
                                    }}
                                    onFocus={() => {
                                      setIsFocused(true)
                                      setDisplayValue(qtyField.value?.toString() || '')
                                    }}
                                    onBlur={() => {
                                      setIsFocused(false)
                                      setDisplayValue(formatNumberWithCommas(qtyField.value))
                                    }}
                                    variant="outlined"
                                    slotProps={{
                                      htmlInput: {
                                        style: { textAlign: 'center', fontSize: '0.875rem' },
                                        inputMode: 'numeric',
                                        pattern: '[0-9]*',
                                        'data-testid': `items.${index}.newQuantity`,
                                      }
                                    }}
                                    error={!!errors.items?.[index]?.newQuantity}
                                    helperText={errors.items?.[index]?.newQuantity?.message}
                                  />
                                );
                              }}
                            />
                          </TableCell>
                          <TableCell align="center" sx={{ padding: '2px 8px !important' }}>
                            <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                              {formatNumberWithCommas(watchedItems[index]?.oldQuantity || 0)}
                            </Typography>
                          </TableCell>
                          <TableCell align="center" sx={{ padding: '2px 8px !important' }}>
                            <Typography
                              variant="body2"
                              sx={{
                                fontWeight: "600",
                                fontSize: '0.875rem',

                                color: watchedItems[index]?.difference > 0
                                  ? 'success.main'
                                  : watchedItems[index]?.difference < 0
                                  ? 'error.main'
                                  : 'text.primary'
                              }}>
                              {watchedItems[index]?.difference > 0 ? '+' : ''}
                              {formatNumberWithCommas(watchedItems[index]?.difference || 0)}
                            </Typography>
                          </TableCell>
                          <TableCell align="center" sx={{ padding: '2px !important' }}>
                            <IconButton
                              onClick={() => remove(index)}
                              disabled={fields.length === 1}
                              size="small"
                              sx={{
                                color: theme.palette.error.main,
                                '&:hover': { backgroundColor: theme.palette.error.light },
                                '&.Mui-disabled': { color: theme.palette.action.disabled }
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
              </CardContent>
            </Card>
          </Grid>

          {/* Notes */}
          <Grid size={12}>
            <Card>
              <CardContent>
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
                      sx={{
                        '& .MuiInputBase-input': {
                          fontSize: '0.875rem',
                        },
                        '& .MuiInputLabel-root': {
                          fontSize: '0.875rem',
                        }
                      }}
                    />
                  )}
                />
              </CardContent>
            </Card>
          </Grid>

          {/* Action Buttons */}
          <Grid size={12}>
            <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
              <AppButton
                variant="outlined"
                onClick={() => navigate('/inventory/stock-adjustments')}
                disabled={loading}
              >
                Cancel
              </AppButton>
              <AppButton
                variant="primary"
                type="submit"
                loading={loading}
              >
                {isEditMode ? 'Update Adjustment' : 'Create Adjustment'}
              </AppButton>
            </Box>
          </Grid>
          </Grid>
        </TransactionForm>
      )}
      {UnsavedChangesDialog}
    </>
  );
}

export default CreateStockAdjustmentPage
