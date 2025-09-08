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
import type { Customer, SalesOrder } from '@/types'

interface OrderItem {
  productId: string
  product?: any
  quantity: number
  unitPrice: number
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
      const subtotal = item.quantity * item.unitPrice
      const discountAmount = item.discountPercent > 0 ? subtotal * (item.discountPercent / 100) : 0
      const totalPrice = subtotal - discountAmount
      
      if (item.discountAmount !== discountAmount || item.totalPrice !== totalPrice) {
        setValue(`items.${index}.discountAmount`, discountAmount)
        setValue(`items.${index}.totalPrice`, totalPrice)
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

              <TableContainer component={Paper}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Product</TableCell>
                      <TableCell width={100}>Quantity</TableCell>
                      <TableCell width={120}>Unit Price</TableCell>
                      <TableCell width={100}>Discount %</TableCell>
                      <TableCell width={120}>Total</TableCell>
                      <TableCell width={50}>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {fields.map((field, index) => (
                      <TableRow key={field.id}>
                        <TableCell>
                          <Controller
                            name={`items.${index}.productId`}
                            control={control}
                            render={({ field: productField }) => (
                              <Autocomplete
                                options={products}
                                getOptionLabel={(option) => `${option.name} (${option.barcode})`}
                                value={products.find(p => p.id === productField.value) || null}
                                onChange={(_, value) => handleProductSelect(index, value)}
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    placeholder="Select product"
                                    size="small"
                                    error={!!errors.items?.[index]?.productId}
                                    helperText={errors.items?.[index]?.productId?.message}
                                  />
                                )}
                              />
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Controller
                            name={`items.${index}.quantity`}
                            control={control}
                            render={({ field: qtyField }) => (
                              <TextField
                                {...qtyField}
                                type="number"
                                size="small"
                                error={!!errors.items?.[index]?.quantity}
                                helperText={errors.items?.[index]?.quantity?.message}
                              />
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Controller
                            name={`items.${index}.unitPrice`}
                            control={control}
                            render={({ field: priceField }) => (
                              <TextField
                                {...priceField}
                                type="number"
                                size="small"
                                error={!!errors.items?.[index]?.unitPrice}
                                helperText={errors.items?.[index]?.unitPrice?.message}
                              />
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Controller
                            name={`items.${index}.discountPercent`}
                            control={control}
                            render={({ field: discountField }) => (
                              <TextField
                                {...discountField}
                                type="number"
                                size="small"
                                error={!!errors.items?.[index]?.discountPercent}
                                helperText={errors.items?.[index]?.discountPercent?.message}
                              />
                            )}
                          />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" fontWeight="medium">
                            {formatCurrency(watchedItems[index]?.totalPrice || 0)}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <IconButton
                            onClick={() => remove(index)}
                            disabled={fields.length === 1}
                            size="small"
                          >
                            <DeleteIcon />
                          </IconButton>
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