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
  notes?: string
  items: OrderItem[]
}

const schema = yup.object({
  customerId: yup.string().required('Customer is required'),
  orderDate: yup.string().required('Order date is required'),
  notes: yup.string().optional(),
  items: yup.array().of(
    yup.object({
      productId: yup.string().required('Product is required'),
      quantity: yup.number().positive('Quantity must be positive').required(),
      unitPrice: yup.number().min(0).required(),
      discountType: yup.string().oneOf(['percentage', 'amount']).optional(),
      discountPercent: yup.number().min(0).max(100).optional(),
      discountAmount: yup.number().min(0).optional(),
      totalPrice: yup.number().min(0).required(),
      description: yup.string().optional(),
    })
  ).min(1, 'At least one item is required'),
})

interface CreateOrderDialogProps {
  open: boolean
  onClose: () => void
  onOrderCreated: (order: SalesOrder) => void
  editOrder?: SalesOrder | null // For edit mode
}

const CreateOrderDialog: React.FC<CreateOrderDialogProps> = ({
  open,
  onClose,
  onOrderCreated,
  editOrder = null,
}) => {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [discountDisplayValues, setDiscountDisplayValues] = useState<{[key: number]: string}>({})
  const [productSearchTerms, setProductSearchTerms] = useState<{[key: number]: string}>({})

  const { control, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm<CreateOrderFormData>({
    resolver: yupResolver(schema) as any,
    defaultValues: {
      customerId: '',
      orderDate: new Date().toISOString().split('T')[0],
      notes: '',
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

  useEffect(() => {
    if (open) {
      loadCustomers()
      loadProducts()
    }
  }, [open])

  // Populate form when in edit mode
  useEffect(() => {
    if (editOrder && open) {
      // Populate the form with order data
      setValue('customerId', editOrder.customerId || '')
      setValue('orderDate', editOrder.orderDate ? new Date(editOrder.orderDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0])
      setValue('notes', editOrder.notes || '')

      // Populate items
      if (editOrder.items && editOrder.items.length > 0) {
        const formattedItems = editOrder.items.map((item: any) => ({
          productId: item.productId || '',
          product: item.product,
          quantity: item.quantity || 1,
          unitPrice: item.unitPrice || 0,
          discountType: (item.discountType || 'percentage') as 'percentage' | 'amount',
          discountPercent: Number(item.discountPercent) || 0,
          discountAmount: Number(item.discountAmount) || 0,
          totalPrice: item.totalPrice || (item.quantity * item.unitPrice) || 0,
          description: item.description || item.notes || '',
        }))
        setValue('items', formattedItems)
      }
    } else if (!editOrder && open) {
      // Reset form for create mode
      reset({
        customerId: '',
        orderDate: new Date().toISOString().split('T')[0],
        notes: '',
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
      })
    }
  }, [editOrder, open, setValue, reset])

  useEffect(() => {
    // Recalculate totals when items change
    watchedItems.forEach((item, index) => {
      if (item.quantity && item.unitPrice) {
        const subtotal = Number(item.quantity) * Number(item.unitPrice)
        let discountAmount = 0
        let discountPercent = Number(item.discountPercent) || 0
        
        if (item.discountType === 'percentage' && discountPercent > 0) {
          discountAmount = subtotal * (discountPercent / 100)
          // Only update amount if it's significantly different (avoid constant updates)
          if (Math.abs(item.discountAmount - discountAmount) > 0.01) {
            setValue(`items.${index}.discountAmount`, Number(discountAmount.toFixed(2)))
          }
        } else if (item.discountType === 'amount' && item.discountAmount > 0) {
          // For amount discount, ensure it doesn't exceed subtotal
          discountAmount = Math.min(Number(item.discountAmount), subtotal)
          // Only update the actual discount amount if it was clamped
          if (Math.abs(Number(item.discountAmount) - discountAmount) > 0.01) {
            setValue(`items.${index}.discountAmount`, Number(discountAmount.toFixed(2)))
          }
          // Calculate equivalent percentage but don't automatically sync unless it's way off
          const equivalentPercent = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0
          // Only sync percentage if there's a major discrepancy (more than 1%)
          if (Math.abs(item.discountPercent - equivalentPercent) > 1) {
            setValue(`items.${index}.discountPercent`, Number(equivalentPercent.toFixed(2)))
          }
        }
        
        const totalPrice = subtotal - discountAmount
        
        // Update total price if it has changed
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

  const loadProducts = async (searchTerm: string = '', rowIndex?: number) => {
    try {
      const params: any = { limit: 100 }
      if (searchTerm && searchTerm.trim().length >= 1) {
        params.search = searchTerm.trim()
      }
      const response = await ApiService.get('/inventory/products', { params })
      const productData = (response as any).data || []

      // If this is for a specific row and we have search results, track them
      if (rowIndex !== undefined && searchTerm) {
        setProductSearchTerms(prev => ({ ...prev, [rowIndex]: searchTerm }))
      } else if (rowIndex !== undefined && !searchTerm) {
        // Clear search term for this row
        setProductSearchTerms(prev => {
          const updated = { ...prev }
          delete updated[rowIndex]
          return updated
        })
      }

      setProducts(productData)
    } catch (err) {
      console.error('Failed to load products:', err)
    }
  }

  const handleProductSelect = (index: number, product: any) => {
    if (product) {
      setValue(`items.${index}.productId`, product.id)
      setValue(`items.${index}.unitPrice`, product.retailPrice || 0)
      setValue(`items.${index}.product`, product)
      
      // Trigger immediate total calculation with proper synchronization
      const currentItem = watchedItems[index]
      const quantity = currentItem?.quantity || 1
      const unitPrice = product.retailPrice || 0
      
      if (quantity && unitPrice) {
        const subtotal = Number(quantity) * Number(unitPrice)
        let discountAmount = 0
        let discountPercent = Number(currentItem?.discountPercent) || 0
        
        if (currentItem?.discountType === 'percentage' && discountPercent > 0) {
          discountAmount = subtotal * (discountPercent / 100)
        } else if (currentItem?.discountType === 'amount' && currentItem?.discountAmount > 0) {
          discountAmount = Math.min(Number(currentItem.discountAmount), subtotal)
          // Recalculate percentage to match the amount
          discountPercent = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0
          setValue(`items.${index}.discountPercent`, Number(discountPercent.toFixed(2)))
        }
        
        const totalPrice = subtotal - discountAmount
        
        setValue(`items.${index}.discountAmount`, Number(discountAmount.toFixed(2)))
        setValue(`items.${index}.totalPrice`, Number(totalPrice.toFixed(2)))
        
        // Clear any display value override
        setDiscountDisplayValues(prev => {
          const updated = { ...prev }
          delete updated[index]
          return updated
        })
      }
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
    
    // If there's a decimal part, limit to 4 decimal places for amount discounts
    if (parts.length === 2) {
      parts[1] = parts[1].substring(0, 4)
    }
    
    const numericValue = parseFloat(parts.join('.'))
    if (isNaN(numericValue)) return ''
    
    // For discount amounts, we need to preserve the raw input to allow 4 decimal places
    // Return the clean input as is for amount fields
    return parts.join('.')
  }

  const handlePriceChange = (index: number, value: string) => {
    // Parse the formatted value back to number for storage
    const numericValue = parseFloat(value.replace(/,/g, '')) || 0
    setValue(`items.${index}.unitPrice`, numericValue)

    // Trigger immediate total recalculation
    const currentItem = watchedItems[index]
    const quantity = currentItem?.quantity || 0

    if (quantity && numericValue) {
      const subtotal = Number(quantity) * Number(numericValue)
      let discountAmount = 0
      let discountPercent = Number(currentItem?.discountPercent) || 0

      if (currentItem?.discountType === 'percentage' && discountPercent > 0) {
        discountAmount = subtotal * (discountPercent / 100)
        setValue(`items.${index}.discountAmount`, Number(discountAmount.toFixed(2)))
      } else if (currentItem?.discountType === 'amount' && currentItem?.discountAmount > 0) {
        discountAmount = Math.min(Number(currentItem.discountAmount), subtotal)
        // Recalculate percentage to match the amount
        discountPercent = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0
        setValue(`items.${index}.discountPercent`, Number(discountPercent.toFixed(2)))
        setValue(`items.${index}.discountAmount`, Number(discountAmount.toFixed(2)))
      }

      const totalPrice = subtotal - discountAmount
      setValue(`items.${index}.totalPrice`, Number(totalPrice.toFixed(2)))

      // Clear any display value override
      setDiscountDisplayValues(prev => {
        const updated = { ...prev }
        delete updated[index]
        return updated
      })
    }
  }

  const calculateOrderTotals = () => {
    const totalAmount = watchedItems.reduce((sum, item) => sum + item.totalPrice, 0)

    return {
      totalAmount,
    }
  }

  const onSubmit = async (data: any) => {
    try {
      setLoading(true)
      setError(null)

      const orderData = {
        customerId: data.customerId,
        notes: data.notes || undefined,
        items: data.items.map((item: OrderItem) => ({
          productId: item.productId,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discountType: item.discountType || 'percentage',
          discountPercent: Number(item.discountPercent) || 0,
          discountAmount: Number(item.discountAmount) || 0,
          notes: item.description || undefined,
        })),
      }

      let response
      if (editOrder) {
        // Update existing order
        response = await salesApi.updateOrder(editOrder.id, orderData)
      } else {
        // Create new order
        response = await salesApi.createOrder(orderData)
      }

      // API returns the order directly
      onOrderCreated(response as SalesOrder)
      handleClose()
    } catch (err: any) {
      setError(err.response?.data?.message || `Failed to ${editOrder ? 'update' : 'create'} order`)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    reset()
    setError(null)
    setDiscountDisplayValues({})
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
      maxWidth="lg"
      fullWidth
      PaperProps={{
        sx: {
          maxHeight: '90vh',
          width: '70vw',
          maxWidth: '900px',
        }
      }}
    >
      <DialogTitle>{editOrder ? 'Edit Order' : 'Create New Order'}</DialogTitle>
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
                    getOptionLabel={(option) => option.name}
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
                                getOptionLabel={(option) => option.name}
                                value={products.find(p => p.id === productField.value) || null}
                                onChange={(_, value) => {
                                  handleProductSelect(index, value)
                                  // Clear search term when product is selected
                                  setProductSearchTerms(prev => {
                                    const updated = { ...prev }
                                    delete updated[index]
                                    return updated
                                  })
                                }}
                                onInputChange={(_, value, reason) => {
                                  // Only search when user is typing, not when clearing or selecting
                                  if (reason === 'input') {
                                    if (value.trim().length >= 1) {
                                      loadProducts(value, index)
                                    } else {
                                      loadProducts('', index)
                                    }
                                  }
                                }}
                                filterOptions={(options) => {
                                  // Let the backend handle filtering, just return all options
                                  return options
                                }}
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
                                  onChange={(e) => {
                                    const newDiscountType = e.target.value as 'percentage' | 'amount'
                                    const currentItem = watchedItems[index]
                                    const quantity = currentItem?.quantity || 0
                                    const unitPrice = currentItem?.unitPrice || 0
                                    const subtotal = Number(quantity) * Number(unitPrice)
                                    
                                    // Update the discount type first
                                    discountTypeField.onChange(newDiscountType)
                                    
                                    // Convert discount values when switching types
                                    if (subtotal > 0 && currentItem) {
                                      const oldDiscountType = discountTypeField.value
                                      
                                      if (newDiscountType === 'percentage' && oldDiscountType === 'amount') {
                                        // Converting from amount to percentage - preserve the amount value as percentage
                                        const currentDiscountAmount = currentItem.discountAmount || 0
                                        setValue(`items.${index}.discountPercent`, Number(currentDiscountAmount.toFixed(2)))
                                        // Keep amount unchanged
                                        setValue(`items.${index}.discountAmount`, Number(currentDiscountAmount.toFixed(2)))
                                      } else if (newDiscountType === 'amount' && oldDiscountType === 'percentage') {
                                        // Converting from percentage to amount - preserve the percentage value as amount
                                        const currentDiscountPercent = currentItem.discountPercent || 0
                                        setValue(`items.${index}.discountAmount`, Number(currentDiscountPercent.toFixed(2)))
                                        // Keep percentage unchanged
                                        setValue(`items.${index}.discountPercent`, Number(currentDiscountPercent.toFixed(2)))
                                      }
                                      
                                      // Clear display value override to show actual values
                                      setDiscountDisplayValues(prev => {
                                        const updated = { ...prev }
                                        delete updated[index]
                                        return updated
                                      })
                                      
                                      // Recalculate total immediately based on the new discount type
                                      let finalDiscountAmount = 0
                                      if (newDiscountType === 'percentage') {
                                        // Use the preserved percentage value for calculation
                                        const discountPercent = (newDiscountType === 'percentage' && oldDiscountType === 'amount') 
                                          ? (currentItem.discountAmount || 0)  // Use preserved amount as percentage
                                          : (currentItem.discountPercent || 0)
                                        finalDiscountAmount = subtotal * (discountPercent / 100)
                                      } else {
                                        // Use the preserved amount value for calculation
                                        const discountAmount = (newDiscountType === 'amount' && oldDiscountType === 'percentage')
                                          ? (currentItem.discountPercent || 0)  // Use preserved percentage as amount
                                          : (currentItem.discountAmount || 0)
                                        finalDiscountAmount = Math.min(discountAmount, subtotal)
                                      }
                                      const totalPrice = subtotal - finalDiscountAmount
                                      setValue(`items.${index}.totalPrice`, Number(totalPrice.toFixed(2)))
                                    }
                                  }}
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
                                    const value = Math.min(parseFloat(e.target.value) || 0, 100)
                                    discountField.onChange(value)
                                    
                                    // Trigger immediate recalculation and synchronization
                                    const quantity = watchedItems[index]?.quantity || 0
                                    const unitPrice = watchedItems[index]?.unitPrice || 0
                                    if (quantity && unitPrice) {
                                      const subtotal = Number(quantity) * Number(unitPrice)
                                      const discountAmount = value > 0 ? subtotal * (value / 100) : 0
                                      const totalPrice = subtotal - discountAmount
                                      
                                      setValue(`items.${index}.discountAmount`, Number(discountAmount.toFixed(2)))
                                      setValue(`items.${index}.totalPrice`, Number(totalPrice.toFixed(2)))
                                      
                                      // Clear display value override to show calculated amount
                                      setDiscountDisplayValues(prev => {
                                        const updated = { ...prev }
                                        delete updated[index]
                                        return updated
                                      })
                                    }
                                  }}
                                  inputProps={{ 
                                    min: 0, 
                                    max: 100,
                                    step: 0.01,
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
                                  value={discountDisplayValues[index] !== undefined ? discountDisplayValues[index] : (discountAmountField.value?.toString() || '')}
                                  onChange={(e) => {
                                    const inputValue = e.target.value
                                    
                                    // Allow decimal numbers with up to 4 decimal places
                                    const cleanValue = inputValue.replace(/[^0-9.]/g, '')
                                    const parts = cleanValue.split('.')
                                    let finalValue = cleanValue
                                    
                                    // Ensure only one decimal point and max 4 decimal places
                                    if (parts.length > 2) {
                                      finalValue = parts[0] + '.' + parts.slice(1).join('')
                                    }
                                    if (parts.length === 2 && parts[1].length > 4) {
                                      finalValue = parts[0] + '.' + parts[1].substring(0, 4)
                                    }
                                    
                                    // Store the display value to preserve decimal point input
                                    setDiscountDisplayValues(prev => ({ ...prev, [index]: finalValue }))
                                    
                                    // Store the numeric value for calculations
                                    const numericValue = parseFloat(finalValue) || 0
                                    discountAmountField.onChange(numericValue)
                                    
                                    // Trigger immediate recalculation and synchronization
                                    const quantity = watchedItems[index]?.quantity || 0
                                    const unitPrice = watchedItems[index]?.unitPrice || 0
                                    if (quantity && unitPrice) {
                                      const subtotal = Number(quantity) * Number(unitPrice)
                                      const discountAmount = Math.min(numericValue, subtotal)
                                      const totalPrice = subtotal - discountAmount
                                      
                                      // Calculate equivalent percentage
                                      const equivalentPercent = subtotal > 0 ? (discountAmount / subtotal) * 100 : 0
                                      
                                      setValue(`items.${index}.discountAmount`, Number(discountAmount.toFixed(4)))
                                      setValue(`items.${index}.discountPercent`, Number(equivalentPercent.toFixed(2)))
                                      setValue(`items.${index}.totalPrice`, Number(totalPrice.toFixed(2)))
                                    }
                                  }}
                                  onBlur={() => {
                                    // Clean up display value on blur - remove trailing decimal point if no digits follow
                                    const currentDisplay = discountDisplayValues[index] || ''
                                    if (currentDisplay.endsWith('.')) {
                                      setDiscountDisplayValues(prev => ({ ...prev, [index]: currentDisplay.slice(0, -1) }))
                                    }
                                  }}
                                  variant="outlined"
                                  inputProps={{
                                    step: "0.01",
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
            <Grid item xs={12} md={8}>
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
            <Grid item xs={12} md={4}>
              <Paper sx={{ p: 2 }}>
                <Typography variant="h6" gutterBottom>Order Summary</Typography>

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
            {loading ? (editOrder ? 'Updating...' : 'Creating...') : (editOrder ? 'Update Order' : 'Create Order')}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default CreateOrderDialog