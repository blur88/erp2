import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Alert,
  Stack,
} from '@mui/material'
import {
  Warning as WarningIcon,
  Inventory as InventoryIcon,
  Edit as EditIcon,
  Payment as PaymentIcon,
} from '@mui/icons-material'

interface BlockedSalesOrderDialogProps {
  open: boolean
  orderNumber: string
  isFulfilled: boolean
  isPaid: boolean
  paidAmount?: number
  actionType: 'edit' | 'delete'
  onClose: () => void
  onUnfulfillAndEdit: () => void
  onUnfulfillOnly: () => void
  onUnpayAndEdit: () => void
  onUnpayOnly: () => void
  onUnfulfillAndDelete?: () => void
  onUnpayAndDelete?: () => void
  loading?: boolean
}

const BlockedSalesOrderDialog: React.FC<BlockedSalesOrderDialogProps> = ({
  open,
  orderNumber,
  isFulfilled,
  isPaid,
  paidAmount = 0,
  actionType,
  onClose,
  onUnfulfillAndEdit,
  onUnfulfillOnly,
  onUnpayAndEdit,
  onUnpayOnly,
  onUnfulfillAndDelete,
  onUnpayAndDelete,
  loading = false
}) => {
  // Determine blocking reasons
  const blockingReasons = []
  if (isFulfilled) blockingReasons.push('fulfilled')
  if (isPaid) blockingReasons.push('paid')

  const actionVerb = actionType === 'edit' ? 'edit' : 'delete'
  const actionVerbCap = actionType === 'edit' ? 'Edit' : 'Delete'

  const title = blockingReasons.length === 2
    ? 'Order Already Fulfilled & Paid'
    : isFulfilled
    ? 'Order Already Fulfilled'
    : 'Order Already Paid'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderRadius: 2,
        }
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <WarningIcon color="warning" sx={{ fontSize: 28 }} />
          <Box>
            <Typography variant="h6" component="div">
              {title}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Order No {orderNumber}
            </Typography>
          </Box>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3}>
          {/* Warning message */}
          <Alert severity="warning" sx={{ borderRadius: 1.5 }}>
            <Typography variant="body2">
              {blockingReasons.length === 2 ? (
                <>This order has been fulfilled and has a payment of <strong>${paidAmount.toFixed(2)}</strong>. To {actionVerb} the order, you must first unpay it, then unfulfill the order.</>
              ) : isFulfilled ? (
                <>This order has already been fulfilled. To {actionVerb} the order, you must unfulfill it first. This action will restore the inventory quantities.</>
              ) : (
                <>This order has a payment of <strong>${paidAmount.toFixed(2)}</strong>. To {actionVerb} the order, you must unpay it first. This will remove the payment record.</>
              )}
            </Typography>
          </Alert>

          {/* Instructions box - show both sections if both conditions exist */}
          <Box sx={{
            p: 2.5,
            bgcolor: 'grey.50',
            borderRadius: 1.5,
            border: '1px solid',
            borderColor: 'grey.200'
          }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              {blockingReasons.length === 2 ? 'What happens when you unpay/unfulfill:' : isFulfilled ? 'What happens when you unfulfill:' : 'What happens when you unpay:'}
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 1.5 }}>
              {isPaid && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PaymentIcon sx={{ fontSize: 16, color: 'error.main' }} />
                  <Typography variant="body2">
                    Payment record will be removed
                  </Typography>
                </Box>
              )}
              {isFulfilled && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <InventoryIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                    <Typography variant="body2">
                      Inventory quantities will be restored
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <EditIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                    <Typography variant="body2">
                      Order will become editable again
                    </Typography>
                  </Box>
                </>
              )}
              {!isFulfilled && isPaid && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EditIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                  <Typography variant="body2">
                    Order will become {actionType === 'edit' ? 'editable' : 'deletable'} again
                  </Typography>
                </Box>
              )}
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button
          onClick={onClose}
          disabled={loading}
          sx={{ minWidth: 80 }}
        >
          Cancel
        </Button>

        {/* Show appropriate action buttons based on status */}
        {blockingReasons.length === 2 ? (
          // Both fulfilled and paid - unpay & unfulfill together
          (<>
            <Button
              onClick={onUnpayOnly}
              variant="outlined"
              color="error"
              disabled={loading}
              sx={{ minWidth: 140 }}
            >
              Unpay Only
            </Button>
            <Button
              onClick={actionType === 'edit' ? onUnpayAndEdit : onUnpayAndDelete}
              variant="contained"
              color="error"
              disabled={loading}
              sx={{ minWidth: 200 }}
            >
              Unpay, Unfulfill & {actionVerbCap}
            </Button>
          </>)
        ) : isFulfilled ? (
          // Only fulfilled
          (<>
            <Button
              onClick={onUnfulfillOnly}
              variant="outlined"
              color="warning"
              disabled={loading}
              sx={{ minWidth: 120 }}
            >
              Unfulfill Only
            </Button>
            <Button
              onClick={actionType === 'edit' ? onUnfulfillAndEdit : onUnfulfillAndDelete}
              variant="contained"
              color="warning"
              disabled={loading}
              sx={{ minWidth: 160 }}
            >
              Unfulfill & {actionVerbCap}
            </Button>
          </>)
        ) : (
          // Only paid
          (<>
            <Button
              onClick={onUnpayOnly}
              variant="outlined"
              color="error"
              disabled={loading}
              sx={{ minWidth: 100 }}
            >
              Unpay Only
            </Button>
            <Button
              onClick={actionType === 'edit' ? onUnpayAndEdit : onUnpayAndDelete}
              variant="contained"
              color="error"
              disabled={loading}
              sx={{ minWidth: 140 }}
            >
              Unpay & {actionVerbCap}
            </Button>
          </>)
        )}
      </DialogActions>
    </Dialog>
  );
}

export default BlockedSalesOrderDialog
