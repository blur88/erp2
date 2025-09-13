import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Box,
  Typography,
  Alert,
  Autocomplete,
  Chip,
  InputAdornment,
  Divider,
} from '@mui/material'
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers'
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { inventoryApi } from '@/services/inventoryApi'
import { Product, StockAdjustment, StockAdjustmentType } from '@/types'
import { formatCurrency } from '@/utils/currency'

interface StockAdjustmentDialogProps {
  open: boolean
  onClose: () => void
  adjustment?: StockAdjustment | null
  onSuccess: () => void
}

interface FormData {
  productId: string
  type: StockAdjustmentType
  systemQuantity: number
  actualQuantity: number
  adjustmentQuantity: number
  reason: string
  notes?: string
  unitCost?: number
  locationCode?: string
  binLocation?: string
  batchNumber?: string
  expiryDate?: Date | null
}

const schema = yup.object({
  productId: yup.string().required('Product is required'),
  type: yup.string().required('Adjustment type is required'),
  systemQuantity: yup.number().required('System quantity is required').min(0, 'Must be non-negative'),
  actualQuantity: yup.number().required('Actual quantity is required').min(0, 'Must be non-negative'),
  adjustmentQuantity: yup.number().required('Adjustment quantity is required'),
  reason: yup.string().required('Reason is required').min(5, 'Reason must be at least 5 characters'),
  notes: yup.string().optional(),
  unitCost: yup.number().optional().min(0, 'Unit cost must be non-negative'),
  locationCode: yup.string().optional(),
  binLocation: yup.string().optional(),
  batchNumber: yup.string().optional(),
  expiryDate: yup.date().optional().nullable(),
})

