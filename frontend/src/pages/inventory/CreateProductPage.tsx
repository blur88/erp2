import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Box,
  Grid,
  TextField,
  Typography,
  Alert,
  Card,
  CardContent,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  MenuItem,
} from '@mui/material'
import { useTheme } from '@mui/material/styles'

import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { useGetPriceListsQuery, useBulkUpdatePricesMutation, priceListApiSlice } from '@/store/api/priceListApi'
import { useCreateProductMutation, useLazyGetProductBySlugQuery, useUpdateProductMutation } from '@/store/api/inventoryApi'
import { useDispatch } from 'react-redux'
import { useNotification } from '@/hooks/useNotification'
import { AppButton } from '@/components/common/AppButton'
import MarginChip from '@/components/common/MarginChip'
import PageHeader from '@/components/common/PageHeader'
import CategorySelector from '@/components/inventory/CategorySelector'
import { Category, PriceList } from '@/types'
import { useDuplicateCheck } from '@/hooks/useDuplicateCheck'
import { useCurrency } from '@/hooks/useCurrency'
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'

// Price field component for price list items
const PriceListPriceField: React.FC<{
  priceList: PriceList
  currency: string
  value: number
  baseCost: number
  onChange: (value: number) => void
}> = ({ priceList, currency, value, baseCost, onChange }) => {
  const theme = useTheme()
  const [localValue, setLocalValue] = useState(value > 0 ? value.toFixed(2) : '')
  const [isFocused, setIsFocused] = useState(false)

  useEffect(() => {
    if (!isFocused) {
      setLocalValue(value > 0 ? value.toFixed(2) : '')
    }
  }, [value, isFocused])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value
    newValue = newValue.replace(/[^0-9.]/g, '')

    const parts = newValue.split('.')
    if (parts.length > 2) {
      newValue = parts[0] + '.' + parts.slice(1).join('')
    }

    setLocalValue(newValue)

    if (newValue === '' || newValue === '.') {
      onChange(0)
    } else {
      const numValue = parseFloat(newValue)
      if (!isNaN(numValue)) {
        onChange(numValue)
      }
    }
  }

  const handleBlur = () => {
    setIsFocused(false)
    if (value > 0) {
      setLocalValue(value.toFixed(2))
    }
  }

  return (
    <Grid size={{ xs: 12, md: 6 }}>
      <Box>
        <TextField
          id={`price-list-${priceList.id}`}
          value={localValue}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={handleBlur}
          label={`${priceList.name} Price`}
          fullWidth
          size="small"
          type="text"
          slotProps={{
            input: {
              startAdornment: <span style={{ marginRight: '4px', fontSize: '0.75rem', color: theme.palette.text.secondary }}>{currency}</span>
            }
          }}
          sx={{
            '& .MuiInputBase-input': {
              textAlign: 'right',
            },
          }}
        />
        {value > 0 && baseCost > 0 && (
          <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>Margin:</Typography>
            <MarginChip price={value} cost={baseCost} />
          </Box>
        )}
      </Box>
    </Grid>
  );
}

interface ProductFormData {
  name: string
  description: string
  barcode?: string
  type: 'Stocked Product' | 'Service'
  categoryId: string
  baseCost: number
  stockQuantity?: number
  notes: string
  isActive: boolean
}

interface PriceListPrice {
  priceListId: string
  price: number
}

const productSchema = yup.object({
  name: yup.string().required('Product name is required').min(2, 'Name must be at least 2 characters'),
  description: yup.string(),
  barcode: yup.string().optional(),
  type: yup.string().required('Product type is required'),
  categoryId: yup.string().required('Category is required').test(
    'not-main-category',
    'Please select a valid category',
    (value) => value !== 'main'
  ),
  baseCost: yup.number().transform((value, originalValue) => originalValue === '' || originalValue === null || originalValue === undefined ? undefined : value).min(0, 'Base cost must be 0 or greater').nullable().optional(),
  stockQuantity: yup.number().transform((value, originalValue) => originalValue === '' || originalValue === null || originalValue === undefined ? undefined : value).integer('Stock must be a whole number').min(0, 'Stock must be 0 or greater').nullable().optional(),
  notes: yup.string(),
  isActive: yup.boolean(),
})

