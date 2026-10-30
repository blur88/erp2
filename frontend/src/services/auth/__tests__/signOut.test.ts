import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import authReducer, { clearAuth } from '@/store/slices/authSlice'
import { authApi } from '@/services/authApi'
import { SessionCoordinator } from '@/services/session/coordinator'
import { IndexedDbSessionStorage } from '@/services/session/storage'
import type { AuthResponse } from '@/store/slices/authSlice'
import {
  signOutManually, signOutForIdle, signOutAfterPasswordChange,
  signOutFromPasswordChange, clearLocalSessionForMissingRefreshToken,
  clearLocalSessionForFailedRefresh, clearLocalSessionForRouteCheck,
} from '../signOut'

const holder = vi.hoisted(() => ({ coordinator: null as any }))
vi.mock('@/services/session', () => ({ get sessionCoordinator() { return holder.coordinator } }))
vi.mock('@/services/authApi', () => ({ authApi: { logout: vi.fn() } }))
const response = { accessToken: 'access', refreshToken: 'refresh', user: { id: 'alice' }, expiresIn: 900 } as AuthResponse
const location = { href: '/dashboard', pathname: '/dashboard' }
let store: ReturnType<typeof makeStore>
function makeStore() {
  const initial = authReducer(undefined, { type: 'init' })
  return configureStore({ reducer: { auth: authReducer }, preloadedState: { auth: { ...initial, isAuthenticated: true, accessToken: 'access', refreshToken: 'refresh', rememberMe: true } } })
}
beforeEach(async () => {
  vi.mocked(authApi.logout).mockReset().mockResolvedValue({ data: undefined } as any)
  holder.coordinator = new SessionCoordinator({ storage: new IndexedDbSessionStorage(new IDBFactory()) })
  await holder.coordinator.start()
  await holder.coordinator.signIn(response)
  store = makeStore()
  holder.coordinator.subscribe((session: unknown) => { if (!session) store.dispatch(clearAuth()) })
  location.href = '/dashboard'; location.pathname = '/dashboard'
  vi.stubGlobal('window', { location })
})
afterEach(() => { holder.coordinator.dispose(); vi.unstubAllGlobals() })

function expectCleared() {
  expect(store.getState().auth).toMatchObject({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false, rememberMe: false })
}

describe('coordinated sign-out adapters', () => {
  it('manual deletes shared state and clears locally before the backend finishes', async () => {
    let finish!: () => void
    vi.mocked(authApi.logout).mockImplementation(() => new Promise(resolve => { finish = () => resolve({ data: undefined } as any) }))
    const purge = vi.fn(async () => { expectCleared() })
    const navigate = vi.fn()
    await signOutManually(store.dispatch, 'refresh', purge, navigate)
    expectCleared()
    expect(await holder.coordinator.credentialsForRequest()).toBeNull()
    expect(navigate).toHaveBeenCalledWith('/login')
    expect(authApi.logout).toHaveBeenCalledWith('refresh', 'access')
    finish()
  })

  it.each([signOutForIdle, signOutFromPasswordChange])('navigation exits clear before backend logout: %s', async exit => {
    const navigate = vi.fn(() => expectCleared())
    await exit(store.dispatch, 'refresh', navigate)
    expect(navigate).toHaveBeenCalledWith('/login', { replace: true })
    expect(authApi.logout).toHaveBeenCalledWith('refresh', 'access')
  })

  it('password-change completion deletes shared state before its best-effort logout', async () => {
    await signOutAfterPasswordChange(store.dispatch, 'refresh')
    expectCleared()
    expect(authApi.logout).toHaveBeenCalledWith('refresh', 'access')
  })

  it.each([clearLocalSessionForMissingRefreshToken, clearLocalSessionForFailedRefresh])('refresh exits clear shared state without server logout: %s', async exit => {
    await exit(store.dispatch)
    expectCleared()
    expect(await holder.coordinator.credentialsForRequest()).toBeNull()
    expect(authApi.logout).not.toHaveBeenCalled()
    expect(location.href).toBe('/login')
  })

  it('route failure deletes shared state but leaves navigation to ProtectedRoute', async () => {
    await clearLocalSessionForRouteCheck(store.dispatch)
    expectCleared()
    expect(await holder.coordinator.credentialsForRequest()).toBeNull()
    expect(authApi.logout).not.toHaveBeenCalled()
    expect(location.href).toBe('/dashboard')
  })

  it('a failed old refresh cannot end a newer session', async () => {
    const old = holder.coordinator.getSnapshot()
    const newer = await holder.coordinator.signIn({ ...response, accessToken: 'new' })
    await clearLocalSessionForFailedRefresh(store.dispatch, old.id, 'refresh')
    expect((await holder.coordinator.credentialsForRequest()).id).toBe(newer.id)
    expect(location.href).toBe('/dashboard')
  })
})
