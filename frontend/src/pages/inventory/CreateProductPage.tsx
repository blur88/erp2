import React, { useState, useEffect } from 'react'
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
} from '@mui/material'
import {
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { ApiService } from '@/services/api'
import { formatCurrency } from '@/utils/formatters'
import { useNotification } from '@/hooks/useNotification'
import { useAppDispatch } from '@/hooks/useRedux'
import { fetchProducts } from '@/store/slices/inventorySlice'
import CategorySelector from '@/components/inventory/CategorySelector'
import { Category } from '@/types'
import { useDuplicateCheck } from '@/hooks/useDuplicateCheck'

interface ProductFormData {
  name: string
  description: string
  barcode?: string
  type: 'Stocked Product' | 'Service'
  categoryId: string
  baseCost: number
  retailPrice: number
  wholesalePrice: number
  specialPrice: number
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
  baseCost: yup.number().min(0, 'Base cost must be 0 or greater').required('Base cost is required'),
  retailPrice: yup.number().min(0, 'Retail price must be 0 or greater').required('Retail price is required'),
  wholesalePrice: yup.number().min(0, 'Wholesale price must be 0 or greater').required('Wholesale price is required'),
  specialPrice: yup.number().min(0, 'Special price must be 0 or greater').required('Special price is required'),
  stockQuantity: yup.number().integer('Stock must be a whole number').min(0, 'Stock must be 0 or greater').optional(),
  notes: yup.string(),
  isActive: yup.boolean(),
})

const CreateProductPage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { id } = useParams<{ id: string }>()
  const isEditMode = !!id
  const { showSuccess, showError } = useNotification()
  const [loading, setLoading] = useState(false)
  const [loadingProduct, setLoadingProduct] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)

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

  const { control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<ProductFormData>({
    resolver: yupResolver(productSchema) as any,
    defaultValues: {
      name: '',
      description: '',
      barcode: '',
      type: 'Stocked Product',
      categoryId: '',
      baseCost: 0,
      retailPrice: 0,
      wholesalePrice: 0,
      specialPrice: 0,
      stockQuantity: 0,
      notes: '',
      isActive: true,
    },
  })

  const watchedType = watch('type')
  const watchedName = watch('name')
  const watchedBarcode = watch('barcode')

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

      reset({
        name: product.name || '',
        description: product.description || '',
        barcode: product.barcode || '',
        type: product.type || 'Stocked Product',
        categoryId: product.categoryId || product.category?.id || '',
        baseCost: product.baseCost || 0,
        retailPrice: product.retailPrice || 0,
        wholesalePrice: product.wholesalePrice || 0,
        specialPrice: product.specialPrice || 0,
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
        baseCost: Number(data.baseCost),
        retailPrice: Number(data.retailPrice),
        wholesalePrice: Number(data.wholesalePrice),
        specialPrice: Number(data.specialPrice),
        stockQuantity: data.type === 'Stocked Product' ? Number(data.stockQuantity || 0) : 0,
        notes: data.notes || '',
        isActive: data.isActive,
      }

      if (isEditMode && id) {
        await ApiService.put(`/inventory/products/${id}`, productData)
        showSuccess('Product updated successfully')
      } else {
        await ApiService.post('/inventory/products', productData)
        showSuccess('Product created successfully')
      }

      // Refresh products list in Redux
      dispatch(fetchProducts({ page: 1, limit: 10 }))

      // Navigate back to products page
      navigate('/inventory/products')
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

  const parseFormattedNumber = (value: string): number => {
    return parseFloat(value.replace(/,/g, '')) || 0
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
          <IconButton onClick={() => navigate('/inventory/products')} sx={{ mr: 2 }}>
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
                                required
                                fullWidth
                                size="small"
                                InputProps={{
                                  startAdornment: <span style={{ marginRight: '4px', fontSize: '0.75rem', color: '#666' }}>RM</span>
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

                      <Grid item xs={12} md={6}>
                        <Controller
                          name="retailPrice"
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
                                label="Retail Price"
                                error={!!errors.retailPrice}
                                helperText={errors.retailPrice?.message}
                                required
                                fullWidth
                                size="small"
                                InputProps={{
                                  startAdornment: <span style={{ marginRight: '4px', fontSize: '0.75rem', color: '#666' }}>RM</span>
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

                      <Grid item xs={12} md={6}>
                        <Controller
                          name="wholesalePrice"
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
                                label="Wholesale Price"
                                error={!!errors.wholesalePrice}
                                helperText={errors.wholesalePrice?.message}
                                required
                                fullWidth
                                size="small"
                                InputProps={{
                                  startAdornment: <span style={{ marginRight: '4px', fontSize: '0.75rem', color: '#666' }}>RM</span>
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

                      <Grid item xs={12} md={6}>
                        <Controller
                          name="specialPrice"
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
                                label="Special Price"
                                error={!!errors.specialPrice}
                                helperText={errors.specialPrice?.message}
                                required
                                fullWidth
                                size="small"
                                InputProps={{
                                  startAdornment: <span style={{ marginRight: '4px', fontSize: '0.75rem', color: '#666' }}>RM</span>
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
                              const [displayValue, setDisplayValue] = useState(formatQuantity(field.value || 0))
                              const [isFocused, setIsFocused] = useState(false)

                              React.useEffect(() => {
                                if (!isFocused) {
                                  setDisplayValue(formatQuantity(field.value || 0))
                                }
                              }, [field.value, isFocused])

                              return (
                                <TextField
                                  value={displayValue}
                                  onChange={(e) => {
                                    const value = e.target.value.replace(/[^0-9]/g, '')
                                    setDisplayValue(value)
                                    field.onChange(parseInt(value) || 0)
                                  }}
                                  onFocus={() => {
                                    setIsFocused(true)
                                    setDisplayValue((field.value || 0).toString())
                                  }}
                                  onBlur={() => {
                                    setIsFocused(false)
                                    setDisplayValue(formatQuantity(field.value || 0))
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
                          onClick={() => navigate('/inventory/products')}
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