const StockAdjustmentDialog: React.FC<StockAdjustmentDialogProps> = ({
  open,
  onClose,
  adjustment,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [products, setProducts] = useState<Product[]>([])
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [productsLoading, setProductsLoading] = useState(false)

  const isEditMode = !!adjustment

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      productId: '',
      type: StockAdjustmentType.COUNT,
      systemQuantity: 0,
      actualQuantity: 0,
      adjustmentQuantity: 0,
      reason: '',
      notes: '',
      unitCost: 0,
      locationCode: 'MAIN',
      binLocation: '',
      batchNumber: '',
      expiryDate: null,
    },
  })

  const watchedSystemQty = watch('systemQuantity')
  const watchedActualQty = watch('actualQuantity')
  const watchedUnitCost = watch('unitCost')
  const watchedAdjustmentQty = watch('adjustmentQuantity')

  // Calculate adjustment quantity automatically
  useEffect(() => {
    const adjustmentQty = watchedActualQty - watchedSystemQty
    setValue('adjustmentQuantity', adjustmentQty)
  }, [watchedSystemQty, watchedActualQty, setValue])

  // Load products for autocomplete
  useEffect(() => {
    const loadProducts = async () => {
      try {
        setProductsLoading(true)
        const response = await inventoryApi.getProducts({ limit: 100, isActive: true })
        if (response?.data?.data) {
          setProducts(response.data.data)
        }
      } catch (err) {
        console.error('Failed to load products:', err)
      } finally {
        setProductsLoading(false)
      }
    }

    if (open && !isEditMode) {
      loadProducts()
    }
  }, [open, isEditMode])

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      if (adjustment) {
        // Edit mode - populate with existing data
        reset({
          productId: adjustment.productId,
          type: adjustment.type,
          systemQuantity: adjustment.systemQuantity,
          actualQuantity: adjustment.actualQuantity,
          adjustmentQuantity: adjustment.adjustmentQuantity,
          reason: adjustment.reason,
          notes: adjustment.notes || '',
          unitCost: adjustment.unitCost || 0,
          locationCode: adjustment.locationCode || 'MAIN',
          binLocation: adjustment.binLocation || '',
          batchNumber: adjustment.batchNumber || '',
          expiryDate: adjustment.expiryDate ? new Date(adjustment.expiryDate) : null,
        })
        setSelectedProduct(adjustment.product || null)
      } else {
        // Create mode - reset to defaults
        reset({
          productId: '',
          type: StockAdjustmentType.COUNT,
          systemQuantity: 0,
          actualQuantity: 0,
          adjustmentQuantity: 0,
          reason: '',
          notes: '',
          unitCost: 0,
          locationCode: 'MAIN',
          binLocation: '',
          batchNumber: '',
          expiryDate: null,
        })
        setSelectedProduct(null)
      }
      setError(null)
    }
  }, [open, adjustment, reset])

  // Handle product selection
  const handleProductChange = (product: Product | null) => {
    setSelectedProduct(product)
    if (product) {
      setValue('productId', product.id)
      setValue('systemQuantity', product.stockQuantity || 0)
      setValue('unitCost', product.baseCost || 0)
    } else {
      setValue('productId', '')
      setValue('systemQuantity', 0)
      setValue('unitCost', 0)
    }
  }

  const onSubmit = async (data: FormData) => {
    try {
      setLoading(true)
      setError(null)

      if (isEditMode) {
        await inventoryApi.updateStockAdjustment(adjustment!.id, {
          type: data.type,
          adjustmentQuantity: data.adjustmentQuantity,
          actualQuantity: data.actualQuantity,
          reason: data.reason,
          notes: data.notes,
          unitCost: data.unitCost,
          locationCode: data.locationCode,
          binLocation: data.binLocation,
          batchNumber: data.batchNumber,
          expiryDate: data.expiryDate || undefined,
        })
      } else {
        await inventoryApi.createStockAdjustmentAdvanced({
          productId: data.productId,
          type: data.type,
          adjustmentQuantity: data.adjustmentQuantity,
          systemQuantity: data.systemQuantity,
          actualQuantity: data.actualQuantity,
          reason: data.reason,
          notes: data.notes,
          unitCost: data.unitCost,
          locationCode: data.locationCode,
          binLocation: data.binLocation,
          batchNumber: data.batchNumber,
          expiryDate: data.expiryDate || undefined,
        })
      }

      onSuccess()
    } catch (err: any) {
      console.error('Error saving stock adjustment:', err)
      setError(err?.response?.data?.message || err?.message || 'Failed to save stock adjustment')
    } finally {
      setLoading(false)
    }
  }

  const totalCost = (watchedAdjustmentQty || 0) * (watchedUnitCost || 0)

  const adjustmentTypeOptions = [
    { value: StockAdjustmentType.INCREASE, label: 'Increase', icon: '↗️' },
    { value: StockAdjustmentType.DECREASE, label: 'Decrease', icon: '↘️' },
    { value: StockAdjustmentType.COUNT, label: 'Physical Count', icon: '📊' },
    { value: StockAdjustmentType.TRANSFER, label: 'Transfer', icon: '↔️' },
    { value: StockAdjustmentType.DAMAGE, label: 'Damage', icon: '💥' },
    { value: StockAdjustmentType.THEFT, label: 'Theft', icon: '🔒' },
    { value: StockAdjustmentType.EXPIRY, label: 'Expiry', icon: '⏰' },
    { value: StockAdjustmentType.RETURN, label: 'Return', icon: '↩️' },
    { value: StockAdjustmentType.OTHER, label: 'Other', icon: '📝' },
  ]

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns}>
      <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
        <DialogTitle>
          {isEditMode ? 'Edit Stock Adjustment' : 'Create Stock Adjustment'}
        </DialogTitle>
        
        <DialogContent dividers>
          {error && (
            <Alert severity="error" sx={{ mb: 3 }}>
              {error}
            </Alert>
          )}

          <Box component="form" sx={{ mt: 2 }}>
            <Grid container spacing={3}>
              {/* Product Selection */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom>
                  Product Information
                </Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="productId"
                  control={control}
                  render={({ field }) => (
                    <Autocomplete
                      {...field}
                      options={products}
                      value={selectedProduct}
                      onChange={(_, value) => handleProductChange(value)}
                      getOptionLabel={(option) => `${option.name} (${option.barcode})`}
                      loading={productsLoading}
                      disabled={isEditMode || loading}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Product"
                          error={!!errors.productId}
                          helperText={errors.productId?.message}
                          fullWidth
                        />
                      )}
                      renderOption={(props, option) => (
                        <Box component="li" {...props}>
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>
                              {option.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              SKU: {option.barcode} • Stock: {option.stockQuantity || 0}
                            </Typography>
                          </Box>
                        </Box>
                      )}
                    />
                  )}
                />
              </Grid>

              {/* Adjustment Details */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                  Adjustment Details
                </Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <FormControl fullWidth error={!!errors.type}>
                      <InputLabel>Adjustment Type</InputLabel>
                      <Select {...field} label="Adjustment Type" disabled={loading}>
                        {adjustmentTypeOptions.map((option) => (
                          <MenuItem key={option.value} value={option.value}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <span>{option.icon}</span>
                              {option.label}
                            </Box>
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="locationCode"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Location"
                      fullWidth
                      disabled={loading}
                      placeholder="e.g., MAIN, WAREHOUSE1"
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <Controller
                  name="systemQuantity"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="System Quantity"
                      type="number"
                      fullWidth
                      error={!!errors.systemQuantity}
                      helperText={errors.systemQuantity?.message}
                      disabled={loading}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <Controller
                  name="actualQuantity"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Actual Quantity"
                      type="number"
                      fullWidth
                      error={!!errors.actualQuantity}
                      helperText={errors.actualQuantity?.message}
                      disabled={loading}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={4}>
                <Controller
                  name="adjustmentQuantity"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Adjustment"
                      type="number"
                      fullWidth
                      error={!!errors.adjustmentQuantity}
                      helperText={errors.adjustmentQuantity?.message}
                      disabled={true} // Auto-calculated
                      InputProps={{
                        readOnly: true,
                        style: {
                          color: watchedAdjustmentQty > 0 ? '#2e7d32' : watchedAdjustmentQty < 0 ? '#d32f2f' : 'inherit',
                          fontWeight: 600,
                        },
                      }}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="unitCost"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Unit Cost"
                      type="number"
                      fullWidth
                      error={!!errors.unitCost}
                      helperText={errors.unitCost?.message}
                      disabled={loading}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">$</InputAdornment>,
                      }}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <TextField
                  label="Total Impact"
                  value={formatCurrency(Math.abs(totalCost))}
                  fullWidth
                  disabled
                  InputProps={{
                    readOnly: true,
                    style: {
                      color: totalCost > 0 ? '#2e7d32' : totalCost < 0 ? '#d32f2f' : 'inherit',
                      fontWeight: 600,
                    },
                  }}
                  helperText={`${totalCost >= 0 ? 'Increase' : 'Decrease'} in inventory value`}
                />
              </Grid>

              {/* Additional Information */}
              <Grid item xs={12}>
                <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                  Additional Information
                </Typography>
                <Divider sx={{ mb: 2 }} />
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="reason"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Reason"
                      fullWidth
                      multiline
                      rows={2}
                      error={!!errors.reason}
                      helperText={errors.reason?.message}
                      disabled={loading}
                      placeholder="Explain why this adjustment is needed..."
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="binLocation"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Bin/Shelf Location"
                      fullWidth
                      disabled={loading}
                      placeholder="e.g., A1-B2, Shelf 3"
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="batchNumber"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Batch/Lot Number"
                      fullWidth
                      disabled={loading}
                      placeholder="e.g., LOT001, BATCH2024"
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                <Controller
                  name="expiryDate"
                  control={control}
                  render={({ field }) => (
                    <DatePicker
                      {...field}
                      label="Expiry Date"
                      disabled={loading}
                      slotProps={{
                        textField: {
                          fullWidth: true,
                          error: !!errors.expiryDate,
                          helperText: errors.expiryDate?.message,
                        },
                      }}
                    />
                  )}
                />
              </Grid>

              <Grid item xs={12} sm={6}>
                {/* Spacer for layout */}
              </Grid>

              <Grid item xs={12}>
                <Controller
                  name="notes"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label="Additional Notes"
                      fullWidth
                      multiline
                      rows={3}
                      disabled={loading}
                      placeholder="Any additional information or comments..."
                    />
                  )}
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit(onSubmit)}
            variant="contained"
            disabled={loading}
          >
            {loading ? 'Saving...' : isEditMode ? 'Update Adjustment' : 'Create Adjustment'}
          </Button>
        </DialogActions>
      </Dialog>
    </LocalizationProvider>
  )
}

export default StockAdjustmentDialog