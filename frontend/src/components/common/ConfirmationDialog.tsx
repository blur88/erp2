import React, { useEffect, useState } from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  Box,
  TextField,
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
  onConfirm: (reason?: string) => void
  onCancel: () => void
  severity?: 'warning' | 'error' | 'info'
  loading?: boolean
  requireReason?: boolean
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
  loading = false,
  requireReason = false,
}) => {
  const theme = useTheme()
  const [reason, setReason] = useState('')
  const trimmedReason = reason.trim()
  const validReason = trimmedReason.length >= 3 && trimmedReason.length <= 500

  useEffect(() => {
    if (!open) setReason('')
  }, [open])

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
        {requireReason && (
          <TextField
            autoFocus
            fullWidth
            required
            label="Reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            slotProps={{ htmlInput: { maxLength: 500 } }}
            sx={{ mt: 2 }}
          />
        )}
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
          onClick={() => onConfirm(requireReason ? trimmedReason : undefined)}
          disabled={loading || (requireReason && !validReason)}
          loading={loading}
        >
          {confirmText}
        </AppButton>
      </DialogActions>
    </Dialog>
  );
}

export default ConfirmationDialog
