import React, { useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Box,
  Typography,
  Alert,
  Grid,
  Chip,
  Divider,
  Card,
  CardContent,
  Avatar,
} from '@mui/material'
import {
  CheckCircle as ApproveIcon,
  Cancel as RejectIcon,
  Inventory as ProductIcon,
  TrendingUp as IncreaseIcon,
  TrendingDown as DecreaseIcon,
} from '@mui/icons-material'
import { useForm, Controller } from 'react-hook-form'
import { yupResolver } from '@hookform/resolvers/yup'
import * as yup from 'yup'
import { inventoryApi } from '@/services/inventoryApi'
import { StockAdjustment, StockAdjustmentType } from '@/types'
import { formatCurrency } from '@/utils/currency'

interface StockAdjustmentApprovalDialogProps {
  open: boolean
  onClose: () => void
  adjustment: StockAdjustment | null
  onSuccess: () => void
}

interface FormData {
  action: 'approve' | 'reject'
  reason?: string
  notes?: string
}

const schema = yup.object({
  action: yup.string().required('Action is required'),
  reason: yup.string().when('action', {
    is: 'reject',
    then: (schema) => schema.required('Reason is required for rejection').min(5, 'Reason must be at least 5 characters'),
    otherwise: (schema) => schema.optional(),
  }),
  notes: yup.string().optional(),
})

