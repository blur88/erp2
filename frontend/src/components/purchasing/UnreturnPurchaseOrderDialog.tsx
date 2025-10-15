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
} from '@mui/icons-material'

interface UnreturnPurchaseOrderDialogProps {
  open: boolean
  orderNumber: string
  onClose: () => void
  onReturnAndEdit: () => void
  onReturnOnly: () => void
  loading?: boolean
}

const UnreturnPurchaseOrderDialog: React.FC<UnreturnPurchaseOrderDialogProps> = ({
  open,
  orderNumber,
  onClose,
  onReturnAndEdit,
  onReturnOnly,
  loading = false
}) => {
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
              Purchase Order Already Received
            </Typography>
            <Typography variant="body2" color="text.secondary">
              PO No {orderNumber}
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3}>
          <Alert severity="warning" sx={{ borderRadius: 1.5 }}>
            <Typography variant="body2">
              This purchase order has already been received. To edit the order, you must return it first.
              This action will revert the inventory quantities.
            </Typography>
          </Alert>

          <Box sx={{
            p: 2.5,
            bgcolor: 'grey.50',
            borderRadius: 1.5,
            border: '1px solid',
            borderColor: 'grey.200'
          }}>
            <Typography variant="body2" color="text.secondary" gutterBottom>
              What happens when you return:
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 1.5 }}>
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
          onClick={onReturnAndEdit}
          variant="contained"
          color="warning"
          disabled={loading}
          sx={{ minWidth: 140 }}
        >
          Return & Edit
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default UnreturnPurchaseOrderDialog
