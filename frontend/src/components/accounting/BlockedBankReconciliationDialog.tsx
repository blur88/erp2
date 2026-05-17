import React from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Typography,
} from '@mui/material'
import WarningIcon from '@mui/icons-material/Warning'
import LockOpenIcon from '@mui/icons-material/LockOpen'

interface BlockedBankReconciliationDialogProps {
  open: boolean
  onClose: () => void
  onReopenOnly: () => void
  onReopenAndDelete: () => void
  loading?: boolean
}

const BlockedBankReconciliationDialog: React.FC<BlockedBankReconciliationDialogProps> = ({
  open,
  onClose,
  onReopenOnly,
  onReopenAndDelete,
  loading = false,
}) => {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      slotProps={{ paper: { sx: { borderRadius: 2 } } }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <WarningIcon color="warning" sx={{ fontSize: 28 }} />
          <Typography variant="h6" component="div">
            Reconciliation Already Completed
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={3}>
          <Alert severity="warning" sx={{ borderRadius: 1.5 }}>
            <Typography variant="body2">
              This reconciliation is completed and must be reopened before it can be deleted.
            </Typography>
          </Alert>
          <Box
            sx={{
              p: 2.5,
              bgcolor: 'grey.50',
              borderRadius: 1.5,
              border: '1px solid',
              borderColor: 'grey.200',
            }}
          >
            <Typography variant="body2" gutterBottom sx={{ color: 'text.secondary' }}>
              What happens when you reopen:
            </Typography>
            <Stack spacing={0.5} sx={{ mt: 1.5 }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <LockOpenIcon sx={{ fontSize: 16, color: 'primary.main' }} />
                <Typography variant="body2">
                  Reconciliation returns to In Progress status
                </Typography>
              </Box>
            </Stack>
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
        <Button onClick={onClose} disabled={loading} sx={{ minWidth: 80 }}>
          Cancel
        </Button>
        <Button
          onClick={onReopenOnly}
          variant="outlined"
          color="warning"
          disabled={loading}
          sx={{ minWidth: 130 }}
        >
          Reopen Only
        </Button>
        <Button
          onClick={onReopenAndDelete}
          variant="contained"
          color="error"
          disabled={loading}
          sx={{ minWidth: 160 }}
        >
          Reopen &amp; Delete
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default BlockedBankReconciliationDialog
