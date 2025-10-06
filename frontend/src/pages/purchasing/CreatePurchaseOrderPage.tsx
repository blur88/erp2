import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
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
  Container,
  Card,
  CardContent,
  MenuItem,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
  ArrowBack as ArrowBackIcon,
} from '@mui/icons-material'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { purchasingApi } from '@/services/purchasingApi'
import { ApiService } from '@/services/api'
import { formatCurrency } from '@/utils/formatters'
import { formatCurrencyInput } from '@/utils/currency'
import { useNotification } from '@/hooks/useNotification'

interface PurchaseOrderItem {
  productId: string
  product?: any
  quantity: number
  unitPrice: number
  discountType: 'percent' | 'amount'
  discountValue: number
  discountPercent: number
  totalPrice: number
}

interface CreatePurchaseOrderFormData {
  supplierId: string
  orderDate: string
  notes?: string
  shipping: number
  items: PurchaseOrderItem[]
}

const schema = yup.object({
  supplierId: yup.string().required('Supplier is required'),
  orderDate: yup.string().required('Order date is required'),
  notes: yup.string().optional(),
  shipping: yup.number().min(0).optional(),
  items: yup.array().of(
    yup.object({
      productId: yup.string().required('Product is required'),
      quantity: yup.number().positive('Quantity must be positive').required(),
      unitPrice: yup.number().min(0).required(),
      discountType: yup.string().oneOf(['percent', 'amount']).required(),
      discountValue: yup.number().min(0).optional(),
      discountPercent: yup.number().min(0).max(100).optional(),
      totalPrice: yup.number().min(0).required(),
    })
  ).min(1, 'At least one item is required'),
})

