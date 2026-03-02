import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Box, LinearProgress } from '@mui/material'
import { useAppDispatch, useAppSelector } from './hooks/useRedux'
import { useRegionalSettings } from '@/hooks/useRegionalSettings'
import { selectTheme } from './store/slices/themeSlice'
import { clearAuth, logout as logoutAction, selectIsAuthenticated, selectRememberMe } from './store/slices/authSlice'
import { useIdleTimer } from './hooks/useIdleTimer'
import IdleWarningDialog from './components/auth/IdleWarningDialog'

const PageLoader = () => (
  <Box sx={{ width: '100%', position: 'fixed', top: 0, zIndex: 9999 }}>
    <LinearProgress />
  </Box>
)

export default function RootLayout() {
  const theme = useAppSelector(selectTheme)
  const isAuthenticated = useAppSelector(selectIsAuthenticated)
  const rememberMe = useAppSelector(selectRememberMe)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()

  const [showIdleWarning, setShowIdleWarning] = useState(false)

  useRegionalSettings(isAuthenticated)

  const IDLE_TIMEOUT = 30 * 60 * 1000
  const WARNING_TIME = 2 * 60 * 1000

  const handleAutoLogout = useCallback(async () => {
    setShowIdleWarning(false)
    const state = (window as any).store?.getState()
    const refreshToken = state?.auth?.refreshToken

    try {
      if (refreshToken) {
        await dispatch(logoutAction(refreshToken)).unwrap()
      }
    } catch (error) {
      console.error('Server logout failed:', error)
    } finally {
      dispatch(clearAuth())
      navigate('/login', { replace: true })
    }
  }, [dispatch, navigate])

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
    document.documentElement.setAttribute('data-theme', theme.mode)
  }, [theme.mode])

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
