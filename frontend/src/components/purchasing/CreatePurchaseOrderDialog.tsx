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
  productId?: string
  product?: any
  description: string
  quantity: number
  unitPrice: number
  unit?: string
  discountPercent: number
  taxPercent: number
  totalPrice: number
  notes?: string
}

interface CreatePurchaseOrderFormData {
  supplierId: string
  orderDate: string
  requiredDate?: string
  priority: string
  notes?: string
  items: PurchaseOrderItem[]
}

const schema = yup.object({
  supplierId: yup.string().required('Supplier is required'),
  orderDate: yup.string().required('Order date is required'),
  requiredDate: yup.string().optional(),
  priority: yup.string().optional(),
  notes: yup.string().optional(),
  items: yup.array().of(
    yup.object({
      productId: yup.string().optional(),
      description: yup.string().required('Description is required'),
      quantity: yup.number().positive('Quantity must be positive').required(),
      unitPrice: yup.number().min(0).required(),
      unit: yup.string().optional(),
      discountPercent: yup.number().min(0).max(100).optional(),
      taxPercent: yup.number().min(0).max(100).optional(),
      totalPrice: yup.number().min(0).required(),
      notes: yup.string().optional(),
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
      requiredDate: '',
      priority: 'normal',
      notes: '',
      items: [
        {
          productId: '',
          description: '',
          quantity: 1,
          unitPrice: 0,
          unit: '',
          discountPercent: 0,
          taxPercent: 0,
          totalPrice: 0,
          notes: '',
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
        const afterDiscount = subtotal - discountAmount
        const taxAmount = afterDiscount * (Number(item.taxPercent || 0) / 100)
        const total = afterDiscount + taxAmount

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
        requiredDate: data.requiredDate || undefined,
        priority: data.priority || 'normal',
        notes: data.notes || undefined,
        items: data.items.map(item => ({
          productId: item.productId || undefined,
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          unit: item.unit || undefined,
          discountPercent: Number(item.discountPercent || 0),
          taxPercent: Number(item.taxPercent || 0),
          notes: item.notes || undefined,
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
      setValue(`items.${index}.description`, product.name)
      setValue(`items.${index}.unitPrice`, Number(product.baseCost || 0))
      setValue(`items.${index}.unit`, 'pcs')
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

            {/* Priority */}
            <Grid item xs={12} md={6}>
              <Controller
                name="priority"
                control={control}
                render={({ field }) => (
                  <FormControl fullWidth>
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

            {/* Required Date */}
            <Grid item xs={12} md={6}>
              <Controller
                name="requiredDate"
                control={control}
                render={({ field }) => (
                  <TextField
                    {...field}
                    fullWidth
                    label="Required Date"
                    type="date"
                    InputLabelProps={{ shrink: true }}
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
                  description: '',
                  quantity: 1,
                  unitPrice: 0,
                  unit: '',
                  discountPercent: 0,
                  taxPercent: 0,
                  totalPrice: 0,
                  notes: '',
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
                    <TableCell>Product</TableCell>
                    <TableCell>Description *</TableCell>
                    <TableCell width="100px">Qty *</TableCell>
                    <TableCell width="120px">Unit Price *</TableCell>
                    <TableCell width="80px">Disc %</TableCell>
                    <TableCell width="80px">Tax %</TableCell>
                    <TableCell width="120px">Total</TableCell>
                    <TableCell width="50px"></TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {fields.map((field, index) => (
                    <TableRow key={field.id}>
                      <TableCell>
                        <Autocomplete
                          options={products}
                          getOptionLabel={(option) => option.name || ''}
                          onChange={(_, value) => handleProductSelect(index, value)}
                          renderInput={(params) => (
                            <TextField {...params} size="small" placeholder="Select product" />
                          )}
                          size="small"
                          sx={{ minWidth: 150 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Controller
                          name={`items.${index}.description`}
                          control={control}
                          render={({ field }) => (
                            <TextField
                              {...field}
                              size="small"
                              fullWidth
                              error={!!errors.items?.[index]?.description}
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
                        <Controller
                          name={`items.${index}.taxPercent`}
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
