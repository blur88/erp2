import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Box, LinearProgress } from '@mui/material'
import { useAppDispatch, useAppSelector } from './hooks/useRedux'
import { useRegionalSettings } from '@/hooks/useRegionalSettings'
import { selectIsAuthenticated, selectRememberMe } from './store/slices/authSlice'
import { useIdleTimer } from './hooks/useIdleTimer'
import IdleWarningDialog from './components/auth/IdleWarningDialog'
import { useClearReconciliationDraftsOnSignOut } from './pages/accounting/bank-reconciliations/useClearReconciliationDraftsOnSignOut'

import { signOutForIdle } from '@/services/auth/signOut'
import { SESSION_IDLE_TIMEOUT, sessionCoordinator } from '@/services/session'
import type { Session } from '@/services/session/storage'

const configuredIdleTimeout = Number((window as any).__ENV__?.SESSION_IDLE_TIMEOUT_MS)
const IDLE_TIMEOUT = Number.isFinite(configuredIdleTimeout) && configuredIdleTimeout > 0 ? configuredIdleTimeout : SESSION_IDLE_TIMEOUT
const WARNING_TIME = Math.min(5 * 60 * 1000, IDLE_TIMEOUT / 6)

const PageLoader = () => (
  <Box sx={{ width: '100%', position: 'fixed', top: 0, zIndex: 9999 }}>
    <LinearProgress />
  </Box>
)

export default function RootLayout() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const rememberMe = useAppSelector(selectRememberMe)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()

  const [showIdleWarning, setShowIdleWarning] = useState(false)
  const idleSessionRef = React.useRef<Session | null>(null)
  useEffect(() => sessionCoordinator.subscribe(session => { idleSessionRef.current = session }), [])

  useRegionalSettings(isAuthenticated)
  useClearReconciliationDraftsOnSignOut(isAuthenticated)

  const handleSharedActivity = useCallback(async (now: number) => {
    const session = await sessionCoordinator.credentialsForRequest()
    if (!session) throw new Error('Session ended')
    const updated = await sessionCoordinator.recordActivity(session.id, now)
    if (!updated || updated.id !== session.id) throw new Error('Session ended')
    idleSessionRef.current = updated
  }, [])

  const getSharedActivity = useCallback(async () => {
    const session = await sessionCoordinator.credentialsForRequest()
    return session?.lastActivity ?? null
  }, [])

  const handleIdleTimeout = useCallback(async () => {
    const session = idleSessionRef.current ?? await sessionCoordinator.credentialsForRequest()
    if (!session || session.rememberMe) return false
    const ended = await sessionCoordinator.signOutIfIdle(session.id, Date.now(), IDLE_TIMEOUT)
    if (ended) void signOutForIdle(dispatch, ended.refreshToken, navigate, ended)
    return !!ended
  }, [dispatch, navigate])

  const handleAutoLogout = useCallback(async () => {
    setShowIdleWarning(false)
    const session = await sessionCoordinator.credentialsForRequest()
    if (!session) return
    const ended = await sessionCoordinator.signOut(session.id)
    if (ended) void signOutForIdle(dispatch, ended.refreshToken, navigate, ended)
  }, [dispatch, navigate])

  const activityEvents = useMemo(() => ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll'], [])

  const handleIdle = useCallback(() => {
    void sessionCoordinator.credentialsForRequest().then(session => { idleSessionRef.current = session })
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
    getLastActivity: getSharedActivity,
    onActivity: handleSharedActivity,
    onIdleTimeout: handleIdleTimeout,
    events: activityEvents,
  })

  const handleStayLoggedIn = async () => {
    try {
      await reset()
    } catch {
      window.alert("Unable to update session activity. This browser's storage is unavailable.")
      return
    }
    setShowIdleWarning(false)
  }

  useEffect(() => {
    if (!isAuthenticated) {
      setShowIdleWarning(false)
    }
  }, [isAuthenticated])

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
