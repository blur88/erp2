import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import authReducer, { setAccessToken } from '@/store/slices/authSlice'
import { authApi } from '@/services/authApi'
import { getCredentials } from '../credentials'
import {
  signOutManually, clearLocalSessionForIdle, signOutAfterPasswordChange,
  signOutFromPasswordChange, clearLocalSessionForMissingRefreshToken,
  clearLocalSessionForFailedRefresh, clearLocalSessionForRouteCheck,
} from '../signOut'

vi.mock('@/services/authApi', () => ({ authApi: { logout: vi.fn() } }))

function makeStore() {
  const initial = authReducer(undefined, { type: 'init' })
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { ...initial, isAuthenticated: true, accessToken: 'access', refreshToken: 'refresh', rememberMe: true } },
  })
}

const location = { href: '/dashboard', pathname: '/dashboard' }
beforeEach(() => {
  vi.mocked(authApi.logout).mockReset().mockResolvedValue({ data: undefined } as any)
  location.href = '/dashboard'
  location.pathname = '/dashboard'
  vi.stubGlobal('window', { location })
})
afterEach(() => vi.unstubAllGlobals())

function expectCleared(store: ReturnType<typeof makeStore>) {
  expect(store.getState().auth).toMatchObject({
    user: null, accessToken: null, refreshToken: null, isAuthenticated: false, rememberMe: false,
  })
}

describe('session-ending behavior', () => {
  it.each([false, true])('manual waits for backend then clears, purges, and navigates (backend fails: %s)', async (fails) => {
    const store = makeStore()
    let finish!: () => void
    vi.mocked(authApi.logout).mockImplementation(() => new Promise((resolve, reject) => {
      finish = () => fails ? reject(new Error('offline')) : resolve({ data: undefined } as any)
    }))
    const purge = vi.fn(async () => { expectCleared(store) })
    const navigate = vi.fn(() => { expect(purge).toHaveResolved() })
    const pending = signOutManually(store.dispatch, 'refresh', purge, navigate)
    expect(authApi.logout).toHaveBeenCalledWith('refresh')
    expect(store.getState().auth.isAuthenticated).toBe(true)
    expect(purge).not.toHaveBeenCalled()
    finish()
    await pending
    expectCleared(store)
    expect(navigate).toHaveBeenCalledWith('/login')
  })

  it('manual without refresh token only purges and navigates', async () => {
    const store = makeStore()
    const purge = vi.fn().mockResolvedValue(undefined)
    const navigate = vi.fn()
    await signOutManually(store.dispatch, null, purge, navigate)
    expect(authApi.logout).not.toHaveBeenCalled()
    expect(store.getState().auth.isAuthenticated).toBe(true)
    expect(purge).toHaveBeenCalledOnce()
    expect(navigate).toHaveBeenCalledWith('/login')
  })

  it.each(['refresh', null])('idle always clears and replaces login, token: %s', async (token) => {
    const store = makeStore()
    const navigate = vi.fn(() => expectCleared(store))
    await clearLocalSessionForIdle(store.dispatch, token, navigate)
    expect(authApi.logout).toHaveBeenCalledTimes(token ? 1 : 0)
    expectCleared(store)
    expect(navigate).toHaveBeenCalledWith('/login', { replace: true })
  })

  it.each([false, true])('password-page sign-out waits for logout and replaces login, failure: %s', async (fails) => {
    const store = makeStore()
    if (fails) vi.mocked(authApi.logout).mockRejectedValue(new Error('offline'))
    const navigate = vi.fn(() => expectCleared(store))
    await signOutFromPasswordChange(store.dispatch, 'refresh', navigate)
    expect(authApi.logout).toHaveBeenCalledWith('refresh')
    expect(navigate).toHaveBeenCalledWith('/login', { replace: true })
  })

  it('password-page sign-out without token navigates without clearing', async () => {
    const store = makeStore()
    const navigate = vi.fn()
    await signOutFromPasswordChange(store.dispatch, null, navigate)
    expect(authApi.logout).not.toHaveBeenCalled()
    expect(store.getState().auth.isAuthenticated).toBe(true)
    expect(navigate).toHaveBeenCalledWith('/login', { replace: true })
  })

  it('password-change completion starts logout without waiting or navigating', async () => {
    const store = makeStore()
    let finish!: () => void
    vi.mocked(authApi.logout).mockImplementation(() => new Promise(resolve => {
      finish = () => resolve({ data: undefined } as any)
    }))
    expect(signOutAfterPasswordChange(store.dispatch, 'refresh')).toBeUndefined()
    expect(store.getState().auth.isAuthenticated).toBe(true)
    expect(location.href).toBe('/dashboard')
    finish()
    await vi.waitFor(() => expectCleared(store))
  })

  it('password-change completion without a token leaves state alone', () => {
    const store = makeStore()
    signOutAfterPasswordChange(store.dispatch, null)
    expect(authApi.logout).not.toHaveBeenCalled()
    expect(store.getState().auth.isAuthenticated).toBe(true)
  })

  it.each([clearLocalSessionForMissingRefreshToken, clearLocalSessionForFailedRefresh])('refresh exit clears locally and navigates without backend logout: %s', (signOut) => {
    const store = makeStore()
    signOut(store.dispatch)
    expectCleared(store)
    expect(authApi.logout).not.toHaveBeenCalled()
    expect(location.href).toBe('/login')
  })

  it('failed refresh on login clears without reloading; missing token still navigates', () => {
    const store = makeStore()
    location.pathname = '/login'
    clearLocalSessionForFailedRefresh(store.dispatch)
    expectCleared(store)
    expect(location.href).toBe('/dashboard')
    clearLocalSessionForMissingRefreshToken(store.dispatch)
    expect(location.href).toBe('/login')
  })

  it('route check only clears, leaving navigation to ProtectedRoute', () => {
    const store = makeStore()
    clearLocalSessionForRouteCheck(store.dispatch)
    expectCleared(store)
    expect(authApi.logout).not.toHaveBeenCalled()
    expect(location.href).toBe('/dashboard')
  })

  it('credentials reflect current state, including missing auth and rotated access tokens', () => {
    const store = makeStore()
    expect(getCredentials(store.getState())).toEqual({ accessToken: 'access', refreshToken: 'refresh' })
    store.dispatch(setAccessToken('rotated'))
    expect(getCredentials(store.getState())).toEqual({ accessToken: 'rotated', refreshToken: 'refresh' })
    expect(getCredentials({})).toEqual({ accessToken: undefined, refreshToken: undefined })
  })
})
