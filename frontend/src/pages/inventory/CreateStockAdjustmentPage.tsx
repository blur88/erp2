import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Typography,
  Paper,
  Button,
  TextField,
  Grid,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Autocomplete,
  Card,
  CardContent,
  IconButton,
  useTheme,
  useMediaQuery,
} from '@mui/material'
import {
  ArrowBack as ArrowBackIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  Save as SaveIcon,
  Cancel as CancelIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material'
import { useDispatch, useSelector } from 'react-redux'
import { useNotification } from '@/hooks/useNotification'
import { ApiService } from '@/services/api'
import type { Product } from '@/types'
import { StockMovementType } from '@/types'
import { TYPOGRAPHY_STYLES } from '@/constants/typography'
import {
  fetchProducts,
  selectProducts,
  selectInventoryLoading,
} from '@/store/slices/inventorySlice'

interface AdjustmentFormData {
  productId: string
  adjustmentType: 'increase' | 'decrease'
  quantity: number
  reason: string
  notes: string
}

const CreateStockAdjustmentPage: React.FC = () => {
  const dispatch = useDispatch() as any
  const navigate = useNavigate()
  const { showSuccess, showError } = useNotification()
  const theme = useTheme()
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const products = useSelector(selectProducts) || []
  const loading = useSelector(selectInventoryLoading)

  // Form state
  const [formData, setFormData] = useState<AdjustmentFormData>({
    productId: '',
    adjustmentType: 'increase',
    quantity: 0,
    reason: '',
    notes: '',
  })
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Fetch products on mount
  useEffect(() => {
    dispatch(fetchProducts({ page: 1, limit: 100 }))
  }, [dispatch])

  const handleProductChange = (_: any, value: Product | null) => {
    setSelectedProduct(value)
    setFormData((prev) => ({
      ...prev,
      productId: value?.id || '',
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.productId) {
      showError('Please select a product')
      return
    }

    if (formData.quantity <= 0) {
      showError('Quantity must be greater than 0')
      return
    }

    if (!formData.reason.trim()) {
      showError('Please provide a reason for the adjustment')
      return
    }

    try {
      setSubmitting(true)

      const movementType =
        formData.adjustmentType === 'increase'
          ? StockMovementType.ADJUSTMENT_INCREASE
          : StockMovementType.ADJUSTMENT_DECREASE

      const quantity =
        formData.adjustmentType === 'increase'
          ? formData.quantity
          : -Math.abs(formData.quantity)

      await ApiService.post('/inventory/stock/movements', {
        productId: formData.productId,
        movementType,
        quantity,
        reason: formData.reason,
        notes: formData.notes || undefined,
      })

      showSuccess('Stock adjustment recorded successfully')
      navigate('/inventory/stock-adjustments')
    } catch (error: any) {
      console.error('Failed to create stock adjustment:', error)
      showError(error?.message || 'Failed to record stock adjustment')
    } finally {
      setSubmitting(false)
    }
  }

  const handleCancel = () => {
    navigate('/inventory/stock-adjustments')
  }

  const currentStock = selectedProduct?.stockQuantity || 0
  const newStock =
    formData.adjustmentType === 'increase'
      ? currentStock + formData.quantity
      : currentStock - formData.quantity

  return (
    <Box>
      {/* Header */}
      <Box
        sx={{
          display: 'flex',
          flexDirection: isMobile ? 'column' : 'row',
          justifyContent: 'space-between',
          alignItems: isMobile ? 'stretch' : 'center',
          mb: 4,
          gap: isMobile ? 2 : 0,
        }}
      >
        <Box sx={{ mb: isMobile ? 2 : 0 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 1 }}>
            <IconButton
              onClick={handleCancel}
              sx={{
                bgcolor: 'background.paper',
                '&:hover': { bgcolor: 'action.hover' },
              }}
            >
              <ArrowBackIcon />
            </IconButton>
            <Typography
              variant={
                isMobile
                  ? TYPOGRAPHY_STYLES.pageHeader.mobileVariant
                  : TYPOGRAPHY_STYLES.pageHeader.variant
              }
              sx={{
                fontWeight: TYPOGRAPHY_STYLES.pageHeader.fontWeight,
                display: 'flex',
                alignItems: 'center',
                gap: 2,
              }}
            >
              <AssessmentIcon
                sx={{
                  fontSize: TYPOGRAPHY_STYLES.pageHeader.icon.fontSize,
                  color: TYPOGRAPHY_STYLES.pageHeader.icon.color,
                }}
              />
              New Stock Adjustment
            </Typography>
          </Box>
          <Typography
            variant={TYPOGRAPHY_STYLES.pageSubtitle.variant}
            color={TYPOGRAPHY_STYLES.pageSubtitle.color}
          >
            Record a new stock adjustment
          </Typography>
        </Box>
      </Box>

      {/* Adjustment Form */}
      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            {/* Product Selection */}
            <Grid item xs={12} md={6}>
              <Autocomplete
                value={selectedProduct}
                onChange={handleProductChange}
                options={products}
                getOptionLabel={(option) =>
                  `${option.name} (Stock: ${option.stockQuantity || 0})`
                }
                loading={loading.products}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Product"
                    required
                    InputProps={{
                      ...params.InputProps,
                      endAdornment: (
                        <>
                          {loading.products ? (
                            <CircularProgress color="inherit" size={20} />
                          ) : null}
                          {params.InputProps.endAdornment}
                        </>
                      ),
                    }}
                  />
                )}
              />
            </Grid>

            {/* Adjustment Type */}
            <Grid item xs={12} md={3}>
              <FormControl fullWidth required>
                <InputLabel>Adjustment Type</InputLabel>
                <Select
                  value={formData.adjustmentType}
                  label="Adjustment Type"
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      adjustmentType: e.target.value as 'increase' | 'decrease',
                    }))
                  }
                >
                  <MenuItem value="increase">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TrendingUpIcon color="success" fontSize="small" />
                      Increase Stock
                    </Box>
                  </MenuItem>
                  <MenuItem value="decrease">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <TrendingDownIcon color="error" fontSize="small" />
                      Decrease Stock
                    </Box>
                  </MenuItem>
                </Select>
              </FormControl>
            </Grid>

            {/* Quantity */}
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                required
                type="number"
                label="Quantity"
                value={formData.quantity || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    quantity: parseFloat(e.target.value) || 0,
                  }))
                }
                inputProps={{ min: 0, step: 1 }}
              />
            </Grid>

            {/* Stock Summary Card */}
            {selectedProduct && formData.quantity > 0 && (
              <Grid item xs={12}>
                <Card
                  sx={{
                    bgcolor: (theme) =>
                      theme.palette.mode === 'dark'
                        ? formData.adjustmentType === 'increase'
                          ? 'rgba(46, 125, 50, 0.15)'
                          : 'rgba(211, 47, 47, 0.15)'
                        : formData.adjustmentType === 'increase'
                        ? 'success.light'
                        : 'error.light',
                    border: 1,
                    borderColor:
                      formData.adjustmentType === 'increase'
                        ? 'success.main'
                        : 'error.main',
                  }}
                >
                  <CardContent sx={{ py: 2 }}>
                    <Grid container spacing={2} alignItems="center">
                      <Grid item xs={12} md={4}>
                        <Typography variant="caption" color="text.secondary">
                          Current Stock
                        </Typography>
                        <Typography variant="h5" sx={{ fontWeight: 600, color: 'text.primary' }}>
                          {currentStock}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <Typography variant="caption" color="text.secondary">
                          Adjustment
                        </Typography>
                        <Typography
                          variant="h5"
                          sx={{
                            fontWeight: 600,
                            color:
                              formData.adjustmentType === 'increase'
                                ? 'success.main'
                                : 'error.main',
                          }}
                        >
                          {formData.adjustmentType === 'increase' ? '+' : '-'}
                          {formData.quantity}
                        </Typography>
                      </Grid>
                      <Grid item xs={12} md={4}>
                        <Typography variant="caption" color="text.secondary">
                          New Stock Level
                        </Typography>
                        <Typography
                          variant="h5"
                          sx={{
                            fontWeight: 600,
                            color: newStock < 0 ? 'error.main' : 'text.primary',
                          }}
                        >
                          {newStock}
                          {newStock < 0 && (
                            <Typography
                              component="span"
                              variant="caption"
                              color="error"
                              sx={{ ml: 1 }}
                            >
                              (Negative stock!)
                            </Typography>
                          )}
                        </Typography>
                      </Grid>
                    </Grid>
                  </CardContent>
                </Card>
              </Grid>
            )}

            {/* Reason */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                required
                multiline
                rows={2}
                label="Reason for Adjustment"
                value={formData.reason}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, reason: e.target.value }))
                }
                placeholder="e.g., Physical count variance, Damaged goods, Theft/loss, etc."
              />
            </Grid>

            {/* Notes */}
            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={2}
                label="Additional Notes (Optional)"
                value={formData.notes}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Any additional information about this adjustment"
              />
            </Grid>

            {/* Action Buttons */}
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                <Button
                  variant="outlined"
                  startIcon={<CancelIcon />}
                  onClick={handleCancel}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="contained"
                  startIcon={<SaveIcon />}
                  disabled={submitting || !formData.productId || formData.quantity <= 0}
                >
                  {submitting ? 'Recording...' : 'Record Adjustment'}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </form>
      </Paper>
    </Box>
  )
}

export default CreateStockAdjustmentPage
