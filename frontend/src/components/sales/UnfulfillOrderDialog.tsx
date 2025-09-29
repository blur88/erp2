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

interface UnfulfillOrderDialogProps {
  open: boolean
  orderNumber: string
  onClose: () => void
  onUnfulfillAndEdit: () => void
  onUnfulfillOnly: () => void
  loading?: boolean
}

const UnfulfillOrderDialog: React.FC<UnfulfillOrderDialogProps> = ({
  open,
  orderNumber,
  onClose,
  onUnfulfillAndEdit,
  onUnfulfillOnly,
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
              Order Already Fulfilled
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Order No {orderNumber}
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent>
        <Stack spacing={3}>
          <Alert severity="warning" sx={{ borderRadius: 1.5 }}>
            <Typography variant="body2">
              This order has already been fulfilled. To edit the order, you must unfulfill it first.
              This action will restore the inventory quantities.
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
              What happens when you unfulfill:
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 1.5 }}>
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
          onClick={onUnfulfillOnly}
          variant="outlined"
          color="warning"
          disabled={loading}
          sx={{ minWidth: 100 }}
        >
          Unfulfill Only
        </Button>
        <Button
          onClick={onUnfulfillAndEdit}
          variant="contained"
          color="warning"
          disabled={loading}
          sx={{ minWidth: 140 }}
        >
          Unfulfill & Edit
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default UnfulfillOrderDialog