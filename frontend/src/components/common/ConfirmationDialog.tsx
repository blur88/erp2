import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  useTheme
} from '@mui/material'
import { default as WarningIcon } from '@mui/icons-material/Warning'
import { default as ErrorIcon } from '@mui/icons-material/Error'
import { default as InfoIcon } from '@mui/icons-material/Info'
import { AppButton } from '@/components/common/AppButton'

interface ConfirmationDialogProps {
  open: boolean
  title: string
  message: string
  confirmText?: string
  cancelText?: string
  onConfirm: () => void
  onCancel: () => void
  severity?: 'warning' | 'error' | 'info'
  loading?: boolean
}

const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  open,
  title,
  message,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  severity = 'warning',
  loading = false
}) => {
  const theme = useTheme()

  const getSeverityIcon = () => {
    switch (severity) {
      case 'error':
        return <ErrorIcon sx={{ color: theme.palette.error.main, fontSize: 32 }} />
      case 'info':
        return <InfoIcon sx={{ color: theme.palette.info.main, fontSize: 32 }} />
      default:
        return <WarningIcon sx={{ color: theme.palette.warning.main, fontSize: 32 }} />
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      maxWidth="sm"
      fullWidth
      slotProps={{
        paper: {
          sx: {
            borderRadius: 2,
            p: 1
          }
        }
      }}
    >
      <DialogTitle>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 2
          }}>
          {getSeverityIcon()}
          <Typography variant="h6" component="div">
            {title}
          </Typography>
        </Box>
      </DialogTitle>
      <DialogContent>
        <Typography variant="body1" sx={{
          color: "text.secondary"
        }}>
          {message}
        </Typography>
      </DialogContent>
      <DialogActions sx={{ p: 3, pt: 1 }}>
        <AppButton
          variant="secondary"
          onClick={onCancel}
          disabled={loading}
        >
          {cancelText}
        </AppButton>
        <AppButton
          variant={severity === 'error' ? 'danger' : severity}
          onClick={onConfirm}
          disabled={loading}
          loading={loading}
        >
          {confirmText}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
}

export default ConfirmationDialog
