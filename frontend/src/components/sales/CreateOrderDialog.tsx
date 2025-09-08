import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Typography,
  Box,
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
  Divider,
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { salesApi } from '@/services/salesApi'
import { ApiService } from '@/services/api'
import { formatCurrency } from '@/utils/formatters'
import { formatCurrencyInput } from '@/utils/currency'
import type { Customer, SalesOrder } from '@/types'

interface OrderItem {
  productId: string
  product?: any
  quantity: number
  unitPrice: number
  discountType: 'percentage' | 'amount'
  discountPercent: number
  discountAmount: number
  totalPrice: number
  description?: string
}

interface CreateOrderFormData {
  customerId: string
  orderDate: string
  requiredDate?: string
  priority: 'low' | 'normal' | 'high' | 'urgent'
  status: 'draft' | 'pending'
  notes?: string
  discountPercent: number
  taxPercent: number
  shippingAmount: number
  items: OrderItem[]
}

const schema = yup.object({
  customerId: yup.string().required('Customer is required'),
  orderDate: yup.string().required('Order date is required'),
  requiredDate: yup.string().optional(),
  priority: yup.string().oneOf(['low', 'normal', 'high', 'urgent']).required(),
  status: yup.string().oneOf(['draft', 'pending']).required(),
  notes: yup.string().optional(),
  discountPercent: yup.number().min(0).max(100).required(),
  taxPercent: yup.number().min(0).required(),
  shippingAmount: yup.number().min(0).required(),
  items: yup.array().of(
    yup.object({
      productId: yup.string().required('Product is required'),
      quantity: yup.number().positive('Quantity must be positive').required(),
      unitPrice: yup.number().min(0).required(),
      discountType: yup.string().oneOf(['percentage', 'amount']).required(),
      discountPercent: yup.number().min(0).max(100).required(),
      discountAmount: yup.number().min(0).required(),
      totalPrice: yup.number().min(0).required(),
      description: yup.string().optional(),
    })
  ).min(1, 'At least one item is required'),
})

interface CreateOrderDialogProps {
  open: boolean
  onClose: () => void
  onOrderCreated: (order: SalesOrder) => void
}

