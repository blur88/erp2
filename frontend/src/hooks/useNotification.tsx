import React, { createContext, useContext, useCallback } from 'react'
import { Snackbar, Alert, AlertColor, IconButton } from '@mui/material'
import { ContentCopy as CopyIcon, Check as CheckIcon, Close as CloseIcon } from '@mui/icons-material'
import { useAppDispatch, useAppSelector } from './useRedux'
import {
  addNotification,
  removeNotification,
  selectNotifications,
} from '@/store/slices/notificationSlice'

interface NotificationContextType {
  showNotification: (
    message: string,
    type?: AlertColor,
    title?: string,
    duration?: number
  ) => void
  showSuccess: (message: string, title?: string) => void
  showError: (message: string, title?: string) => void
  showWarning: (message: string, title?: string) => void
  showInfo: (message: string, title?: string) => void
}

const NotificationContext = createContext<NotificationContextType | null>(null)

interface NotificationState {
  open: boolean
  message: string
  type: AlertColor
  title?: string
}

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const dispatch = useAppDispatch()
  const [snackbar, setSnackbar] = React.useState<NotificationState>({
    open: false,
    message: '',
    type: 'info',
  })
  const [copied, setCopied] = React.useState(false)

  const showNotification = useCallback(
    (
      message: string,
      type: AlertColor = 'info',
      title?: string,
      duration: number = 5000
    ) => {
      // Add to global notifications store
      dispatch(addNotification({
        type,
        title: title || type.charAt(0).toUpperCase() + type.slice(1),
        message,
      }))

      // Show snackbar
      setSnackbar({
        open: true,
        message,
        type,
        title,
      })
      setCopied(false)

      // Auto-hide snackbar
      if (duration > 0) {
        setTimeout(() => {
          setSnackbar(prev => ({ ...prev, open: false }))
        }, duration)
      }
    },
    [dispatch]
  )

  const showSuccess = useCallback(
    (message: string, title?: string) => {
      showNotification(message, 'success', title || 'Success')
    },
    [showNotification]
  )

  const showError = useCallback(
    (message: string, title?: string) => {
      showNotification(message, 'error', title || 'Error', 7000)
    },
    [showNotification]
  )

  const showWarning = useCallback(
    (message: string, title?: string) => {
      showNotification(message, 'warning', title || 'Warning')
    },
    [showNotification]
  )

  const showInfo = useCallback(
    (message: string, title?: string) => {
      showNotification(message, 'info', title || 'Info')
    },
    [showNotification]
  )

  const handleClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
    if (reason === 'clickaway') {
      return
    }
    setSnackbar(prev => ({ ...prev, open: false }))
  }

  const handleCopy = async () => {
    const text = snackbar.title ? `${snackbar.title}: ${snackbar.message}` : snackbar.message
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: select text for manual copy
    }
  }

  const value: NotificationContextType = {
    showNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
  }

  return (
    <NotificationContext.Provider value={value}>
      {children}
      
      {/* Global Snackbar for immediate notifications */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={null}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'top',
          horizontal: 'right',
        }}
        sx={{ mt: 8 }}
      >
        <Alert
          onClose={handleClose}
          severity={snackbar.type}
          variant="filled"
          action={
            <>
              <IconButton
                size="small"
                color="inherit"
                onClick={handleCopy}
                sx={{ opacity: 0.8, '&:hover': { opacity: 1 } }}
              >
                {copied ? <CheckIcon fontSize="small" /> : <CopyIcon fontSize="small" />}
              </IconButton>
              <IconButton size="small" color="inherit" onClick={handleClose}>
                <CloseIcon fontSize="small" />
              </IconButton>
            </>
          }
          sx={{
            width: '100%',
            minWidth: 300,
            maxWidth: 500,
          }}
        >
          {snackbar.title && (
            <strong>{snackbar.title}: </strong>
          )}
          {snackbar.message}
        </Alert>
      </Snackbar>
    </NotificationContext.Provider>
  )
}

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext)
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider')
  }
  return context
}

// Hook to get notifications from store
export const useNotifications = () => {
  const notifications = useAppSelector(selectNotifications)
  const dispatch = useAppDispatch()

  const removeNotif = useCallback((id: string) => {
    dispatch(removeNotification(id))
  }, [dispatch])

  return {
    notifications,
    removeNotification: removeNotif,
  }
}
