import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Box, LinearProgress } from '@mui/material'
import { useAppSelector } from './hooks/useRedux'
import { useRegionalSettings } from '@/hooks/useRegionalSettings'
import {
  selectIsAuthenticated,
  selectRememberMe,
  selectStorageUnavailable,
  selectStorageWaiting,
} from './store/slices/authSlice'
import { sessionRuntime } from '@/session'
import { useIdleTimer } from './hooks/useIdleTimer'
import IdleWarningDialog from './components/auth/IdleWarningDialog'
import StorageUnavailableScreen from './components/auth/StorageUnavailableScreen'
import StorageWaitingScreen from './components/auth/StorageWaitingScreen'
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
  const storageWaiting = useAppSelector(selectStorageWaiting)
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

  // The route loaders ran while storage had not answered and let everything
  // through to the waiting screen. When a retry finds a session, they run again
  // for where the tab is, as at a normal start (the mandatory password change).
  // A tab found signed-out is moved by the route it is on; the sign-in page
  // moves a signed-in one itself.
  const wasWaiting = useRef(storageWaiting)
  useEffect(() => {
    const recovered = wasWaiting.current && !storageWaiting
    wasWaiting.current = storageWaiting
    if (recovered && isAuthenticated && location.pathname !== '/login') {
      navigate(`${location.pathname}${location.search}${location.hash}`, { replace: true })
    }
  }, [storageWaiting, isAuthenticated, location, navigate])

  const retryStart = useCallback(() => sessionRuntime.retryStart(), [])

  // Fail closed (spec B8): without session storage the message takes the place
  // of every route, public or protected, at startup or when it happens later.
  if (storageUnavailable) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <StorageUnavailableScreen />
      </Box>
    )
  }

  // The start-up read timed out (spec B3: a timeout settles nothing). Whether a
  // session is stored is unknown, so no route renders: not the sign-in form,
  // which would displace a stored session, and nothing that sends a request.
  if (storageWaiting) {
    return (
      <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
        <StorageWaitingScreen onRetry={retryStart} />
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
