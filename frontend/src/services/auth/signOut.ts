import { clearAuth } from '@/store/slices/authSlice'
import { sessionCoordinator } from '@/services/session'
import { authApi } from '@/services/authApi'
import type { AppDispatch } from '@/store'
import type { NavigateFunction } from 'react-router-dom'

async function endSession(dispatch: AppDispatch, id = sessionCoordinator.getSnapshot()?.id, triedToken?: string) {
  const ended = id ? await sessionCoordinator.signOut(id, triedToken) : null
  if (!sessionCoordinator.getSnapshot()) dispatch(clearAuth())
  return ended
}

// Backend logout uses the captured credentials after shared deletion and cleanup.
async function backendLogout(session: Awaited<ReturnType<typeof endSession>>) {
  if (!session) return
  try { await authApi.logout(session.refreshToken, session.accessToken) }
  catch (error) { console.error('Server logout failed:', error) }
}

export async function signOutManually(
  dispatch: AppDispatch, _refreshToken: string | null, purge: () => Promise<unknown>, navigate: NavigateFunction,
) {
  const ended = await endSession(dispatch)
  await purge()
  navigate('/login')
  void backendLogout(ended)
}

export async function signOutForIdle(
  dispatch: AppDispatch, _refreshToken: string | null | undefined, navigate: NavigateFunction,
) {
  const ended = await endSession(dispatch)
  navigate('/login', { replace: true })
  void backendLogout(ended)
}

export async function signOutAfterPasswordChange(dispatch: AppDispatch, _refreshToken: string | null) {
  const ended = await endSession(dispatch)
  void backendLogout(ended)
}

export async function signOutFromPasswordChange(
  dispatch: AppDispatch, _refreshToken: string | null, navigate: NavigateFunction,
) {
  const ended = await endSession(dispatch)
  navigate('/login', { replace: true })
  void backendLogout(ended)
}

export async function clearLocalSessionForMissingRefreshToken(dispatch: AppDispatch) {
  await endSession(dispatch)
  window.location.href = '/login'
}

export async function clearLocalSessionForFailedRefresh(dispatch: AppDispatch, id?: string, triedToken?: string) {
  await endSession(dispatch, id, triedToken)
  if (!sessionCoordinator.getSnapshot() && window.location.pathname !== '/login') window.location.href = '/login'
}

// ProtectedRoute retains its declarative redirect, including the return location.
export async function clearLocalSessionForRouteCheck(dispatch: AppDispatch, id?: string) {
  await endSession(dispatch, id)
}
