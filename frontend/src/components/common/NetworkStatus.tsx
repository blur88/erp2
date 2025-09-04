import React, { useState, useEffect } from 'react'
import { Alert, Snackbar, LinearProgress, Box } from '@mui/material'
import { ApiService } from '@/services/api'

interface NetworkStatusProps {
  onStatusChange?: (isOnline: boolean) => void
}

const NetworkStatus: React.FC<NetworkStatusProps> = ({ onStatusChange }) => {
  const [isOnline, setIsOnline] = useState(true)
  const [isChecking, setIsChecking] = useState(false)
  const [showAlert, setShowAlert] = useState(false)

  const checkConnectivity = async () => {
    setIsChecking(true)
    try {
      await ApiService.get('/health')
      if (!isOnline) {
        setIsOnline(true)
        setShowAlert(true)
        onStatusChange?.(true)
      }
    } catch (error) {
      if (isOnline) {
        setIsOnline(false)
        setShowAlert(true)
        onStatusChange?.(false)
        console.warn('API connectivity lost. This may be due to VPN connectivity issues.')
      }
    }
    setIsChecking(false)
  }

  useEffect(() => {
    // Initial check
    checkConnectivity()

    // Set up periodic checks every 30 seconds
    const interval = setInterval(checkConnectivity, 30000)

    // Listen to online/offline events
    const handleOnline = () => {
      console.log('Browser detected online status')
      checkConnectivity()
    }

    const handleOffline = () => {
      console.log('Browser detected offline status')
      setIsOnline(false)
      setShowAlert(true)
      onStatusChange?.(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      clearInterval(interval)
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [isOnline, onStatusChange])

  return (
    <>
      {/* Loading indicator for connectivity check */}
      {isChecking && (
        <Box sx={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999 }}>
          <LinearProgress color="info" />
        </Box>
      )}

      {/* Offline alert */}
      <Snackbar
        open={showAlert && !isOnline}
        autoHideDuration={6000}
        onClose={() => setShowAlert(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          severity="error" 
          onClose={() => setShowAlert(false)}
          sx={{ width: '100%' }}
        >
          Connection lost. Check your internet connection or VPN settings.
        </Alert>
      </Snackbar>

      {/* Back online alert */}
      <Snackbar
        open={showAlert && isOnline}
        autoHideDuration={4000}
        onClose={() => setShowAlert(false)}
        anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
      >
        <Alert 
          severity="success" 
          onClose={() => setShowAlert(false)}
          sx={{ width: '100%' }}
        >
          Connection restored.
        </Alert>
      </Snackbar>
    </>
  )
}

export default NetworkStatus