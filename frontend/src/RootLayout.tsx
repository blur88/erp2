import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Box, LinearProgress } from '@mui/material'
import { useAppSelector } from './hooks/useRedux'
import { useRegionalSettings } from '@/hooks/useRegionalSettings'
import { selectIsAuthenticated, selectRememberMe, selectStorageUnavailable } from './store/slices/authSlice'
import { sessionRuntime } from '@/session'
import { useIdleTimer } from './hooks/useIdleTimer'
import IdleWarningDialog from './components/auth/IdleWarningDialog'
import StorageUnavailableScreen from './components/auth/StorageUnavailableScreen'
import { useClearReconciliationDraftsOnSignOut } from './pages/accounting/bank-reconciliations/useClearReconciliationDraftsOnSignOut'

const IDLE_TIMEOUT = 12 * 60 * 60 * 1000
const WARNING_TIME = 5 * 60 * 1000

const PageLoader = () => (
  <Box sx={{ width: '100%', position: 'fixed', top: 0, zIndex: 9999 }}>
    <LinearProgress />
  </Box>
)

export default function RootLayout() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const rememberMe = useAppSelector(selectRememberMe)
  const storageUnavailable = useAppSelector(selectStorageUnavailable)
  const navigate = useNavigate()
  const location = useLocation()

  const [showIdleWarning, setShowIdleWarning] = useState(false)

  useRegionalSettings(isAuthenticated)
  useClearReconciliationDraftsOnSignOut(isAuthenticated)

  const handleAutoLogout = useCallback(async () => {
    setShowIdleWarning(false)
    try {
      await sessionRuntime.signOut()
    } catch (error) {
      console.error('Server logout failed:', error)
    } finally {
      navigate('/login', { replace: true })
    }
  }, [navigate])

  const activityEvents = useMemo(() => ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'], [])

  const handleIdle = useCallback(() => {
    setShowIdleWarning(true)
  }, [])

  const handleTimeout = useCallback(() => {
    handleAutoLogout()
  }, [handleAutoLogout])

  const handleActive = useCallback(() => {
    setShowIdleWarning(false)
  }, [])

  const { remainingTime, reset } = useIdleTimer({
    timeout: IDLE_TIMEOUT,
    warningTime: WARNING_TIME,
    enabled: isAuthenticated && location.pathname !== '/login' && !rememberMe,
    onIdle: handleIdle,
    onTimeout: handleTimeout,
    onActive: handleActive,
    events: activityEvents,
  })

  const handleStayLoggedIn = () => {
    setShowIdleWarning(false)
    reset()
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setShowIdleWarning(false)
    }
  }, [isAuthenticated])

  // Fail closed (spec B8): without session storage the message takes the place
  // of every route, public or protected, at startup or when it happens later.
  if (storageUnavailable) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <StorageUnavailableScreen />
      </Box>
    )
  }

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
      <IdleWarningDialog
        open={showIdleWarning}
        remainingSeconds={remainingTime}
        totalWarningSeconds={WARNING_TIME / 1000}
        onStayLoggedIn={handleStayLoggedIn}
        onLogout={handleAutoLogout}
      />

      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </Box>
  )
}
