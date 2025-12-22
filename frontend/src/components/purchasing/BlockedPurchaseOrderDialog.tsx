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

interface BlockedPurchaseOrderDialogProps {
  open: boolean
  orderNumber: string
  isReceived: boolean
  isPaid: boolean
  actionType: 'edit' | 'delete'
  onClose: () => void
  onReturnAndEdit: () => void
  onReturnOnly: () => void
  onUnpayAndEdit: () => void
  onUnpayOnly: () => void
  onReturnAndDelete?: () => void
  onUnpayAndDelete?: () => void
  loading?: boolean
}

const BlockedPurchaseOrderDialog: React.FC<BlockedPurchaseOrderDialogProps> = ({
  open,
  orderNumber,
  isReceived,
  isPaid,
  actionType,
  onClose,
  onReturnAndEdit,
  onReturnOnly,
  onUnpayAndEdit,
  onUnpayOnly,
  onReturnAndDelete,
  onUnpayAndDelete,
  loading = false
}) => {
  // Determine blocking reasons
  const blockingReasons = []
  if (isReceived) blockingReasons.push('received')
  if (isPaid) blockingReasons.push('paid')

  const actionVerb = actionType === 'edit' ? 'edit' : 'delete'
  const actionVerbCap = actionType === 'edit' ? 'Edit' : 'Delete'

  const title = blockingReasons.length === 2
    ? 'Purchase Order Already Received & Paid'
    : isReceived
    ? 'Purchase Order Already Received'
    : 'Purchase Order Already Paid'

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
              PO No {orderNumber}
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
                <>This purchase order has been received and paid. To {actionVerb} the order, you must first unpay it, then return the goods.</>
              ) : isReceived ? (
                <>This purchase order has already been received. To {actionVerb} the order, you must return it first. This action will revert the inventory quantities.</>
              ) : (
                <>This purchase order has been paid. To {actionVerb} the order, you must unpay it first. This will delete the vendor payment record.</>
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
              {blockingReasons.length === 2 ? 'What happens when you unpay/return:' : isReceived ? 'What happens when you return:' : 'What happens when you unpay:'}
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 1.5 }}>
              {isPaid && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <PaymentIcon sx={{ fontSize: 16, color: 'error.main' }} />
                  <Typography variant="body2">
                    Vendor payment record will be deleted
                  </Typography>
                </Box>
              )}
              {isReceived && (
                <>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <InventoryIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                    <Typography variant="body2">
                      Inventory quantities will be reverted
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <EditIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                    <Typography variant="body2">
                      Purchase order will become editable again
                    </Typography>
                  </Box>
                </>
              )}
              {!isReceived && isPaid && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <EditIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                  <Typography variant="body2">
                    Purchase order will become {actionType === 'edit' ? 'editable' : 'deletable'} again
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
          // Both received and paid - unpay & return together
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
              sx={{ minWidth: 180 }}
            >
              Unpay, Return & {actionVerbCap}
            </Button>
          </>)
        ) : isReceived ? (
          // Only received
          (<>
            <Button
              onClick={onReturnOnly}
              variant="outlined"
              color="warning"
              disabled={loading}
              sx={{ minWidth: 100 }}
            >
              Return Only
            </Button>
            <Button
              onClick={actionType === 'edit' ? onReturnAndEdit : onReturnAndDelete}
              variant="contained"
              color="warning"
              disabled={loading}
              sx={{ minWidth: 140 }}
            >
              Return & {actionVerbCap}
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

export default BlockedPurchaseOrderDialog