const CreateOrderDialog: React.FC<CreateOrderDialogProps> = ({
  open,
  onClose,
  onOrderCreated,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<CreateOrderFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      customerId: '',
      orderDate: new Date().toISOString().split('T')[0],
      requiredDate: '',
      priority: 'normal',
      status: 'draft',
      notes: '',
      discountPercent: 0,
      taxPercent: 0,
      shippingAmount: 0,
      items: [
        {
          productId: '',
          quantity: 1,
          unitPrice: 0,
          discountType: 'percentage' as const,
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
  const watchedDiscountPercent = watch('discountPercent')
  const watchedTaxPercent = watch('taxPercent')
  const watchedShippingAmount = watch('shippingAmount')

  useEffect(() => {
    if (open) {
      loadCustomers()
      loadProducts()
    }
  }, [open])

  useEffect(() => {
    // Recalculate totals when items change
    watchedItems.forEach((item, index) => {
      if (item.quantity && item.unitPrice) {
        const subtotal = Number(item.quantity) * Number(item.unitPrice)
        let discountAmount = 0
        
        if (item.discountType === 'percentage' && item.discountPercent > 0) {
          discountAmount = subtotal * (Number(item.discountPercent) / 100)
        } else if (item.discountType === 'amount' && item.discountAmount > 0) {
          // For amount discount, ensure it doesn't exceed subtotal
          discountAmount = Math.min(Number(item.discountAmount), subtotal)
        }
        
        const totalPrice = subtotal - discountAmount
        
        // Only update if values have actually changed to prevent infinite loops
        if (item.discountType === 'percentage' && Math.abs(item.discountAmount - discountAmount) > 0.01) {
          setValue(`items.${index}.discountAmount`, Number(discountAmount.toFixed(2)))
        }
        
        if (Math.abs(item.totalPrice - totalPrice) > 0.01) {
          setValue(`items.${index}.totalPrice`, Number(totalPrice.toFixed(2)))
        }
      }
    })
  }, [watchedItems, setValue])

  const loadCustomers = async () => {
    try {
      const response = await salesApi.getCustomers({ limit: 100 })
      setCustomers((response as any).data || [])
    } catch (err) {
      console.error('Failed to load customers:', err)
    }
  }

  const loadProducts = async () => {
    try {
      const response = await ApiService.get('/inventory/products', { params: { limit: 100 } })
      setProducts((response as any).data || [])
    } catch (err) {
      console.error('Failed to load products:', err)
    }
  }

  const handleProductSelect = (index: number, product: any) => {
    if (product) {
      setValue(`items.${index}.productId`, product.id)
      setValue(`items.${index}.unitPrice`, product.retailPrice || 0)
      setValue(`items.${index}.product`, product)
    }
  }

  const formatPriceInput = (value: string) => {
    // Remove all non-digit and non-decimal characters
    const cleanValue = value.replace(/[^0-9.]/g, '')
    
    // Ensure only one decimal point
    const parts = cleanValue.split('.')
    if (parts.length > 2) {
      return parts[0] + '.' + parts.slice(1).join('')
    }
    
    // If there's a decimal part, limit to 2 decimal places
    if (parts.length === 2) {
      parts[1] = parts[1].substring(0, 2)
    }
    
    const numericValue = parseFloat(parts.join('.'))
    if (isNaN(numericValue)) return ''
    
    // Format with comma separators
    const formatted = formatCurrencyInput(numericValue)
    return formatted
  }

  const handlePriceChange = (index: number, value: string) => {
    // Parse the formatted value back to number for storage
    const numericValue = parseFloat(value.replace(/,/g, '')) || 0
    setValue(`items.${index}.unitPrice`, numericValue)
  }

  const calculateOrderTotals = () => {
    const subtotal = watchedItems.reduce((sum, item) => sum + item.totalPrice, 0)
    const orderDiscountAmount = subtotal * (watchedDiscountPercent / 100)
    const discountedSubtotal = subtotal - orderDiscountAmount
    const taxAmount = discountedSubtotal * (watchedTaxPercent / 100)
    const totalAmount = discountedSubtotal + taxAmount + watchedShippingAmount

    return {
      subtotal,
      orderDiscountAmount,
      taxAmount,
      totalAmount,
    }
  }

  const onSubmit = async (data: any) => {
    try {
      setLoading(true)
      setError(null)

      const totals = calculateOrderTotals()
      
      const orderData = {
        customerId: data.customerId,
        orderDate: new Date(data.orderDate),
        requiredDate: data.requiredDate ? new Date(data.requiredDate) : undefined,
        priority: data.priority,
        status: data.status,
        notes: data.notes,
        subtotal: totals.subtotal,
        discountPercent: data.discountPercent,
        discountAmount: totals.orderDiscountAmount,
        taxPercent: data.taxPercent,
        taxAmount: totals.taxAmount,
        shippingAmount: data.shippingAmount,
        totalAmount: totals.totalAmount,
        items: data.items.map(item => ({
          id: '', // Backend will generate
          productId: item.productId,
          product: item.product,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountType: item.discountType,
          discount: item.discountPercent,
          discountAmount: item.discountAmount,
          total: item.totalPrice,
          description: item.description,
        })),
      } as any

      const response = await salesApi.createOrder(orderData)
      onOrderCreated(response.data)
      handleClose()
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create order')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    reset()
    setError(null)
    onClose()
  }

  const addItem = () => {
    append({
      productId: '',
      quantity: 1,
      unitPrice: 0,
      discountType: 'percentage' as const,
      discountPercent: 0,
      discountAmount: 0,
      totalPrice: 0,
      description: '',
    })
  }

  const totals = calculateOrderTotals()

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xl"
      fullWidth
    >
      <DialogTitle>Create New Order</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <Grid container spacing={3}>
            {/* Order Header */}
            <Grid item xs={12}>
              <Typography variant="h6" gutterBottom>Order Information</Typography>
            </Grid>

            <Grid item xs={12} md={6}>
              <Controller
                name="customerId"
                control={control}
                render={({ field }) => (
                  <Autocomplete
                    options={customers}
                    getOptionLabel={(option) => `${option.name} (${option.customerCode})`}
                    value={customers.find(c => c.id === field.value) || null}
                    onChange={(_, value) => field.onChange(value?.id || '')}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Customer"
                        error={!!errors.customerId}
                        helperText={errors.customerId?.message}
                        required
                      />
                    )}
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={3}>
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
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={3}>
              <Controller
                name="requiredDate"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Required Date"
                    type="date"
                    InputLabelProps={{ shrink: true }}
                    error={!!errors.requiredDate}
                    helperText={errors.requiredDate?.message}
                    fullWidth
                  />
                )}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.priority}>
                    <InputLabel>Priority</InputLabel>
                    <Select {...field} label="Priority">
                      <MenuItem value="low">Low</MenuItem>
                      <MenuItem value="normal">Normal</MenuItem>
                      <MenuItem value="high">High</MenuItem>
                      <MenuItem value="urgent">Urgent</MenuItem>
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <Controller
                name="status"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.status}>
                    <InputLabel>Status</InputLabel>
                    <Select {...field} label="Status">
                      <MenuItem value="draft">Draft</MenuItem>
                      <MenuItem value="pending">Pending</MenuItem>
                    </Select>
                  </FormControl>
                )}
              />
            </Grid>

            <Grid item xs={12}>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="Notes"
                    multiline
                    rows={3}
                    fullWidth
                  />
                )}
              />
            </Grid>

            {/* Order Items */}
            <Grid item xs={12}>
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
                      <TableCell align="center" sx={{ width: '30%', minWidth: 180 }}>Product</TableCell>
                      <TableCell align="center" sx={{ width: '8%', minWidth: 60 }}>Qty</TableCell>
                      <TableCell align="center" sx={{ width: '12%', minWidth: 90 }}>Unit Price</TableCell>
                      <TableCell align="center" sx={{ width: '10%', minWidth: 80 }}>Disc Type</TableCell>
                      <TableCell align="center" sx={{ width: '12%', minWidth: 90 }}>Discount</TableCell>
                      <TableCell align="center" sx={{ width: '12%', minWidth: 90 }}>Total</TableCell>
                      <TableCell align="center" sx={{ width: '8%', minWidth: 60 }}>Action</TableCell>
                      <TableCell align="center" sx={{ width: '4%', minWidth: 40 }}></TableCell>
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
                                getOptionLabel={(option) => `${option.name} (${option.barcode})`}
                                value={products.find(p => p.id === productField.value) || null}
                                onChange={(_, value) => handleProductSelect(index, value)}
                                size="small"
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    placeholder="Select product..."
                                    variant="outlined"
                                    error={!!errors.items?.[index]?.productId}
                                    sx={{
                                      '& .MuiInputBase-input': {
                                        textAlign: 'left !important',
                                        padding: '6px 8px !important',
                                      }
                                    }}
                                  />
                                )}
                                sx={{
                                  '& .MuiAutocomplete-inputRoot': {
                                    padding: '0 !important',
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
                                inputProps={{ min: 1, style: { textAlign: 'center' } }}
                                error={!!errors.items?.[index]?.quantity}
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
                                value={formatCurrencyInput(priceField.value)}
                                onChange={(e) => {
                                  const formattedValue = formatPriceInput(e.target.value)
                                  handlePriceChange(index, formattedValue)
                                }}
                                variant="outlined"
                                inputProps={{
                                  style: { textAlign: 'right' }
                                }}
                                InputProps={{
                                  startAdornment: <span style={{ marginRight: '4px', fontSize: '12px', color: '#666' }}>RM</span>
                                }}
                                error={!!errors.items?.[index]?.unitPrice}
                              />
                            )}
                          />
                        </TableCell>
                        <TableCell sx={{ padding: '2px !important' }}>
                          <Controller
                            name={`items.${index}.discountType`}
                            control={control}
                            render={({ field: discountTypeField }) => (
                              <FormControl fullWidth variant="outlined" size="small">
                                <Select
                                  {...discountTypeField}
                                  sx={{
                                    '& .MuiOutlinedInput-notchedOutline': {
                                      border: 'none',
                                    },
                                    '&:hover .MuiOutlinedInput-notchedOutline': {
                                      border: '1px solid #1976d2',
                                    },
                                    '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                                      border: '1px solid #1976d2',
                                    },
                                    '& .MuiSelect-select': {
                                      padding: '6px 8px',
                                      fontSize: '0.875rem',
                                    },
                                  }}
                                >
                                  <MenuItem value="percentage">%</MenuItem>
                                  <MenuItem value="amount">RM</MenuItem>
                                </Select>
                              </FormControl>
                            )}
                          />
                        </TableCell>
                        <TableCell sx={{ padding: '2px !important' }}>
                          {watchedItems[index]?.discountType === 'percentage' ? (
                            <Controller
                              name={`items.${index}.discountPercent`}
                              control={control}
                              render={({ field: discountField }) => (
                                <TextField
                                  {...discountField}
                                  type="number"
                                  variant="outlined"
                                  onChange={(e) => {
                                    const value = parseFloat(e.target.value) || 0
                                    discountField.onChange(value)
                                    
                                    // Trigger immediate recalculation
                                    const quantity = watchedItems[index]?.quantity || 0
                                    const unitPrice = watchedItems[index]?.unitPrice || 0
                                    if (quantity && unitPrice) {
                                      const subtotal = Number(quantity) * Number(unitPrice)
                                      const discountAmount = value > 0 ? subtotal * (value / 100) : 0
                                      const totalPrice = subtotal - discountAmount
                                      
                                      setValue(`items.${index}.discountAmount`, Number(discountAmount.toFixed(2)))
                                      setValue(`items.${index}.totalPrice`, Number(totalPrice.toFixed(2)))
                                    }
                                  }}
                                  inputProps={{ 
                                    min: 0, 
                                    max: 100,
                                    style: { textAlign: 'center' }
                                  }}
                                  InputProps={{
                                    endAdornment: <span style={{ marginLeft: '4px', fontSize: '12px', color: '#666' }}>%</span>
                                  }}
                                  error={!!errors.items?.[index]?.discountPercent}
                                />
                              )}
                            />
                          ) : (
                            <Controller
                              name={`items.${index}.discountAmount`}
                              control={control}
                              render={({ field: discountAmountField }) => (
                                <TextField
                                  value={formatCurrencyInput(discountAmountField.value)}
                                  onChange={(e) => {
                                    const formattedValue = formatPriceInput(e.target.value)
                                    const numericValue = parseFloat(formattedValue.replace(/,/g, '')) || 0
                                    discountAmountField.onChange(numericValue)
                                    
                                    // Trigger immediate recalculation
                                    const quantity = watchedItems[index]?.quantity || 0
                                    const unitPrice = watchedItems[index]?.unitPrice || 0
                                    if (quantity && unitPrice) {
                                      const subtotal = Number(quantity) * Number(unitPrice)
                                      const discountAmount = Math.min(numericValue, subtotal)
                                      const totalPrice = subtotal - discountAmount
                                      
                                      setValue(`items.${index}.discountAmount`, Number(discountAmount.toFixed(2)))
                                      setValue(`items.${index}.totalPrice`, Number(totalPrice.toFixed(2)))
                                    }
                                  }}
                                  variant="outlined"
                                  inputProps={{
                                    style: { textAlign: 'right' }
                                  }}
                                  InputProps={{
                                    startAdornment: <span style={{ marginRight: '4px', fontSize: '12px', color: '#666' }}>RM</span>
                                  }}
                                  error={!!errors.items?.[index]?.discountAmount}
                                />
                              )}
                            />
                          )}
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
            </Grid>

            {/* Order Totals */}
            <Grid item xs={12} md={8} />
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>Order Summary</Typography>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                  <Typography>Subtotal:</Typography>
                  <Typography>{formatCurrency(totals.subtotal)}</Typography>
                </Box>

                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={6}>
                    <Controller
                      name="discountPercent"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label="Discount %"
                          type="number"
                          size="small"
                          fullWidth
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      -{formatCurrency(totals.orderDiscountAmount)}
                    </Typography>
                  </Grid>
                </Grid>

                <Grid container spacing={2} sx={{ mb: 2 }}>
                  <Grid item xs={6}>
                    <Controller
                      name="taxPercent"
                      control={control}
                      render={({ field }) => (
                        <TextField
                          {...field}
                          label="Tax %"
                          type="number"
                          size="small"
                          fullWidth
                        />
                      )}
                    />
                  </Grid>
                  <Grid item xs={6}>
                    <Typography variant="body2" sx={{ mt: 1 }}>
                      {formatCurrency(totals.taxAmount)}
                    </Typography>
                  </Grid>
                </Grid>

                <Controller
                  name="shippingAmount"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Shipping"
                      type="number"
                      size="small"
                      fullWidth
                      inputProps={{
                        step: "0.01",
                        min: "0"
                      }}
                      InputProps={{
                        startAdornment: <span style={{ marginRight: '4px', fontSize: '14px' }}>RM</span>
                      }}
                      sx={{ mb: 2 }}
                    />
                  )}
                />

                <Divider sx={{ my: 1 }} />
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                  <Typography variant="h6">Total:</Typography>
                  <Typography variant="h6">{formatCurrency(totals.totalAmount)}</Typography>
                </Box>
              </Paper>
            </Grid>
          </Grid>
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button 
            type="submit" 
            variant="contained"
            disabled={loading}
          >
            {loading ? 'Creating...' : 'Create Order'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default CreateOrderDialog