const StockAdjustmentApprovalDialog: React.FC<StockAdjustmentApprovalDialogProps> = ({
  open,
  onClose,
  adjustment,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedAction, setSelectedAction] = useState<'approve' | 'reject' | null>(null)

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: yupResolver(schema),
    defaultValues: {
      action: 'approve',
      reason: '',
      notes: '',
    },
  })

  const watchedAction = watch('action')

  React.useEffect(() => {
    if (open) {
      reset({
        action: 'approve',
        reason: '',
        notes: '',
      })
      setSelectedAction(null)
      setError(null)
    }
  }, [open, reset])

  const handleActionSelect = (action: 'approve' | 'reject') => {
    setSelectedAction(action)
  }

  const onSubmit = async (data: FormData) => {
    if (!adjustment || !selectedAction) return

    try {
      setLoading(true)
      setError(null)

      if (selectedAction === 'approve') {
        await inventoryApi.approveStockAdjustment(adjustment.id, {
          reason: data.reason,
          notes: data.notes,
        })
      } else {
        await inventoryApi.rejectStockAdjustment(adjustment.id, {
          reason: data.reason!,
          notes: data.notes,
        })
      }

      onSuccess()
    } catch (err: any) {
      console.error('Error processing approval:', err)
      setError(err?.response?.data?.message || err?.message || 'Failed to process approval')
    } finally {
      setLoading(false)
    }
  }

  const getTypeIcon = (type: StockAdjustmentType) => {
    switch (type) {
      case StockAdjustmentType.INCREASE: return '↗️'
      case StockAdjustmentType.DECREASE: return '↘️'
      case StockAdjustmentType.COUNT: return '📊'
      case StockAdjustmentType.TRANSFER: return '↔️'
      case StockAdjustmentType.DAMAGE: return '💥'
      case StockAdjustmentType.THEFT: return '🔒'
      case StockAdjustmentType.EXPIRY: return '⏰'
      case StockAdjustmentType.RETURN: return '↩️'
      default: return '📝'
    }
  }

  const formatAdjustmentType = (type: StockAdjustmentType) => {
    return type.charAt(0).toUpperCase() + type.slice(1).replace('_', ' ')
  }

  if (!adjustment) return null

  const adjustmentImpact = adjustment.adjustmentQuantity > 0 ? 'increase' : 'decrease'
  const totalImpact = (adjustment.adjustmentQuantity || 0) * (adjustment.unitCost || 0)

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: 'warning.main' }}>
            <ProductIcon />
          </Avatar>
          <Box>
            <Typography variant="h6">Stock Adjustment Approval</Typography>
            <Typography variant="body2" color="text.secondary">
              Review and approve or reject this adjustment request
            </Typography>
          </Box>
        </Box>
      </DialogTitle>
      
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 3 }}>
            {error}
          </Alert>
        )}

        {/* Adjustment Summary */}
        <Card sx={{ mb: 3, bgcolor: 'grey.50' }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Adjustment Summary
            </Typography>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Product
                  </Typography>
                  <Typography variant="body1" sx={{ fontWeight: 500 }}>
                    {adjustment.product?.name || 'Unknown Product'}
                  </Typography>
                  {adjustment.product?.barcode && (
                    <Typography variant="caption" color="text.secondary">
                      SKU: {adjustment.product.barcode}
                    </Typography>
                  )}
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Adjustment Type
                  </Typography>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <span>{getTypeIcon(adjustment.type)}</span>
                    <Typography variant="body1">
                      {formatAdjustmentType(adjustment.type)}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Location
                  </Typography>
                  <Typography variant="body1">
                    {adjustment.locationCode || 'MAIN'}
                    {adjustment.binLocation && ` - ${adjustment.binLocation}`}
                  </Typography>
                </Box>
              </Grid>

              <Grid item xs={12} md={6}>
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Quantities
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">System:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {adjustment.systemQuantity.toLocaleString()}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Actual:</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {adjustment.actualQuantity.toLocaleString()}
                    </Typography>
                  </Box>
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Adjustment:
                    </Typography>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontWeight: 600,
                        color: adjustment.adjustmentQuantity > 0 ? 'success.main' : 'error.main'
                      }}
                    >
                      {adjustment.adjustmentQuantity > 0 ? '+' : ''}{adjustment.adjustmentQuantity.toLocaleString()}
                    </Typography>
                  </Box>
                </Box>

                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Financial Impact
                  </Typography>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                    <Typography variant="body2">Unit Cost:</Typography>
                    <Typography variant="body2">
                      {adjustment.unitCost ? formatCurrency(adjustment.unitCost) : '-'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      Total Impact:
                    </Typography>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        fontWeight: 600,
                        color: totalImpact > 0 ? 'success.main' : totalImpact < 0 ? 'error.main' : 'inherit'
                      }}
                    >
                      {totalImpact ? formatCurrency(Math.abs(totalImpact)) : '-'}
                      {totalImpact !== 0 && (
                        <Typography component="span" variant="caption" sx={{ ml: 1 }}>
                          ({totalImpact > 0 ? 'increase' : 'decrease'})
                        </Typography>
                      )}
                    </Typography>
                  </Box>
                </Box>
              </Grid>

              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Box sx={{ mb: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Reason for Adjustment
                  </Typography>
                  <Typography variant="body1">
                    {adjustment.reason}
                  </Typography>
                </Box>

                {adjustment.notes && (
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      Additional Notes
                    </Typography>
                    <Typography variant="body1">
                      {adjustment.notes}
                    </Typography>
                  </Box>
                )}

                <Box>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    Created By
                  </Typography>
                  <Typography variant="body1">
                    {adjustment.createdBy} on {new Date(adjustment.createdAt).toLocaleString()}
                  </Typography>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Action Selection */}
        <Typography variant="h6" gutterBottom>
          Select Action
        </Typography>
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={6}>
            <Card 
              sx={{ 
                cursor: 'pointer', 
                border: selectedAction === 'approve' ? '2px solid' : '1px solid',
                borderColor: selectedAction === 'approve' ? 'success.main' : 'divider',
                bgcolor: selectedAction === 'approve' ? 'success.light' : 'background.paper',
                '&:hover': {
                  bgcolor: selectedAction === 'approve' ? 'success.light' : 'grey.50'
                }
              }}
              onClick={() => handleActionSelect('approve')}
            >
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <ApproveIcon 
                  sx={{ 
                    fontSize: 48, 
                    color: selectedAction === 'approve' ? 'success.main' : 'text.secondary',
                    mb: 1 
                  }} 
                />
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                  Approve
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Accept this adjustment and update stock levels
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6}>
            <Card 
              sx={{ 
                cursor: 'pointer', 
                border: selectedAction === 'reject' ? '2px solid' : '1px solid',
                borderColor: selectedAction === 'reject' ? 'error.main' : 'divider',
                bgcolor: selectedAction === 'reject' ? 'error.light' : 'background.paper',
                '&:hover': {
                  bgcolor: selectedAction === 'reject' ? 'error.light' : 'grey.50'
                }
              }}
              onClick={() => handleActionSelect('reject')}
            >
              <CardContent sx={{ textAlign: 'center', py: 3 }}>
                <RejectIcon 
                  sx={{ 
                    fontSize: 48, 
                    color: selectedAction === 'reject' ? 'error.main' : 'text.secondary',
                    mb: 1 
                  }} 
                />
                <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
                  Reject
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Decline this adjustment without any changes
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Action Form */}
        {selectedAction && (
          <Box component="form" sx={{ mt: 3 }}>
            <Typography variant="h6" gutterBottom>
              {selectedAction === 'approve' ? 'Approval' : 'Rejection'} Details
            </Typography>

            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Controller
                  name="reason"
                  control={control}
                  render={({ field }) => (
                    <TextField
                      {...field}
                      label={selectedAction === 'approve' ? 'Approval Notes (Optional)' : 'Reason for Rejection *'}
                      fullWidth
                      multiline
                      rows={3}
                      error={!!errors.reason}
                      helperText={errors.reason?.message}
                      disabled={loading}
                      placeholder={
                        selectedAction === 'approve' 
                          ? 'Add any notes about this approval...'
                          : 'Explain why this adjustment is being rejected...'
                      }
                    />
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
                      label="Additional Comments (Optional)"
                      fullWidth
                      multiline
                      rows={2}
                      disabled={loading}
                      placeholder="Any additional comments or instructions..."
                    />
                  )}
                />
              </Grid>
            </Grid>
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          onClick={handleSubmit(onSubmit)}
          variant="contained"
          disabled={loading || !selectedAction}
          color={selectedAction === 'approve' ? 'success' : 'error'}
          startIcon={selectedAction === 'approve' ? <ApproveIcon /> : <RejectIcon />}
        >
          {loading ? 'Processing...' : `${selectedAction === 'approve' ? 'Approve' : 'Reject'} Adjustment`}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default StockAdjustmentApprovalDialog