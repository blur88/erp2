import { clearAuth, logout } from '@/store/slices/authSlice'
import type { AppDispatch } from '@/store'
import type { NavigateFunction } from 'react-router-dom'

// T0 preserves each caller's existing ordering and missing-token behavior (#1547).
export async function signOutManually(
  dispatch: AppDispatch, refreshToken: string | null, purge: () => Promise<unknown>, navigate: NavigateFunction,
) {
  if (refreshToken) await dispatch(logout(refreshToken))
  await purge()
  navigate('/login')
}

export async function signOutForIdle(
  dispatch: AppDispatch, refreshToken: string | null | undefined, navigate: NavigateFunction,
) {
  try {
    if (refreshToken) await dispatch(logout(refreshToken)).unwrap()
  } catch (error) {
    console.error('Server logout failed:', error)
  } finally {
    dispatch(clearAuth())
    navigate('/login', { replace: true })
  }
}

export function signOutAfterPasswordChange(dispatch: AppDispatch, refreshToken: string | null) {
  if (refreshToken) dispatch(logout(refreshToken))
}

export async function signOutFromPasswordChange(
  dispatch: AppDispatch, refreshToken: string | null, navigate: NavigateFunction,
) {
  try {
    if (refreshToken) await dispatch(logout(refreshToken)).unwrap()
    navigate('/login', { replace: true })
  } catch {
    navigate('/login', { replace: true })
  }
}

export function signOutForMissingRefreshToken(dispatch: AppDispatch) {
  dispatch(clearAuth())
  window.location.href = '/login'
}

export function signOutForFailedRefresh(dispatch: AppDispatch) {
  dispatch(clearAuth())
  if (window.location.pathname !== '/login') window.location.href = '/login'
}

// ProtectedRoute retains its declarative redirect, including the return location.
export function signOutForRouteCheck(dispatch: AppDispatch) {
  dispatch(clearAuth())
}
