import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { AxiosError, AxiosHeaders } from 'axios'
import authReducer from '@/store/slices/authSlice'
import { IDBFactory } from 'fake-indexeddb'
import { SessionCoordinator } from '@/services/session/coordinator'
import { IndexedDbSessionStorage } from '@/services/session/storage'
import type { AuthResponse } from '@/store/slices/authSlice'

const holder = vi.hoisted(() => ({ store: null as any, coordinator: null as any }))
vi.mock('@/services/session', () => ({ get sessionCoordinator() { return holder.coordinator } }))
vi.mock('@/store', () => ({ get store() { return holder.store } }))
vi.mock('@/services/authApi', () => ({ authApi: { refreshToken: vi.fn(), logout: vi.fn() } }))

beforeEach(async () => {
  vi.resetModules()
  holder.coordinator = new SessionCoordinator({ storage: new IndexedDbSessionStorage(new IDBFactory()) })
  await holder.coordinator.start()
  await holder.coordinator.signIn({ accessToken: 'access', refreshToken: 'refresh', user: { id: 'alice' }, expiresIn: 900 } as AuthResponse)
  const initial = authReducer(undefined, { type: 'init' })
  holder.store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { ...initial, isAuthenticated: true, accessToken: 'access', refreshToken: 'refresh' } },
  })
  vi.stubGlobal('window', { location: { origin: 'http://lan', pathname: '/dashboard', href: '/dashboard' } })
})
afterEach(() => { holder.coordinator.dispose(); vi.unstubAllGlobals() })

it('attaches current credentials to requests', async () => {
  const { default: api } = await import('../api')
  await api.get('/test', { adapter: async config => {
    expect(config.headers.Authorization).toBe('Bearer access')
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
  } })
})

it.each([null, 'refresh'])('401 with refresh token %s clears locally and navigates without backend logout', async (refreshToken) => {
  const { authApi } = await import('../authApi')
  const refreshFailure = new Error('refresh refused')
  vi.mocked(authApi.refreshToken).mockRejectedValue(refreshFailure)
  holder.store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { ...holder.store.getState().auth, refreshToken } },
  })
  if (!refreshToken) await holder.coordinator.updateField(holder.coordinator.getSnapshot().id, 'refreshToken', '')
  const { default: api } = await import('../api')
  const request = api.get('/protected', { adapter: async config => {
    throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
      data: {}, status: 401, statusText: 'Unauthorized', headers: new AxiosHeaders(), config,
    })
  } })
  await expect(request).rejects.toThrow(refreshToken ? 'refresh refused' : 'unauthorized')
  expect(holder.store.getState().auth).toMatchObject({ accessToken: null, refreshToken: null, isAuthenticated: false })
  expect(authApi.logout).not.toHaveBeenCalled()
  expect(authApi.refreshToken).toHaveBeenCalledTimes(refreshToken ? 1 : 0)
  if (refreshToken) expect(authApi.refreshToken).toHaveBeenCalledWith('refresh')
  expect(window.location.href).toBe('/login')
})

it('a missed cross-tab sign-out removes even an explicitly supplied stale Authorization header', async () => {
  const { default: api } = await import('../api')
  const session = holder.coordinator.getSnapshot()
  await holder.coordinator.signOut(session.id)
  await api.get('/test', { headers: { Authorization: 'Bearer access' }, adapter: async config => {
    expect(config.headers.Authorization).toBeUndefined()
    return { data: {}, status: 200, statusText: 'OK', headers: {}, config }
  } })
})

it('storage read failure stops the request before its adapter can send anything', async () => {
  const { default: api } = await import('../api')
  const adapter = vi.fn()
  holder.coordinator.dispose()
  await expect(api.get('/test', { adapter })).rejects.toThrow('disposed')
  expect(adapter).not.toHaveBeenCalled()
})

it('a refresh arriving after sign-out cannot recreate the session or retry the request', async () => {
  const { default: api } = await import('../api')
  const { authApi } = await import('../authApi')
  let resolveRefresh!: (value: any) => void
  vi.mocked(authApi.refreshToken).mockImplementation(() => new Promise(resolve => { resolveRefresh = resolve }))
  const adapter = vi.fn(async config => {
    throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
      data: {}, status: 401, statusText: 'Unauthorized', headers: new AxiosHeaders(), config,
    })
  })
  const request = api.get('/protected', { adapter })
  const rejected = expect(request).rejects.toThrow('Session ended during refresh')
  await vi.waitFor(() => expect(resolveRefresh).toBeDefined())
  await holder.coordinator.signOut(holder.coordinator.getSnapshot().id)
  resolveRefresh({ data: { accessToken: 'late', refreshToken: 'late-refresh', user: { id: 'alice' } } })
  await rejected
  expect(await holder.coordinator.credentialsForRequest()).toBeNull()
  expect(adapter).toHaveBeenCalledTimes(1)
})
