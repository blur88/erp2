import React from 'react'
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  LinearProgress,
  Alert,
} from '@mui/material'
import {
  Timer as TimerIcon,
  Logout as LogoutIcon,
  TouchApp as TouchAppIcon,
} from '@mui/icons-material'

interface IdleWarningDialogProps {
  /** Whether the dialog is open */
  open: boolean

  /** Remaining seconds until auto-logout */
  remainingSeconds: number

  /** Total warning duration in seconds (for progress bar) */
  totalWarningSeconds?: number

  /** Callback when user clicks "Stay Logged In" */
  onStayLoggedIn: () => void

  /** Callback when user clicks "Logout Now" or auto-logout happens */
  onLogout: () => void
}

/**
 * Dialog shown when user has been idle for too long
 * Displays countdown and allows user to stay logged in or logout
 */
const IdleWarningDialog: React.FC<IdleWarningDialogProps> = ({
  open,
  remainingSeconds,
  totalWarningSeconds = 120, // Default 2 minutes
  onStayLoggedIn,
  onLogout,
}) => {
  // Calculate progress (0 to 100)
  const progress = ((totalWarningSeconds - remainingSeconds) / totalWarningSeconds) * 100

  // Format time as MM:SS
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  // Determine color based on remaining time
  const getColor = (): 'warning' | 'error' => {
    return remainingSeconds <= 30 ? 'error' : 'warning'
  }

  return (
    <Dialog
      open={open}
      onClose={onStayLoggedIn} // Allow closing by clicking outside
      maxWidth="sm"
      fullWidth
      PaperProps={{
        sx: {
          borderTop: 4,
          borderColor: `${getColor()}.main`,
        },
      }}
    >
      <DialogTitle>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <TimerIcon sx={{ fontSize: 32, color: `${getColor()}.main` }} />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
              Session Timeout Warning
            </Typography>
            <Typography variant="body2" color="text.secondary">
              You've been inactive for a while
            </Typography>
          </Box>
        </Box>
      </DialogTitle>

      <DialogContent>
        {/* Warning Alert */}
        <Alert severity={getColor()} sx={{ mb: 3 }}>
          <Typography variant="body2">
            You will be automatically logged out due to inactivity in:
          </Typography>
        </Alert>

        {/* Countdown Timer */}
        <Box
          sx={{
            textAlign: 'center',
            py: 3,
            bgcolor: 'grey.50',
            borderRadius: 2,
            mb: 2,
          }}
        >
          <Typography
            variant="h2"
            sx={{
              fontWeight: 700,
              color: `${getColor()}.main`,
            }}
          >
            {formatTime(remainingSeconds)}
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
            minutes remaining
          </Typography>
        </Box>

        {/* Progress Bar */}
        <Box sx={{ mb: 3 }}>
          <LinearProgress
            variant="determinate"
            value={progress}
            color={getColor()}
            sx={{ height: 8, borderRadius: 1 }}
          />
        </Box>

        {/* Instructions */}
        <Box
          sx={{
            p: 2,
            bgcolor: 'info.lighter',
            borderRadius: 1,
            border: 1,
            borderColor: 'info.light',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'start', gap: 1 }}>
            <TouchAppIcon sx={{ color: 'info.main', fontSize: 20, mt: 0.25 }} />
            <Box>
              <Typography variant="body2" sx={{ fontWeight: 600, mb: 0.5 }}>
                Want to keep working?
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Click "Stay Logged In" below to continue your session, or simply interact with
                the application (move your mouse, press any key).
              </Typography>
            </Box>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
        <Button
          onClick={onLogout}
          startIcon={<LogoutIcon />}
          color="inherit"
          variant="outlined"
          sx={{ flex: 1 }}
        >
          Logout Now
        </Button>
        <Button
          onClick={onStayLoggedIn}
          variant="contained"
          color="primary"
          autoFocus
          sx={{ flex: 1 }}
        >
          Stay Logged In
        </Button>
      </DialogActions>
    </Dialog>
  )
}

export default IdleWarningDialog