const CreateProductPage: React.FC = () => {
  const theme = useTheme()
  const navigate = useNavigate()
  const { slug } = useParams<{ slug: string }>()
  const isEditMode = !!slug
  const { showSuccess, showError } = useNotification()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [priceListPrices, setPriceListPrices] = useState<Record<string, number>>({})
  const [editingProductId, setEditingProductId] = useState<string | null>(null)

  const { data: priceListsData, isLoading: loadingPriceLists } = useGetPriceListsQuery({ isActive: true })
  const priceLists = priceListsData?.data ?? []
  const [bulkUpdatePrices] = useBulkUpdatePricesMutation()
  const [updateProduct] = useUpdateProductMutation()
  const [createProduct] = useCreateProductMutation()
  const [fetchProductBySlug, { isFetching: isFetchingProduct }] = useLazyGetProductBySlugQuery()
  const dispatch = useDispatch()

  // Currency hook
  const { currency } = useCurrency()

  const [pendingType, setPendingType] = useState<'Stocked Product' | 'Service' | null>(null)

  const { control, handleSubmit, watch, reset, setValue, formState: { errors, isDirty, isSubmitting } } = useForm<ProductFormData>({
    resolver: yupResolver(productSchema) as any,
    defaultValues: {
      name: '',
      description: '',
      barcode: '',
      type: 'Stocked Product',
      categoryId: '',
      baseCost: undefined as any,
      stockQuantity: undefined,
      notes: '',
      isActive: true,
    },
  })
  const { UnsavedChangesDialog } = useUnsavedChangesGuard(isDirty, isSubmitting)

  const watchedType = watch('type')
  const watchedName = watch('name')
  const watchedBarcode = watch('barcode')
  const watchedBaseCost = watch('baseCost')

  // Duplicate detection hook
  const {
    nameError,
    barcodeError,
    hasNameDuplicate,
    hasBarcodeDuplicate,
    hasCheckedName,
    hasCheckedBarcode
  } = useDuplicateCheck({
    name: watchedName,
    barcode: watchedBarcode,
    excludeId: isEditMode ? editingProductId ?? undefined : undefined,
  })

  // Update price for a specific price list
  const updatePriceListPrice = (priceListId: string, price: number) => {
    setPriceListPrices(prev => ({ ...prev, [priceListId]: price }))
  }

  useEffect(() => {
    if (isEditMode && slug) {
      loadProduct(slug)
    }
  }, [isEditMode, slug])

  const loadProduct = async (productSlug: string) => {
    try {
      const product = await fetchProductBySlug(productSlug).unwrap()
      setEditingProductId(product.id)

      if (product.category) {
        setSelectedCategory(product.category as Category)
      }

      reset({
        name: product.name || '',
        description: product.description || '',
        barcode: (product as any).barcode || '',
        type: (product.type as any) || 'Stocked Product',
        categoryId: product.categoryId || '',
        baseCost: product.baseCost || 0,
        stockQuantity: product.stockQuantity || 0,
        notes: (product as any).notes || '',
        isActive: product.isActive !== undefined ? product.isActive : true,
      })

      if ((product as any).priceListItems && Array.isArray((product as any).priceListItems)) {
        const pricesMap: Record<string, number> = {}
        ;(product as any).priceListItems.forEach((item: any) => {
          pricesMap[item.priceListId] = item.price
        })
        setPriceListPrices(pricesMap)
      }
    } catch (err: any) {
      showError(err?.message || 'Failed to load product')
      setError('Failed to load product')
    }
  }

  const onSubmit = async (data: ProductFormData) => {
    // Check for duplicates before submitting
    if (hasNameDuplicate) {
      showError(nameError)
      return
    }

    if (hasBarcodeDuplicate) {
      showError(barcodeError)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const productData = {
        name: data.name,
        description: data.description || '',
        barcode: data.barcode || undefined,
        type: data.type,
        categoryId: data.categoryId,
        baseCost: data.baseCost !== undefined && data.baseCost !== null ? Number(data.baseCost) : 0,
        stockQuantity: data.type === 'Stocked Product' ? (data.stockQuantity !== undefined && data.stockQuantity !== null ? Number(data.stockQuantity) : 0) : 0,
        notes: data.notes || '',
        isActive: data.isActive,
      }

      let productId = editingProductId

      if (isEditMode && editingProductId) {
        const response = await updateProduct({ id: editingProductId, data: productData }).unwrap()
        productId = response?.id ?? editingProductId
      } else {
        const response = await createProduct(productData).unwrap()
        productId = response?.id
      }

      // Save price list items if any prices were entered
      if (productId && Object.keys(priceListPrices).length > 0) {
        // Update prices for each price list
        for (const [priceListId, price] of Object.entries(priceListPrices)) {
          if (price >= 0) {
            try {
              await bulkUpdatePrices({
                priceListId,
                items: [{
                  productId,
                  price,
                  costBasis: data.baseCost || 0
                }]
              })
            } catch (error) {
              console.error(`Failed to update prices for price list ${priceListId}:`, error)
            }
          }
        }
        // In edit mode, invalidate the product-specific PriceListItem cache so
        // the product view (ProductOverviewTab) shows the updated prices immediately
        if (isEditMode) {
          dispatch(priceListApiSlice.util.invalidateTags([{ type: 'PriceListItem', id: `product-${productId}` }]))
        }
      }

      showSuccess(isEditMode ? 'Product updated successfully' : 'Product created successfully')

      navigate('/inventory/products')
    } catch (err: any) {
      console.error('Error saving product:', err)
      setError(err?.message || 'Failed to save product')
      showError(err?.message || 'Failed to save product')
    } finally {
      setLoading(false)
    }
  }

  const handleCancel = () => {
    navigate('/inventory/products')
  }

  const formatNumberWithCommas = (value: number | string): string => {
    if (value === '' || value === null || value === undefined) return ''
    const num = typeof value === 'string' ? parseFloat(value) : value
    if (isNaN(num)) return ''

    const fixed = num.toFixed(2)
    const parts = fixed.split('.')
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',')
    return parts.join('.')
  }

  const parseFormattedNumber = (value: string): number | undefined => {
    if (value === '' || value === null || value === undefined) return undefined
    const parsed = parseFloat(value.replace(/,/g, ''))
    return isNaN(parsed) ? undefined : parsed
  }

  const formatQuantity = (value: number | string): string => {
    if (value === '' || value === null || value === undefined) return ''
    const num = typeof value === 'string' ? parseInt(value) : Math.floor(value)
    if (isNaN(num)) return ''
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  const currentStockQuantity = Number(watch('stockQuantity') ?? 0)
  const isBlockedConversion =
    pendingType === 'Service' && currentStockQuantity > 0

  return (
    <>
      {/* Header */}
      <PageHeader
        variant="workflow"
        title={isEditMode ? 'Edit Product' : 'Create Product'}
        subtitle={isEditMode ? 'Update product details, pricing, and inventory settings' : 'Add a new product with details, pricing, and inventory settings'}
        backAction={() => navigate('/inventory/products')}
      />
      {isFetchingProduct ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <Typography>Loading product...</Typography>
        </Box>
      ) : (
        <>
        <form onSubmit={handleSubmit(onSubmit)}>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <Grid container spacing={3}>
            {/* LEFT COLUMN: Product Information + Pricing */}
            <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Product Information</Typography>
                  <Grid container spacing={2}>
                    <Grid size={12}>
                      <Controller
                        name="name"
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            label="Product Name"
                            error={!!errors.name || hasNameDuplicate}
                            helperText={
                              errors.name?.message ||
                              (hasNameDuplicate ? nameError :
                                (watchedName && watchedName.trim().length >= 2 && hasCheckedName && !hasNameDuplicate ?
                                  '✓ Name is available' : ''))
                            }
                            required
                            fullWidth
                            size="small"
                            sx={{
                              '& .MuiFormHelperText-root': {
                                color: hasNameDuplicate ? 'error.main' :
                                  (watchedName && watchedName.trim().length >= 2 && hasCheckedName && !hasNameDuplicate ?
                                    'success.main' : undefined)
                              }
                            }}
                          />
                        )}
                      />
                    </Grid>

                    <Grid size={12}>
                      <Controller
                        name="description"
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            label="Description"
                            multiline
                            rows={3}
                            fullWidth
                            size="small"
                          />
                        )}
                      />
                    </Grid>

                    <Grid
                      size={{
                        xs: 12,
                        md: 6
                      }}>
                      <Controller
                        name="barcode"
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            label="Barcode"
                            error={hasBarcodeDuplicate}
                            helperText={
                              hasBarcodeDuplicate ? barcodeError :
                                (watchedBarcode && watchedBarcode.trim().length >= 1 && hasCheckedBarcode && !hasBarcodeDuplicate ?
                                  '✓ Barcode is available' : '')
                            }
                            fullWidth
                            size="small"
                            sx={{
                              '& .MuiFormHelperText-root': {
                                color: hasBarcodeDuplicate ? 'error.main' :
                                  (watchedBarcode && watchedBarcode.trim().length >= 1 && hasCheckedBarcode && !hasBarcodeDuplicate ?
                                    'success.main' : undefined)
                              }
                            }}
                          />
                        )}
                      />
                    </Grid>

                    <Grid
                      size={{
                        xs: 12,
                        md: 6
                      }}>
                      <Controller
                        name="type"
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            select
                            label="Product Type"
                            error={!!errors.type}
                            helperText={errors.type?.message}
                            required
                            fullWidth
                            size="small"
                            onChange={(e) => {
                              const next = e.target.value as 'Stocked Product' | 'Service'
                              if (isEditMode && next !== field.value) {
                                setPendingType(next)
                              } else {
                                field.onChange(next)
                              }
                            }}
                          >
                            <MenuItem value="Stocked Product">Stocked Product</MenuItem>
                            <MenuItem value="Service">Service</MenuItem>
                          </TextField>
                        )}
                      />
                    </Grid>

                    <Grid size={12}>
                      <Controller
                        name="categoryId"
                        control={control}
                        render={({ field }) => (
                          <CategorySelector
                            value={selectedCategory}
                            onChange={(category) => {
                              setSelectedCategory(category)
                              field.onChange(category?.id || '')
                            }}
                            error={!!errors.categoryId}
                            helperText={errors.categoryId?.message}
                            size="small"
                          />
                        )}
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>

              {/* Pricing Card */}
              <Card sx={{ mt: 3 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Pricing</Typography>
                  <Grid container spacing={2}>
                    <Grid
                      size={{
                        xs: 12,
                        md: 6
                      }}>
                      <Controller
                        name="baseCost"
                        control={control}
                        render={({ field }) => {
                          const [displayValue, setDisplayValue] = useState(formatNumberWithCommas(field.value))
                          const [isFocused, setIsFocused] = useState(false)

                          React.useEffect(() => {
                            if (!isFocused) {
                              setDisplayValue(formatNumberWithCommas(field.value))
                            }
                          }, [field.value, isFocused])

                          return (
                            <TextField
                              value={displayValue}
                              onChange={(e) => {
                                const value = e.target.value.replace(/[^0-9.]/g, '')
                                setDisplayValue(value)
                                field.onChange(parseFormattedNumber(value))
                              }}
                              onFocus={() => {
                                setIsFocused(true)
                                setDisplayValue(field.value?.toString() || '')
                              }}
                              onBlur={() => {
                                setIsFocused(false)
                                setDisplayValue(formatNumberWithCommas(field.value))
                              }}
                              label="Base Cost"
                              error={!!errors.baseCost}
                              helperText={errors.baseCost?.message}
                              fullWidth
                              size="small"
                              slotProps={{
                                input: {
                                  startAdornment: <span style={{ marginRight: '4px', fontSize: '0.75rem', color: theme.palette.text.secondary }}>{currency}</span>
                                }
                              }}
                              sx={{
                                '& .MuiInputBase-input': {
                                  textAlign: 'right',
                                },
                              }}
                            />
                          );
                        }}
                      />
                    </Grid>

                    {/* Price List Fields */}
                    {loadingPriceLists ? (
                      <Grid size={12}>
                        <Typography variant="body2" sx={{
                          color: "text.secondary"
                        }}>Loading price lists...</Typography>
                      </Grid>
                    ) : priceLists.length > 0 ? (
                      priceLists.map((priceList) => (
                        <PriceListPriceField
                          key={priceList.id}
                          priceList={priceList}
                          currency={currency}
                          value={priceListPrices[priceList.id] || 0}
                          baseCost={watchedBaseCost || 0}
                          onChange={(price) => updatePriceListPrice(priceList.id, price)}
                        />
                      ))
                    ) : (
                      <Grid size={12}>
                        <Alert severity="info">
                          No price lists configured. Go to Settings → Price Lists to create price lists for different customer segments.
                        </Alert>
                      </Grid>
                    )}
                  </Grid>
                </CardContent>
              </Card>
            </Grid>

            {/* RIGHT COLUMN: Stock (conditional) + Notes */}
            <Grid size={{ xs: 12, md: 6 }} sx={{ display: 'flex', flexDirection: 'column' }}>
              {/* Stock Card - Only for Stocked Products */}
              {watchedType === 'Stocked Product' && (
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Stock Information</Typography>
                    <Grid container spacing={2}>
                      <Grid
                        size={{
                          xs: 12,
                          md: 6
                        }}>
                        <Controller
                          name="stockQuantity"
                          control={control}
                          render={({ field }) => {
                            const [displayValue, setDisplayValue] = useState(formatQuantity(field.value))
                            const [isFocused, setIsFocused] = useState(false)

                            React.useEffect(() => {
                              if (!isFocused) {
                                setDisplayValue(formatQuantity(field.value))
                              }
                            }, [field.value, isFocused])

                            return (
                              <TextField
                                value={displayValue}
                                onChange={(e) => {
                                  const value = e.target.value.replace(/[^0-9]/g, '')
                                  setDisplayValue(value)
                                  field.onChange(value === '' ? undefined : parseInt(value))
                                }}
                                onFocus={() => {
                                  setIsFocused(true)
                                  setDisplayValue(field.value !== undefined && field.value !== null ? field.value.toString() : '')
                                }}
                                onBlur={() => {
                                  setIsFocused(false)
                                  setDisplayValue(formatQuantity(field.value))
                                }}
                                label="Current Stock"
                                error={!!errors.stockQuantity}
                                helperText={errors.stockQuantity?.message}
                                fullWidth
                                size="small"
                                disabled={isEditMode}
                                slotProps={{
                                  input: {
                                    readOnly: isEditMode,
                                  }
                                }}
                                sx={{
                                  '& .MuiInputBase-input': {
                                    textAlign: 'right',
                                  },
                                }}
                              />
                            );
                          }}
                        />
                        {isEditMode && (
                          <Typography
                            variant="caption"
                            sx={{
                              color: "text.secondary",
                              mt: 0.5,
                              display: 'block'
                            }}>
                            Stock quantity cannot be edited directly. Use stock movements instead.
                          </Typography>
                        )}
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              )}

              {/* Notes — flex-stretched to fill the right column */}
              <Card
                sx={{
                  mt: watchedType === 'Stocked Product' ? 3 : 0,
                  display: 'flex',
                  flexDirection: 'column',
                  flexGrow: 1,
                }}
              >
                <CardContent sx={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
                  <Typography variant="h6" gutterBottom>Notes</Typography>
                  <Box sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column', mt: 1 }}>
                    <Controller
                      name="notes"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          value={field.value || ''}
                          label="Notes"
                          multiline
                          minRows={4}
                          fullWidth
                          size="small"
                          sx={{
                            flexGrow: 1,
                            '& .MuiInputBase-root': { height: '100%', alignItems: 'flex-start' },
                            '& .MuiInputBase-input': {
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
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end', mt: 2 }}>
                <AppButton variant="secondary" onClick={handleCancel} disabled={loading}>Cancel</AppButton>
                <AppButton
                  variant="primary"
                  type="submit"
                  disabled={loading || hasNameDuplicate || hasBarcodeDuplicate}
                >
                  {loading ? (isEditMode ? 'Updating...' : 'Creating...') : (isEditMode ? 'Update Product' : 'Create Product')}
                </AppButton>
              </Box>
            </Grid>
          </Grid>
        </form>
        {UnsavedChangesDialog}

        <Dialog open={pendingType != null} onClose={() => setPendingType(null)}>
          <DialogTitle>Change product type?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              {isBlockedConversion
                ? 'Reduce stock to 0 via a Stock Adjustment before converting to a Service'
                : pendingType === 'Service'
                ? 'Switching to Service will stop stock tracking. Existing stock data for this product will no longer be used.'
                : 'Switching to Stocked Product will start stock tracking at 0. You must set quantity afterward via Stock Adjustments.'}
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            {isBlockedConversion ? (
              <AppButton variant="primary" onClick={() => setPendingType(null)}>Close</AppButton>
            ) : (
              <>
                <AppButton variant="secondary" onClick={() => setPendingType(null)}>Cancel</AppButton>
                <AppButton
                  variant="primary"
                  onClick={() => {
                    if (pendingType) {
                      setValue('type', pendingType, { shouldDirty: true })
                    }
                    setPendingType(null)
                  }}
                >
                  Confirm
                </AppButton>
              </>
            )}
          </DialogActions>
        </Dialog>
        </>
      )}
    </>
  );
}

export default CreateProductPage
