import React, { useState, useEffect, useCallback } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Box,
  Button,
  Grid,
  TextField,
  Typography,
  Alert,
  Container,
  Card,
  CardContent,
  IconButton,
  MenuItem,
  Chip,
} from '@mui/material'
import {
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { ApiService } from '@/services/api'
import { settingsApi } from '@/services/settingsApi'
import { formatCurrency } from '@/utils/formatters'
import { useNotification } from '@/hooks/useNotification'
import CategorySelector from '@/components/inventory/CategorySelector'
import { Category } from '@/types'
import { useDuplicateCheck } from '@/hooks/useDuplicateCheck'
import { useCurrency } from '@/hooks/useCurrency'

// Pricing field component with proper decimal handling
const PricingField: React.FC<{
  schemeName: string
  currency: string
  value: number
  baseCost: number
  disabled: boolean
  onChange: (value: number) => void
}> = ({ schemeName, currency, value, baseCost, disabled, onChange }) => {
  const [localValue, setLocalValue] = useState(value?.toString() || '')
  const [isFocused, setIsFocused] = useState(false)

  // Update local value when external value changes (but not when focused)
  useEffect(() => {
    if (!isFocused) {
      setLocalValue(value ? value.toString() : '')
    }
  }, [value, isFocused])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value

    // Allow numbers, decimal point, and empty string
    newValue = newValue.replace(/[^0-9.]/g, '')

    // Prevent multiple decimal points
    const parts = newValue.split('.')
    if (parts.length > 2) {
      newValue = parts[0] + '.' + parts.slice(1).join('')
    }

    setLocalValue(newValue)

    // Update parent with numeric value
    if (newValue === '' || newValue === '.') {
      onChange(0)
    } else {
      const numValue = parseFloat(newValue)
      if (!isNaN(numValue)) {
        onChange(numValue)
      }
    }
  }

  const calculateMargin = (price: number, cost: number): number => {
    if (!price || !cost || price <= 0 || cost <= 0) return 0
    return ((price - cost) / price) * 100
  }

  const margin = calculateMargin(value, baseCost)

  return (
    <Grid item xs={12} md={6}>
      <Box>
        <TextField
          value={localValue}
          onChange={handleChange}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
          label={`${schemeName} Price`}
          fullWidth
          size="small"
          type="text"
          disabled={disabled}
          InputProps={{
            startAdornment: <span style={{ marginRight: '4px', fontSize: '0.75rem', color: '#666' }}>{currency}</span>
          }}
          sx={{
            '& .MuiInputBase-input': {
              fontSize: '0.875rem',
              textAlign: 'right',
            },
            '& .MuiInputLabel-root': {
              fontSize: '0.875rem',
            }
          }}
        />
        {value > 0 && baseCost > 0 && (
          <Box sx={{ mt: 0.5, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" color="text.secondary">
              Margin:
            </Typography>
            <Chip
              label={`${margin.toFixed(1)}%`}
              size="small"
              variant="outlined"
              color={margin > 20 ? 'success' : margin > 10 ? 'warning' : 'error'}
              sx={{
                fontSize: '0.7rem',
                fontWeight: 500,
                height: 20,
                minWidth: 42
              }}
            />
          </Box>
        )}
      </Box>
    </Grid>
  )
}

interface ProductFormData {
  name: string
  description: string
  barcode?: string
  type: 'Stocked Product' | 'Service'
  categoryId: string
  baseCost: number
  pricingTiers: Record<string, number>
  stockQuantity?: number
  notes: string
  isActive: boolean
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
  pricingTiers: yup.object(),
  stockQuantity: yup.number().transform((value, originalValue) => originalValue === '' || originalValue === null || originalValue === undefined ? undefined : value).integer('Stock must be a whole number').min(0, 'Stock must be 0 or greater').nullable().optional(),
  notes: yup.string(),
  isActive: yup.boolean(),
})

const CreateProductPage: React.FC = () => {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEditMode = !!id
  const { showSuccess, showError } = useNotification()
  const [loading, setLoading] = useState(false)
  const [loadingProduct, setLoadingProduct] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)
  const [pricingSchemes, setPricingSchemes] = useState<Array<{ name: string; currency: string }>>([])
  const [loadingPricingSchemes, setLoadingPricingSchemes] = useState(false)

  // Currency hook
  const { currency } = useCurrency()

  // Duplicate detection hook
  const {
    checkDuplicate,
    nameError,
    barcodeError,
    hasNameDuplicate,
    hasBarcodeDuplicate,
    hasCheckedName,
    hasCheckedBarcode
  } = useDuplicateCheck()

  const { control, handleSubmit, watch, reset, setValue, formState: { errors } } = useForm<ProductFormData>({
    resolver: yupResolver(productSchema) as any,
    defaultValues: {
      name: '',
      description: '',
      barcode: '',
      type: 'Stocked Product',
      categoryId: '',
      baseCost: undefined as any,
      pricingTiers: {},
      stockQuantity: undefined,
      notes: '',
      isActive: true,
    },
  })

  const watchedType = watch('type')
  const watchedName = watch('name')
  const watchedBarcode = watch('barcode')
  const watchedBaseCost = watch('baseCost')
  const watchedPricingTiers = watch('pricingTiers') || {}

  // Calculate margins
  const calculateMargin = (price: number | undefined, cost: number | undefined): number => {
    if (!price || !cost || price <= 0 || cost <= 0) return 0
    return ((price - cost) / price) * 100
  }

  // Helper to update a specific pricing tier
  const updatePricingTier = (schemeName: string, value: number) => {
    const currentTiers = watchedPricingTiers || {}
    setValue('pricingTiers', { ...currentTiers, [schemeName]: value })
  }

  // Fetch pricing schemes on mount
  useEffect(() => {
    const loadPricingSchemes = async () => {
      try {
        setLoadingPricingSchemes(true)
        const response = await settingsApi.getActivePricingSchemes()
        const schemes = Array.isArray(response) ? response : (response.data || [])
        console.log('Loaded pricing schemes for product:', schemes)
        setPricingSchemes(schemes)
      } catch (error) {
        console.error('Failed to load pricing schemes:', error)
        // Fallback to default schemes
        setPricingSchemes([
          { name: 'Retail', currency: 'USD' },
          { name: 'Wholesale', currency: 'USD' },
          { name: 'Special', currency: 'USD' },
        ])
      } finally {
        setLoadingPricingSchemes(false)
      }
    }
    loadPricingSchemes()
  }, [])

  // Dynamic margin calculations
  const getMarginForScheme = (schemeName: string) => {
    const price = watchedPricingTiers?.[schemeName]
    return calculateMargin(price, watchedBaseCost)
  }

  // Real-time duplicate checking
  useEffect(() => {
    const timeoutId = setTimeout(async () => {
      if ((watchedName && watchedName.trim().length >= 2) ||
          (watchedBarcode && watchedBarcode.trim().length >= 1)) {

        await checkDuplicate({
          name: watchedName && watchedName.trim().length >= 2 ? watchedName.trim() : undefined,
          barcode: watchedBarcode && watchedBarcode.trim().length >= 1 ? watchedBarcode.trim() : undefined,
          excludeId: isEditMode ? id : undefined,
        })
      }
    }, 500) // Debounce API calls

    return () => clearTimeout(timeoutId)
  }, [watchedName, watchedBarcode, checkDuplicate, isEditMode, id])

  useEffect(() => {
    if (isEditMode && id) {
      loadProduct(id)
    }
  }, [isEditMode, id])

  const loadProduct = async (productId: string) => {
    setLoadingProduct(true)
    try {
      const response = await ApiService.get(`/inventory/products/${productId}`)
      const product = (response as any).data || response

      // Set the selected category if available
      if (product.category) {
        setSelectedCategory(product.category)
      }

      // Load pricing tiers, fallback to legacy fields
      const pricingTiers = product.pricingTiers || {}
      if (!product.pricingTiers) {
        // Migrate legacy pricing to tiers
        if (product.retailPrice) pricingTiers['Retail'] = product.retailPrice
        if (product.wholesalePrice) pricingTiers['Wholesale'] = product.wholesalePrice
        if (product.specialPrice) pricingTiers['Special'] = product.specialPrice
      }

      reset({
        name: product.name || '',
        description: product.description || '',
        barcode: product.barcode || '',
        type: product.type || 'Stocked Product',
        categoryId: product.categoryId || product.category?.id || '',
        baseCost: product.baseCost || 0,
        pricingTiers: pricingTiers,
        stockQuantity: product.stockQuantity || 0,
        notes: product.notes || '',
        isActive: product.isActive !== undefined ? product.isActive : true,
      })
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to load product')
      setError('Failed to load product')
    } finally {
      setLoadingProduct(false)
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
        pricingTiers: data.pricingTiers || {},
        stockQuantity: data.type === 'Stocked Product' ? (data.stockQuantity !== undefined && data.stockQuantity !== null ? Number(data.stockQuantity) : 0) : 0,
        notes: data.notes || '',
        isActive: data.isActive,
      }

      let productId = id

      if (isEditMode && id) {
        await ApiService.patch(`/inventory/products/${id}`, productData)
        showSuccess('Product updated successfully')
      } else {
        const response = await ApiService.post('/inventory/products', productData) as any
        // ApiService.post already unwraps response.data, so the response IS the product data
        productId = response?.id
        showSuccess('Product created successfully')
      }

      // Navigate back to products page with the product ID in state
      // The ProductsPage will handle refreshing the products list
      navigate('/inventory/products', {
        state: { selectedProductId: productId },
        replace: false // Use push navigation so back button works
      })
    } catch (err: any) {
      console.error('Error saving product:', err)
      setError(err.response?.data?.message || 'Failed to save product')
      showError(err.response?.data?.message || 'Failed to save product')
    } finally {
      setLoading(false)
    }
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
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  }

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <IconButton
            onClick={() => {
              // When going back in edit mode, navigate back with the product ID to keep it selected
              if (isEditMode && id) {
                navigate('/inventory/products', {
                  state: { selectedProductId: id }
                })
              } else {
                navigate('/inventory/products')
              }
            }}
            sx={{ mr: 2 }}
          >
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" component="h1">
            {isEditMode ? 'Edit Product' : 'Create Product'}
          </Typography>
        </Box>

        {loadingProduct ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <Typography>Loading product...</Typography>
          </Box>
        ) : (
          <form onSubmit={handleSubmit(onSubmit)}>
            {error && (
              <Alert severity="error" sx={{ mb: 3 }}>
                {error}
              </Alert>
            )}

            <Grid container spacing={3}>
              {/* Product Information Card */}
              <Grid item xs={12} md={8}>
                <Card>
                  <CardContent>
                    <Typography variant="h6" gutterBottom>Product Information</Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={12}>
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
                                '& .MuiInputBase-input': {
                                  fontSize: '0.875rem',
                                },
                                '& .MuiInputLabel-root': {
                                  fontSize: '0.875rem',
                                },
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

                      <Grid item xs={12}>
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

                      <Grid item xs={12} md={6}>
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
                                '& .MuiInputBase-input': {
                                  fontSize: '0.875rem',
                                },
                                '& .MuiInputLabel-root': {
                                  fontSize: '0.875rem',
                                },
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

                      <Grid item xs={12} md={6}>
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
                              sx={{
                                '& .MuiInputBase-input': {
                                  fontSize: '0.875rem',
                                },
                                '& .MuiInputLabel-root': {
                                  fontSize: '0.875rem',
                                }
                              }}
                            >
                              <MenuItem value="Stocked Product">Stocked Product</MenuItem>
                              <MenuItem value="Service">Service</MenuItem>
                            </TextField>
                          )}
                        />
                      </Grid>

                      <Grid item xs={12}>
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
                      <Grid item xs={12} md={6}>
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
                                InputProps={{
                                  startAdornment: <span style={{ marginRight: '4px', fontSize: '0.75rem', color: '#666' }}>{currency}</span>
                                }}
                                sx={{
                                  '& .MuiInputBase-input': {
                                    fontSize: '0.875rem',
                                    textAlign: 'right',
                                  },
                                  '& .MuiInputLabel-root': {
                                    fontSize: '0.875rem',
                                  }
                                }}
                              />
                            )
                          }}
                        />
                      </Grid>

                      {/* Dynamic Pricing Scheme Fields */}
                      {pricingSchemes.map((scheme) => (
                        <PricingField
                          key={scheme.name}
                          schemeName={scheme.name}
                          currency={scheme.currency}
                          value={watchedPricingTiers?.[scheme.name] || 0}
                          baseCost={watchedBaseCost || 0}
                          disabled={loadingPricingSchemes}
                          onChange={(value) => updatePricingTier(scheme.name, value)}
                        />
                      ))}
                    </Grid>
                  </CardContent>
                </Card>

                {/* Stock Card - Only for Stocked Products */}
                {watchedType === 'Stocked Product' && (
                  <Card sx={{ mt: 3 }}>
                    <CardContent>
                      <Typography variant="h6" gutterBottom>Stock Information</Typography>
                      <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
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
                                  InputProps={{
                                    readOnly: isEditMode,
                                  }}
                                  sx={{
                                    '& .MuiInputBase-input': {
                                      fontSize: '0.875rem',
                                      textAlign: 'right',
                                    },
                                    '& .MuiInputLabel-root': {
                                      fontSize: '0.875rem',
                                    }
                                  }}
                                />
                              )
                            }}
                          />
                          {isEditMode && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
                              Stock quantity cannot be edited directly. Use stock movements instead.
                            </Typography>
                          )}
                        </Grid>
                      </Grid>
                    </CardContent>
                  </Card>
                )}
              </Grid>

              {/* Notes and Actions */}
              <Grid item xs={12} md={4}>
                <Card sx={{ height: '100%' }}>
                  <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="h6" gutterBottom>Additional Information</Typography>

                    <Controller
                      name="notes"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label="Notes"
                          multiline
                          rows={6}
                          fullWidth
                          size="small"
                          sx={{
                            mb: 2,
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

                    <Box sx={{ mt: 'auto' }}>
                      <Box sx={{ display: 'flex', gap: 2, mb: 2 }}>
                        <Button
                          variant="outlined"
                          fullWidth
                          onClick={() => {
                            // When canceling in edit mode, navigate back with the product ID to keep it selected
                            if (isEditMode && id) {
                              navigate('/inventory/products', {
                                state: { selectedProductId: id }
                              })
                            } else {
                              navigate('/inventory/products')
                            }
                          }}
                          disabled={loading}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="submit"
                          variant="contained"
                          fullWidth
                          disabled={loading || hasNameDuplicate || hasBarcodeDuplicate}
                        >
                          {loading
                            ? (isEditMode ? 'Updating...' : 'Creating...')
                            : (isEditMode ? 'Update Product' : 'Create Product')
                          }
                        </Button>
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </form>
        )}
      </Box>
    </Container>
  )
}

export default CreateProductPage
