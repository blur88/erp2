import React, { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
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
import { salesApi } from '@/services/salesApi'
import { ApiService } from '@/services/api'
import { formatCurrency } from '@/utils/formatters'
import { useNotification } from '@/hooks/useNotification'
import { useAppDispatch } from '@/hooks/useRedux'
import { updateOrderInPlace } from '@/store/slices/salesSlice'

interface OrderItem {
  productId: string
  product?: any
  quantity: number
  unitPrice: number
  discountType: 'percentage' | 'amount'
  discountValue: number
  discountPercent: number
  discountAmount: number
  totalPrice: number
  description?: string
}

interface CreateOrderFormData {
  customerId: string
  orderDate: string
  notes?: string
  shipping: number
  items: OrderItem[]
}

const schema = yup.object({
  customerId: yup.string().required('Customer is required'),
  orderDate: yup.string().required('Order date is required'),
  notes: yup.string().optional(),
  shipping: yup.number().min(0).optional(),
  items: yup.array().of(
    yup.object({
      productId: yup.string().required('Product is required'),
      quantity: yup.number().integer('Quantity must be a whole number').positive('Quantity must be positive').required(),
      unitPrice: yup.number().min(0).required(),
      discountType: yup.string().oneOf(['percentage', 'amount']).required(),
      discountValue: yup.number().min(0).optional(),
      discountPercent: yup.number().min(0).max(100).optional(),
      discountAmount: yup.number().min(0).optional(),
      totalPrice: yup.number().min(0).required(),
      description: yup.string().optional(),
    })
  ).min(1, 'At least one item is required'),
})

const CreateSalesOrderPage: React.FC = () => {
  const navigate = useNavigate()
  const dispatch = useAppDispatch()
  const { id } = useParams<{ id: string }>()
  const isEditMode = !!id
  const { showSuccess, showError } = useNotification()
  const [customers, setCustomers] = useState<any[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [loadingOrder, setLoadingOrder] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [orderToLoad, setOrderToLoad] = useState<any>(null)

  const { control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<CreateOrderFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      customerId: '',
      orderDate: new Date().toISOString().split('T')[0],
      notes: '',
      shipping: 0,
      items: [
        {
          productId: '',
          quantity: 1,
          unitPrice: 0,
          discountType: 'percentage' as const,
          discountValue: 0,
          discountPercent: 0,
          discountAmount: 0,
          totalPrice: 0,
          description: '',
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
    loadCustomers()
    loadProducts()
  }, [])

  // Load sales order data in edit mode
  useEffect(() => {
    if (isEditMode && id) {
      loadSalesOrder(id)
    }
  }, [isEditMode, id])

  const loadSalesOrder = async (orderId: string) => {
    setLoadingOrder(true)
    try {
      const response = await salesApi.getOrder(orderId)
      const order = (response as any).data || response

      // Extract products from order items and add to products state
      if (order.items && order.items.length > 0) {
        const orderProducts = order.items
          .filter((item: any) => item.product)
          .map((item: any) => item.product)

        // Merge with existing products, avoiding duplicates
        setProducts((prevProducts) => {
          const existingIds = new Set(prevProducts.map(p => p.id))
          const newProducts = orderProducts.filter((p: any) => !existingIds.has(p.id))
          return [...prevProducts, ...newProducts]
        })
      }

      // Store order data to be loaded after products are set
      setOrderToLoad(order)
    } catch (err: any) {
      showError(err?.response?.data?.message || 'Failed to load sales order')
      setError('Failed to load sales order')
      setLoadingOrder(false)
    }
  }

  // Reset form after products are loaded
  useEffect(() => {
    if (orderToLoad && products.length > 0) {
      const itemsToReset = orderToLoad.items?.map((item: any) => {
        const productId = item.productId || item.product?.id || ''

        return {
          productId,
          product: item.product,
          quantity: parseInt(item.quantity) || 1,
          unitPrice: item.unitPrice || 0,
          discountType: (item.discountType || 'percentage') as 'percentage' | 'amount',
          discountValue: item.discountType === 'percentage' ? (item.discountPercent || 0) : (item.discountAmount || 0),
          discountPercent: item.discountPercent || 0,
          discountAmount: item.discountAmount || 0,
          totalPrice: item.totalAmount || item.totalPrice || 0,
          description: item.notes || item.description || '',
        }
      })

      // Map order data to form
      reset({
        customerId: orderToLoad.customerId || orderToLoad.customer?.id || '',
        orderDate: orderToLoad.orderDate ? new Date(orderToLoad.orderDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
        notes: orderToLoad.notes || '',
        shipping: orderToLoad.shippingAmount || 0,
        items: itemsToReset || [
          {
            productId: '',
            quantity: 1,
            unitPrice: 0,
            discountType: 'percentage' as const,
            discountValue: 0,
            discountPercent: 0,
            discountAmount: 0,
            totalPrice: 0,
            description: '',
          }
        ],
      })

      setOrderToLoad(null)
      setLoadingOrder(false)
    }
  }, [orderToLoad, products, reset])

  // Recalculate totals when items change
  useEffect(() => {
    watchedItems.forEach((item, index) => {
      if (item.quantity && item.unitPrice !== undefined) {
        const quantity = Number(item.quantity)
        const unitPrice = Number(item.unitPrice)
        const subtotal = quantity * unitPrice
        let discountAmount = 0
        let discountPercent = Number(item.discountPercent) || 0

        if (item.discountType === 'percentage') {
          // Percentage discount
          discountPercent = Number(item.discountValue || 0)
          discountAmount = subtotal * (discountPercent / 100)

          if (Math.abs(item.discountPercent - discountPercent) > 0.01) {
            setValue(`items.${index}.discountPercent`, Number(discountPercent.toFixed(2)))
          }
          if (Math.abs(item.discountAmount - discountAmount) > 0.01) {
            setValue(`items.${index}.discountAmount`, Number(discountAmount.toFixed(2)))
          }
        } else {
          // Fixed amount discount
          discountAmount = Math.min(Number(item.discountValue || 0), subtotal)
          discountPercent = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0

          if (Math.abs(item.discountAmount - discountAmount) > 0.01) {
            setValue(`items.${index}.discountAmount`, Number(discountAmount.toFixed(2)))
          }
          if (Math.abs(item.discountPercent - discountPercent) > 0.01) {
            setValue(`items.${index}.discountPercent`, Number(discountPercent.toFixed(2)))
          }
        }

        const total = subtotal - discountAmount

        if (Math.abs(item.totalPrice - total) > 0.01) {
          setValue(`items.${index}.totalPrice`, Number(total.toFixed(2)))
        }
      }
    })
  }, [JSON.stringify(watchedItems), setValue])

  const loadCustomers = async () => {
    try {
      const response = await salesApi.getCustomers({ limit: 1000 })
      setCustomers((response as any).data || [])
    } catch (err) {
      console.error('Error loading customers:', err)
    }
  }

  const loadProducts = async (searchTerm: string = '') => {
    try {
      const params: any = { limit: 100, isActive: true }
      if (searchTerm && searchTerm.trim().length >= 1) {
        params.search = searchTerm.trim()
      }
      const response = await ApiService.get('/inventory/products', { params })
      const newProducts = (response as any).data || []

      // Merge with existing products to preserve order item products
      setProducts((prevProducts) => {
        const existingIds = new Set(prevProducts.map(p => p.id))
        const productsToAdd = newProducts.filter((p: any) => !existingIds.has(p.id))
        return [...prevProducts, ...productsToAdd]
      })
    } catch (err) {
      console.error('Error loading products:', err)
    }
  }

  const onSubmit = async (data: CreateOrderFormData) => {
    setLoading(true)
    setError(null)

    try {
      const orderData = {
        customerId: data.customerId,
        orderDate: data.orderDate,
        notes: data.notes || undefined,
        shippingAmount: Number(data.shipping) || 0,
        items: data.items.map((item) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discountType: item.discountType,
          discountPercent: Number(item.discountPercent) || 0,
          discountAmount: Number(item.discountAmount) || 0,
          notes: item.description || undefined,
        })),
      }

      console.log('Sending order data:', JSON.stringify(orderData, null, 2))

      if (isEditMode && id) {
        const response = await salesApi.updateOrder(id, orderData as any)
        const updatedOrder = (response as any).data || response

        // Update Redux state directly
        dispatch(updateOrderInPlace(updatedOrder))

        showSuccess('Sales order updated successfully')
      } else {
        await salesApi.createOrder(orderData as any)
        showSuccess('Sales order created successfully')
      }

      // Navigate back
      navigate('/sales/orders')
    } catch (err: any) {
      console.error('Error creating sales order:', err)
      setError(err.response?.data?.message || 'Failed to create sales order')
      showError(err.response?.data?.message || 'Failed to create sales order')
    } finally {
      setLoading(false)
    }
  }

  const handleProductSelect = (index: number, product: any) => {
    if (product) {
      setValue(`items.${index}.productId`, product.id)
      setValue(`items.${index}.unitPrice`, Number(product.retailPrice || 0))
      setValue(`items.${index}.product`, product)
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
      discountType: 'percentage' as const,
      discountValue: 0,
      discountPercent: 0,
      discountAmount: 0,
      totalPrice: 0,
      description: '',
    })
  }

  const totals = React.useMemo(() => {
    return calculateOrderTotals()
  }, [JSON.stringify(watchedItems), watchedShipping])

  return (
    <Container maxWidth="xl">
      <Box sx={{ py: 3 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <IconButton onClick={() => navigate('/sales/orders')} sx={{ mr: 2 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h4" component="h1">
            {isEditMode ? 'Edit Sales Order' : 'Create Sales Order'}
          </Typography>
        </Box>

        {loadingOrder ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
            <Typography>Loading sales order...</Typography>
          </Box>
        ) : (
        <form onSubmit={handleSubmit(onSubmit)}>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <Grid container spacing={3}>
            {/* SO Information Card */}
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Typography variant="h6" gutterBottom>SO Information</Typography>
                  <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                      <Controller
                        name="customerId"
                        control={control}
                        render={({ field }) => (
                          <Autocomplete
                            options={customers}
                            getOptionLabel={(option) => option.name}
                            value={customers.find(c => c.id === field.value) || null}
                            onChange={(_, value) => field.onChange(value?.id || '')}
                            size="small"
                            renderInput={(params) => (
                              <TextField
                                {...params}
                                label="Customer"
                                error={!!errors.customerId}
                                helperText={errors.customerId?.message}
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

            {/* SO Items Card */}
            <Grid item xs={12}>
              <Card>
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h6">SO Items</Typography>
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
                          <TableCell align="center" sx={{ width: '13%', minWidth: 100 }}>Price</TableCell>
                          <TableCell align="center" sx={{ width: '16%', minWidth: 120 }}>Discount</TableCell>
                          <TableCell align="center" sx={{ width: '13%', minWidth: 100 }}>Sub-total</TableCell>
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
                                render={({ field: qtyField }) => {
                                  const formatQuantity = (value: number | string): string => {
                                    if (value === '' || value === null || value === undefined) return ''
                                    const num = typeof value === 'string' ? parseInt(value) : Math.floor(value)
                                    if (isNaN(num)) return ''
                                    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                  }

                                  const [displayValue, setDisplayValue] = React.useState(formatQuantity(qtyField.value))
                                  const [isFocused, setIsFocused] = React.useState(false)

                                  React.useEffect(() => {
                                    if (!isFocused) {
                                      setDisplayValue(formatQuantity(qtyField.value))
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
                                        setDisplayValue(formatQuantity(qtyField.value))
                                      }}
                                      variant="outlined"
                                      inputProps={{
                                        style: { textAlign: 'center', fontSize: '0.875rem' },
                                        inputMode: 'numeric',
                                        pattern: '[0-9]*'
                                      }}
                                      error={!!errors.items?.[index]?.quantity}
                                      helperText={errors.items?.[index]?.quantity?.message}
                                    />
                                  )
                                }}
                              />
                            </TableCell>
                            <TableCell sx={{ padding: '2px !important' }}>
                              <Controller
                                name={`items.${index}.unitPrice`}
                                control={control}
                                render={({ field: priceField }) => {
                                  const [displayValue, setDisplayValue] = React.useState(formatNumberWithCommas(priceField.value))
                                  const [isFocused, setIsFocused] = React.useState(false)

                                  React.useEffect(() => {
                                    if (!isFocused) {
                                      setDisplayValue(formatNumberWithCommas(priceField.value))
                                    }
                                  }, [priceField.value, isFocused])

                                  return (
                                    <TextField
                                      value={displayValue}
                                      onChange={(e) => {
                                        const value = e.target.value.replace(/[^0-9.]/g, '')
                                        setDisplayValue(value)
                                        priceField.onChange(parseFormattedNumber(value))
                                      }}
                                      onFocus={() => {
                                        setIsFocused(true)
                                        setDisplayValue(priceField.value?.toString() || '')
                                      }}
                                      onBlur={() => {
                                        setIsFocused(false)
                                        setDisplayValue(formatNumberWithCommas(priceField.value))
                                      }}
                                      variant="outlined"
                                      inputProps={{
                                        style: { textAlign: 'right', fontSize: '0.875rem' }
                                      }}
                                      InputProps={{
                                        startAdornment: <span style={{ marginRight: '4px', fontSize: '0.75rem', color: '#666' }}>RM</span>
                                      }}
                                      error={!!errors.items?.[index]?.unitPrice}
                                    />
                                  )
                                }}
                              />
                            </TableCell>
                            <TableCell sx={{ padding: '2px !important' }}>
                              <Box sx={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
                                <Controller
                                  name={`items.${index}.discountValue`}
                                  control={control}
                                  render={({ field: discountField }) => {
                                    const [displayValue, setDisplayValue] = React.useState(formatNumberWithCommas(discountField.value))
                                    const [isFocused, setIsFocused] = React.useState(false)

                                    React.useEffect(() => {
                                      if (!isFocused) {
                                        setDisplayValue(formatNumberWithCommas(discountField.value))
                                      }
                                    }, [discountField.value, isFocused])

                                    return (
                                      <TextField
                                        value={displayValue}
                                        onChange={(e) => {
                                          const value = e.target.value.replace(/[^0-9.]/g, '')
                                          setDisplayValue(value)
                                          discountField.onChange(parseFormattedNumber(value))
                                        }}
                                        onFocus={() => {
                                          setIsFocused(true)
                                          setDisplayValue(discountField.value?.toString() || '')
                                        }}
                                        onBlur={() => {
                                          setIsFocused(false)
                                          setDisplayValue(formatNumberWithCommas(discountField.value))
                                        }}
                                        variant="outlined"
                                        inputProps={{
                                          style: { textAlign: 'right', fontSize: '0.875rem' }
                                        }}
                                        error={!!errors.items?.[index]?.discountValue}
                                        sx={{
                                          flex: 1,
                                        }}
                                      />
                                    )
                                  }}
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
                                      <MenuItem value="percentage">%</MenuItem>
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
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Controller
                    name="notes"
                    control={control}
                    render={({ field }) => (
                      <TextField
                        {...field}
                        label="Notes"
                        multiline
                        fullWidth
                        sx={{
                          flex: 1,
                          '& .MuiInputBase-root': {
                            height: '100%',
                            alignItems: 'flex-start',
                          },
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
              <Card sx={{ height: '100%' }}>
                <CardContent sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <Typography variant="h6" gutterBottom>SO Summary</Typography>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ fontSize: '0.875rem' }}>Sub-total:</Typography>
                    <Typography sx={{ fontSize: '0.875rem' }}>{formatCurrency(totals.subtotal)}</Typography>
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography sx={{ fontSize: '0.875rem' }}>Shipping:</Typography>
                    <Controller
                      name="shipping"
                      control={control}
                      render={({ field }) => {
                        const [displayValue, setDisplayValue] = React.useState(formatNumberWithCommas(field.value))
                        const [isFocused, setIsFocused] = React.useState(false)

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
                              const numValue = value === '' ? 0 : parseFloat(value.replace(/,/g, ''))
                              field.onChange(isNaN(numValue) ? 0 : numValue)
                            }}
                            onFocus={() => {
                              setIsFocused(true)
                              setDisplayValue(field.value === 0 ? '0' : (field.value?.toString() || '0'))
                            }}
                            onBlur={() => {
                              setIsFocused(false)
                              if (displayValue === '' || displayValue === '.') {
                                field.onChange(0)
                              }
                              setDisplayValue(formatNumberWithCommas(field.value || 0))
                            }}
                            variant="outlined"
                            size="small"
                            inputProps={{
                              style: { textAlign: 'right', fontSize: '0.875rem' }
                            }}
                            sx={{
                              width: '120px',
                              '& .MuiInputBase-input': {
                                padding: '4px 8px',
                              },
                            }}
                            InputProps={{
                              startAdornment: <span style={{ marginRight: '4px', fontSize: '0.75rem', color: '#666' }}>RM</span>
                            }}
                          />
                        )
                      }}
                    />
                  </Box>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3, pt: 1, borderTop: '1px solid #e0e0e0' }}>
                    <Typography variant="h6" sx={{ fontSize: '0.875rem', fontWeight: 600 }}>Total:</Typography>
                    <Typography variant="h6" sx={{ fontSize: '0.875rem', fontWeight: 600 }}>{formatCurrency(totals.totalAmount)}</Typography>
                  </Box>

                  <Box sx={{ display: 'flex', gap: 2, mt: 'auto' }}>
                    <Button
                      variant="outlined"
                      fullWidth
                      onClick={() => navigate('/sales/orders')}
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
                      {loading
                        ? (isEditMode ? 'Updating...' : 'Creating...')
                        : (isEditMode ? 'Update Order' : 'Create Order')
                      }
                    </Button>
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

export default CreateSalesOrderPage
