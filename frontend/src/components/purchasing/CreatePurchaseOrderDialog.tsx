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
} from '@mui/material'
import {
  Add as AddIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { purchasingApi } from '@/services/purchasingApi'
import { ApiService } from '@/services/api'
import { formatCurrency } from '@/utils/formatters'

interface PurchaseOrderItem {
  productId: string
  product?: any
  quantity: number
  unitPrice: number
  discountPercent: number
  totalPrice: number
}

interface CreatePurchaseOrderFormData {
  supplierId: string
  orderDate: string
  notes?: string
  items: PurchaseOrderItem[]
}

const schema = yup.object({
  supplierId: yup.string().required('Supplier is required'),
  orderDate: yup.string().required('Order date is required'),
  notes: yup.string().optional(),
  items: yup.array().of(
    yup.object({
      productId: yup.string().required('Product is required'),
      quantity: yup.number().positive('Quantity must be positive').required(),
      unitPrice: yup.number().min(0).required(),
      discountPercent: yup.number().min(0).max(100).optional(),
      totalPrice: yup.number().min(0).required(),
    })
  ).min(1, 'At least one item is required'),
})

interface CreatePurchaseOrderDialogProps {
  open: boolean
  onClose: () => void
  onOrderCreated: () => void
}

const CreatePurchaseOrderDialog: React.FC<CreatePurchaseOrderDialogProps> = ({
  open,
  onClose,
  onOrderCreated,
}) => {
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
      items: [
        {
          productId: '',
          quantity: 1,
          unitPrice: 0,
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

  useEffect(() => {
    if (open) {
      loadSuppliers()
      loadProducts()
    }
  }, [open])

  // Recalculate totals when items change
  useEffect(() => {
    watchedItems.forEach((item, index) => {
      if (item.quantity && item.unitPrice !== undefined) {
        const subtotal = Number(item.quantity) * Number(item.unitPrice)
        const discountAmount = subtotal * (Number(item.discountPercent || 0) / 100)
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
      setSuppliers(response.suppliers || [])
    } catch (err) {
      console.error('Error loading suppliers:', err)
    }
  }

  const loadProducts = async () => {
    try {
      const api = new ApiService()
      const response = await api.get('/inventory/products', { params: { limit: 1000 } })
      setProducts(response.data?.data || [])
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

      await purchasingApi.createPurchaseOrder(orderData)

      reset()
      onOrderCreated()
      onClose()
    } catch (err: any) {
      console.error('Error creating purchase order:', err)
      setError(err.response?.data?.message || 'Failed to create purchase order')
    } finally {
      setLoading(false)
    }
  }

  const handleProductSelect = (index: number, product: any) => {
    if (product) {
      setValue(`items.${index}.productId`, product.id)
      setValue(`items.${index}.unitPrice`, Number(product.baseCost || 0))
    }
  }

  const calculateGrandTotal = () => {
    return watchedItems.reduce((sum, item) => sum + (Number(item.totalPrice) || 0), 0)
  }

  return (
    <Dialog open={open} onClose={onClose} maxWidth="lg" fullWidth>
      <DialogTitle>Create Purchase Order</DialogTitle>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}

          <Grid container spacing={2}>
            {/* Supplier Selection */}
            <Grid item xs={12} md={6}>
              <Controller
                name="supplierId"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth error={!!errors.supplierId}>
                    <InputLabel>Supplier *</InputLabel>
                    <Select {...field} label="Supplier *">
                      {suppliers.map((supplier) => (
                        <MenuItem key={supplier.id} value={supplier.id}>
                          {supplier.companyName}
                        </MenuItem>
                      ))}
                    </Select>
                    {errors.supplierId && (
                      <Typography variant="caption" color="error">
                        {errors.supplierId.message}
                      </Typography>
                    )}
                  </FormControl>
                )}
              />
            </Grid>

            {/* Order Date */}
            <Grid item xs={12} md={6}>
              <Controller
                name="orderDate"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Order Date *"
                    type="date"
                    InputLabelProps={{ shrink: true }}
                    error={!!errors.orderDate}
                    helperText={errors.orderDate?.message}
                  />
                )}
              />
            </Grid>

            {/* Notes */}
            <Grid item xs={12}>
              <Controller
                name="notes"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Notes"
                    multiline
                    rows={2}
                  />
                )}
              />
            </Grid>
          </Grid>

          {/* Order Items */}
          <Box sx={{ mt: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
              <Typography variant="h6">Order Items</Typography>
              <Button
                startIcon={<AddIcon />}
                onClick={() => append({
                  productId: '',
                  quantity: 1,
                  unitPrice: 0,
                  discountPercent: 0,
                  totalPrice: 0,
                })}
                size="small"
              >
                Add Item
              </Button>
            </Box>

            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Product *</TableCell>
                    <TableCell width="120px">Qty *</TableCell>
                    <TableCell width="150px">Unit Price *</TableCell>
                    <TableCell width="120px">Disc %</TableCell>
                    <TableCell width="150px">Total</TableCell>
                    <TableCell width="60px"></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fields.map((field, index) => (
                    <TableRow key={field.id}>
                      <TableCell>
                        <Controller
                          name={`items.${index}.productId`}
                          control={control}
                          render={({ field }) => (
                            <Autocomplete
                              options={products}
                              getOptionLabel={(option) => option.name || ''}
                              value={products.find(p => p.id === field.value) || null}
                              onChange={(_, value) => {
                                field.onChange(value?.id || '')
                                handleProductSelect(index, value)
                              }}
                              renderInput={(params) => (
                                <TextField
                                  {...params}
                                  size="small"
                                  placeholder="Select product"
                                  error={!!errors.items?.[index]?.productId}
                                />
                              )}
                              size="small"
                              sx={{ minWidth: 200 }}
                            />
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Controller
                          name={`items.${index}.quantity`}
                          control={control}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              type="number"
                              size="small"
                              fullWidth
                              inputProps={{ min: 0, step: 1 }}
                            />
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Controller
                          name={`items.${index}.unitPrice`}
                          control={control}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              type="number"
                              size="small"
                              fullWidth
                              inputProps={{ min: 0, step: 0.01 }}
                            />
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Controller
                          name={`items.${index}.discountPercent`}
                          control={control}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              type="number"
                              size="small"
                              fullWidth
                              inputProps={{ min: 0, max: 100, step: 0.01 }}
                            />
                          )}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">
                          {formatCurrency(watchedItems[index]?.totalPrice || 0)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <IconButton
                          size="small"
                          onClick={() => remove(index)}
                          disabled={fields.length === 1}
                          color="error"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {/* Grand Total */}
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', mt: 2 }}>
              <Typography variant="h6">
                Grand Total: {formatCurrency(calculateGrandTotal())}
              </Typography>
            </Box>

            {errors.items && typeof errors.items.message === 'string' && (
              <Typography variant="caption" color="error" sx={{ mt: 1, display: 'block' }}>
                {errors.items.message}
              </Typography>
            )}
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? 'Creating...' : 'Create Order'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}

export default CreatePurchaseOrderDialog
