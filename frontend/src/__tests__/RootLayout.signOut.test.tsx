import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { IDBFactory } from 'fake-indexeddb'
import authReducer from '@/store/slices/authSlice'
import { sessionCoordinator } from '@/services/session'
import { signOutForIdle } from '@/services/auth/signOut'
import { authApi } from '@/services/authApi'

const navigate = vi.hoisted(() => vi.fn())
vi.mock('@/services/authApi', () => ({ authApi: { logout: vi.fn() } }))
vi.stubGlobal('indexedDB', new IDBFactory())
afterEach(() => sessionCoordinator.dispose())

beforeEach(async () => {
  navigate.mockClear()
  vi.mocked(authApi.logout).mockReset().mockResolvedValue({ data: undefined } as any)
  await sessionCoordinator.start()
  const existing = sessionCoordinator.getSnapshot()
  if (existing) await sessionCoordinator.signOut(existing.id)
  await sessionCoordinator.signIn({
    accessToken: 'access', refreshToken: 'refresh', user: { id: 'test-user' }, expiresIn: 900,
  } as any)
})

it('signOutForIdle deletes the shared session, clears auth, navigates, and logs out through the transport', async () => {
  const initial = authReducer(undefined, { type: 'init' })
  const store = configureStore({ reducer: { auth: authReducer }, preloadedState: {
    auth: { ...initial, isAuthenticated: true, accessToken: 'access', refreshToken: 'refresh' },
  } })

  await signOutForIdle(store.dispatch as any, 'refresh', navigate)

  expect(await sessionCoordinator.credentialsForRequest()).toBeNull()
  expect(store.getState().auth).toMatchObject({ accessToken: null, refreshToken: null, isAuthenticated: false })
  expect(navigate).toHaveBeenCalledWith('/login', { replace: true })
  await vi.waitFor(() => expect(authApi.logout).toHaveBeenCalledWith('refresh', 'access'))
})