const CreatePurchaseOrderPage: React.FC = () => {
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<CreatePurchaseOrderFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      supplierId: '',
      orderDate: new Date().toISOString().split('T')[0],
      notes: '',
      shipping: 0,
      items: [
        {
          productId: '',
          quantity: 1,
          unitPrice: 0,
          discountType: 'percent' as const,
          discountValue: 0,
          discountPercent: 0,
          totalPrice: 0,
        }
      ],
    },
  })

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items',
  })

  const watchedItems = watch('items')
  const watchedShipping = watch('shipping')

  useEffect(() => {
    loadSuppliers()
    loadProducts()
  }, [])

  // Recalculate totals when items change
  useEffect(() => {
    watchedItems.forEach((item, index) => {
      if (item.quantity && item.unitPrice !== undefined) {
        const subtotal = Number(item.quantity) * Number(item.unitPrice)
        let discountAmount = 0

        if (item.discountType === 'percent') {
          discountAmount = subtotal * (Number(item.discountValue || 0) / 100)
        } else {
          discountAmount = Number(item.discountValue || 0)
        }

        const total = subtotal - discountAmount

        if (Math.abs(item.totalPrice - total) > 0.01) {
          setValue(`items.${index}.totalPrice`, Number(total.toFixed(2)))
        }
      }
    })
  }, [watchedItems, setValue])

  const loadSuppliers = async () => {
    try {
      const response = await purchasingApi.getSuppliers({ limit: 1000 })
      setSuppliers((response as any).suppliers || [])
    } catch (err) {
      console.error('Error loading suppliers:', err)
    }
  }

  const loadProducts = async (searchTerm: string = '') => {
    try {
      const params: any = { limit: 100, isActive: true }
      if (searchTerm && searchTerm.trim().length >= 1) {
        params.search = searchTerm.trim()
      }
      const response = await ApiService.get('/inventory/products', { params })
      console.log('Products loaded:', response)
      setProducts((response as any).data || [])
    } catch (err) {
      console.error('Error loading products:', err)
    }
  }

  const onSubmit = async (data: CreatePurchaseOrderFormData) => {
    setLoading(true)
    setError(null)

    try {
      const orderData = {
        supplierId: data.supplierId,
        orderDate: data.orderDate,
        notes: data.notes || undefined,
        items: data.items.map(item => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discountPercent: Number(item.discountPercent || 0),
        })),
      }

      await purchasingApi.createPurchaseOrder(orderData as any)

      showSuccess('Purchase order created successfully')
      navigate('/purchasing/orders')
    } catch (err: any) {
      console.error('Error creating purchase order:', err)
      setError(err.response?.data?.message || 'Failed to create purchase order')
      showError(err.response?.data?.message || 'Failed to create purchase order')
    } finally {
      setLoading(false)
    }
  }

  const handleProductSelect = (index: number, product: any) => {
    if (product) {
      setValue(`items.${index}.productId`, product.id)
      setValue(`items.${index}.unitPrice`, Number(product.baseCost || 0))
      setValue(`items.${index}.product`, product)
    }
  }

  const handlePriceChange = (index: number, value: string) => {
    const numericValue = parseFloat(value.replace(/,/g, '')) || 0
    setValue(`items.${index}.unitPrice`, numericValue)
  }

  const formatPriceInput = (value: string) => {
    const cleanValue = value.replace(/[^0-9.]/g, '')
    const parts = cleanValue.split('.')
    if (parts.length > 2) {
      return parts[0] + '.' + parts.slice(1).join('')
    }
    if (parts.length === 2) {
      parts[1] = parts[1].substring(0, 4)
    }
    return parts.join('.')
  }

  const calculateOrderTotals = () => {
    const subtotal = watchedItems.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0)
    const shipping = Number(watchedShipping) || 0
    const totalAmount = subtotal + shipping
    return { subtotal, shipping, totalAmount }
  }

  const addItem = () => {
    append({
      productId: '',
      quantity: 1,
      unitPrice: 0,
      discountType: 'percent' as const,
      discountValue: 0,
      discountPercent: 0,
      totalPrice: 0,
    })
  }

  const totals = calculateOrderTotals()

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <IconButton onClick={() => navigate('/purchasing/orders')} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" component="h1">
            Create Purchase Order
          </Typography>
        </Box>

        <form onSubmit={handleSubmit(onSubmit)}>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <Grid container spacing={3}>
            {/* Order Information Card */}
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Order Information</Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Controller
                        name="supplierId"
                        control={control}
                        render={({ field }) => (
                          <Autocomplete
                            options={suppliers}
                            getOptionLabel={(option) => option.companyName}
                            value={suppliers.find(s => s.id === field.value) || null}
                            onChange={(_, value) => field.onChange(value?.id || '')}
                            size="small"
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label="Supplier"
                                error={!!errors.supplierId}
                                helperText={errors.supplierId?.message}
                                required
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
                    </Grid>

                    <Grid item xs={12} md={6}>
                      <Controller
                        name="orderDate"
                        control={control}
                        render={({ field }) => (
                          <TextField
                            {...field}
                            label="Order Date"
                            type="date"
                            InputLabelProps={{ shrink: true }}
                            error={!!errors.orderDate}
                            helperText={errors.orderDate?.message}
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

            {/* Order Items Card */}
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">Order Items</Typography>
                    <Button
                      startIcon={<AddIcon />}
                      onClick={addItem}
                      variant="outlined"
                    >
                      Add Item
                    </Button>
                  </Box>

                  <TableContainer component={Paper} sx={{ border: '1px solid #e0e0e0' }}>
                    <Table
                      size="small"
                      sx={{
                        '& .MuiTableCell-root': {
                          border: '1px solid #e0e0e0',
                          padding: '4px 8px',
                          fontSize: '0.875rem',
                        },
                        '& .MuiTableHead-root .MuiTableCell-root': {
                          backgroundColor: '#f5f5f5',
                          fontWeight: 600,
                          color: '#424242',
                          border: '1px solid #d0d0d0',
                        },
                        '& .MuiTableBody-root .MuiTableRow-root:hover': {
                          backgroundColor: '#f9f9f9',
                        },
                        '& .MuiTextField-root': {
                          '& .MuiOutlinedInput-root': {
                            border: 'none',
                            '& fieldset': {
                              border: 'none',
                            },
                            '&:hover fieldset': {
                              border: '1px solid #1976d2',
                            },
                            '&.Mui-focused fieldset': {
                              border: '1px solid #1976d2',
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
                          <TableCell align="center" sx={{ width: '30%', minWidth: 200 }}>Product</TableCell>
                          <TableCell align="center" sx={{ width: '8%', minWidth: 70 }}>Qty</TableCell>
                          <TableCell align="center" sx={{ width: '13%', minWidth: 100 }}>Unit Price</TableCell>
                          <TableCell align="center" sx={{ width: '16%', minWidth: 120 }}>Discount</TableCell>
                          <TableCell align="center" sx={{ width: '13%', minWidth: 100 }}>Total</TableCell>
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
                                    getOptionLabel={(option) => option.name}
                                    value={products.find(p => p.id === productField.value) || null}
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
                                name={`items.${index}.quantity`}
                                control={control}
                                render={({ field: qtyField }) => (
                                  <TextField
                                    {...qtyField}
                                    type="number"
                                    variant="outlined"
                                    inputProps={{ min: 1, style: { textAlign: 'center', fontSize: '0.875rem' } }}
                                    error={!!errors.items?.[index]?.quantity}
                                    sx={{
                                      '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                                        display: 'none',
                                      },
                                      '& input[type=number]': {
                                        MozAppearance: 'textfield',
                                      },
                                    }}
                                  />
                                )}
                              />
                            </TableCell>
                            <TableCell sx={{ padding: '2px !important' }}>
                              <Controller
                                name={`items.${index}.unitPrice`}
                                control={control}
                                render={({ field: priceField }) => (
                                  <TextField
                                    {...priceField}
                                    type="number"
                                    variant="outlined"
                                    inputProps={{
                                      min: 0,
                                      step: 0.01,
                                      style: { textAlign: 'right', fontSize: '0.875rem' }
                                    }}
                                    sx={{
                                      '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                                        display: 'none',
                                      },
                                      '& input[type=number]': {
                                        MozAppearance: 'textfield',
                                      },
                                    }}
                                    InputProps={{
                                      startAdornment: <span style={{ marginRight: '4px', fontSize: '0.75rem', color: '#666' }}>RM</span>
                                    }}
                                    error={!!errors.items?.[index]?.unitPrice}
                                  />
                                )}
                              />
                            </TableCell>
                            <TableCell sx={{ padding: '2px !important' }}>
                              <Box sx={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                                <Controller
                                  name={`items.${index}.discountValue`}
                                  control={control}
                                  render={({ field: discountField }) => (
                                    <TextField
                                      {...discountField}
                                      type="number"
                                      variant="outlined"
                                      inputProps={{
                                        min: 0,
                                        step: 0.01,
                                        style: { textAlign: 'right', fontSize: '0.875rem' }
                                      }}
                                      error={!!errors.items?.[index]?.discountValue}
                                      sx={{
                                        flex: 1,
                                        '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                                          display: 'none',
                                        },
                                        '& input[type=number]': {
                                          MozAppearance: 'textfield',
                                        },
                                      }}
                                    />
                                  )}
                                />
                                <Controller
                                  name={`items.${index}.discountType`}
                                  control={control}
                                  render={({ field: typeField }) => (
                                    <TextField
                                      {...typeField}
                                      select
                                      variant="outlined"
                                      sx={{
                                        width: '60px',
                                        '& .MuiInputBase-input': {
                                          fontSize: '0.875rem',
                                          padding: '6px 4px',
                                        }
                                      }}
                                      SelectProps={{
                                        MenuProps: {
                                          PaperProps: {
                                            sx: {
                                              '& .MuiMenuItem-root': {
                                                fontSize: '0.875rem',
                                              }
                                            }
                                          }
                                        }
                                      }}
                                    >
                                      <MenuItem value="percent">%</MenuItem>
                                      <MenuItem value="amount">RM</MenuItem>
                                    </TextField>
                                  )}
                                />
                              </Box>
                            </TableCell>
                            <TableCell align="right" sx={{ padding: '2px 8px !important' }}>
                              <Box sx={{
                                backgroundColor: '#f8f9fa',
                                padding: '6px 8px',
                                borderRadius: '4px',
                                border: '1px solid #e9ecef',
                                minHeight: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'flex-end'
                              }}>
                                <Typography variant="body2" fontWeight="600" sx={{ fontSize: '0.875rem' }}>
                                  {formatCurrency(watchedItems[index]?.totalPrice || 0)}
                                </Typography>
                              </Box>
                            </TableCell>
                            <TableCell align="center" sx={{ padding: '2px !important' }}>
                              <IconButton
                                onClick={() => remove(index)}
                                disabled={fields.length === 1}
                                size="small"
                                sx={{
                                  color: '#dc3545',
                                  '&:hover': { backgroundColor: '#f8d7da' },
                                  '&.Mui-disabled': { color: '#ccc' }
                                }}
                              >
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                            <TableCell sx={{ width: 40, padding: '2px !important', backgroundColor: '#f8f9fa' }}>
                              <Typography variant="caption" sx={{ color: '#6c757d', fontSize: '0.75rem' }}>
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

            {/* Notes and Summary */}
            <Grid item xs={12} md={8}>
              <Card>
                <CardContent>
                  <Controller
                    name="notes"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Notes"
                        multiline
                        rows={4}
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

            <Grid item xs={12} md={4}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>Order Summary</Typography>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ fontSize: '0.875rem' }}>Sub-total:</Typography>
                    <Typography sx={{ fontSize: '0.875rem' }}>{formatCurrency(totals.subtotal)}</Typography>
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ fontSize: '0.875rem' }}>Shipping:</Typography>
                    <Controller
                      name="shipping"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          type="number"
                          variant="outlined"
                          size="small"
                          inputProps={{
                            min: 0,
                            step: 0.01,
                            style: { textAlign: 'right', fontSize: '0.875rem' }
                          }}
                          sx={{
                            width: '120px',
                            '& .MuiInputBase-input': {
                              padding: '4px 8px',
                            },
                            '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
                              display: 'none',
                            },
                            '& input[type=number]': {
                              MozAppearance: 'textfield',
                            },
                          }}
                          InputProps={{
                            startAdornment: <span style={{ marginRight: '4px', fontSize: '0.75rem', color: '#666' }}>RM</span>
                          }}
                        />
                      )}
                    />
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, pt: 1, borderTop: '1px solid #e0e0e0' }}>
                    <Typography variant="h6" sx={{ fontSize: '0.875rem', fontWeight: 600 }}>Total:</Typography>
                    <Typography variant="h6" sx={{ fontSize: '0.875rem', fontWeight: 600 }}>{formatCurrency(totals.totalAmount)}</Typography>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button
                      variant="outlined"
                      fullWidth
                      onClick={() => navigate('/purchasing/orders')}
                      disabled={loading}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      variant="contained"
                      fullWidth
                      disabled={loading}
                    >
                      {loading ? 'Creating...' : 'Create Order'}
                    </Button>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </form>
      </Box>
    </Container>
  )
}

export default CreatePurchaseOrderPage
