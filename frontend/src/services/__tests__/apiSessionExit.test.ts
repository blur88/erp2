import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { AxiosError, AxiosHeaders } from 'axios'
import authReducer, { login, setCredentials } from '@/store/slices/authSlice'
import { IDBFactory } from 'fake-indexeddb'
import { SessionCoordinator } from '@/services/session/coordinator'
import { IndexedDbSessionStorage } from '@/services/session/storage'
import type { AuthResponse } from '@/store/slices/authSlice'

const holder = vi.hoisted(() => ({ store: null as any, coordinator: null as any }))
vi.mock('@/services/session', () => ({ get sessionCoordinator() { return holder.coordinator } }))
vi.mock('@/store', () => ({ get store() { return holder.store } }))
vi.mock('@/services/authApi', () => ({ authApi: { refreshToken: vi.fn(), logout: vi.fn(), login: vi.fn() } }))

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
  const refreshFailure = Object.assign(new Error('refresh refused'), { response: { status: 401 } })
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
  const storage = new IndexedDbSessionStorage(new IDBFactory())
  holder.coordinator = new SessionCoordinator({ storage })
  await holder.coordinator.start()
  storage.close()
  await expect(api.get('/test', { adapter })).rejects.toThrow('not open')
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

it('concurrent 401 responses in one tab share one refresh even while the shared read is pending', async () => {
  const { default: api } = await import('../api')
  const { authApi } = await import('../authApi')
  let finish!: () => void
  vi.mocked(authApi.refreshToken).mockImplementation(() => new Promise(resolve => {
    finish = () => resolve({ data: { accessToken: 'rotated', refreshToken: 'rotated-refresh', user: { id: 'alice' } } } as any)
  }))
  const adapter = async (config: any) => {
    if (config.headers.Authorization === 'Bearer rotated') return { data: 'ok', status: 200, statusText: 'OK', headers: {}, config }
    throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, { data: {}, status: 401, statusText: 'Unauthorized', headers: new AxiosHeaders(), config })
  }
  const requests = Promise.all([api.get('/first', { adapter }), api.get('/second', { adapter })])
  await vi.waitFor(() => expect(authApi.refreshToken).toHaveBeenCalled())
  // Allow both handlers' required storage reads to complete before resolving refresh.
  await new Promise(resolve => setTimeout(resolve, 30))
  expect(authApi.refreshToken).toHaveBeenCalledTimes(1)
  finish()
  expect((await requests).map(result => result.data)).toEqual(['ok', 'ok'])
})

it('discards a successful response from the previous Session before exposing its data', async () => {
  const { default: api } = await import('../api')
  let finish!: () => void
  let sent!: () => void
  const started = new Promise<void>(resolve => { sent = resolve })
  const request = api.get('/private', { adapter: config => new Promise(resolve => {
    finish = () => resolve({ data: { secret: 'alice' }, status: 200, statusText: 'OK', headers: {}, config })
    sent()
  }) })
  await started
  await holder.coordinator.signIn({ accessToken: 'bob-access', refreshToken: 'bob-refresh', user: { id: 'bob' }, expiresIn: 900 })
  finish()
  await expect(request).rejects.toThrow('Session ended before response')
})


it('a failed pending login never clears a newly mirrored Session', async () => {
  const { authApi } = await import('../authApi')
  let fail!: (error: Error) => void
  vi.mocked(authApi.login).mockImplementationOnce(() => new Promise((_, reject) => { fail = reject }))
  const attempt = holder.store.dispatch(login({ usernameOrEmail: 'alice', password: 'wrong' }))
  await vi.waitFor(() => expect(authApi.login).toHaveBeenCalledOnce())
  holder.coordinator.subscribe((session: any) => {
    if (session) holder.store.dispatch(setCredentials({ ...session, expiresIn: 900 }))
  })
  await holder.coordinator.signIn({ accessToken: 'bob-access', refreshToken: 'bob-refresh', user: { id: 'bob' }, expiresIn: 900 })
  fail(new Error('old login rejected'))
  await attempt
  expect(holder.store.getState().auth).toMatchObject({ user: { id: 'bob' }, accessToken: 'bob-access', isAuthenticated: true, loading: false, error: null })
})

it('retries a request at most once after a successful refresh', async () => {
  const { default: api } = await import('../api')
  const { authApi } = await import('../authApi')
  vi.mocked(authApi.refreshToken).mockResolvedValueOnce({ data: { accessToken: 'new', refreshToken: 'new-refresh', user: { id: 'alice' } } } as any)
  const adapter = vi.fn(async config => {
    throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, { data: {}, status: 401, statusText: 'Unauthorized', headers: new AxiosHeaders(), config })
  })
  await expect(api.get('/protected', { adapter })).rejects.toThrow('unauthorized')
  expect(adapter).toHaveBeenCalledTimes(2)
  expect(authApi.refreshToken).toHaveBeenCalledTimes(1)
})

it('surfaces a refresh 429 without retrying or ending the session', async () => {
  const { default: api } = await import('../api')
  const { authApi } = await import('../authApi')
  const rateLimit = Object.assign(new Error('rate limited'), { response: { status: 429 } })
  vi.mocked(authApi.refreshToken).mockRejectedValueOnce(rateLimit)
  const adapter = vi.fn(async config => {
    throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, { data: {}, status: 401, statusText: 'Unauthorized', headers: new AxiosHeaders(), config })
  })
  await expect(api.get('/protected', { adapter })).rejects.toBe(rateLimit)
  expect(adapter).toHaveBeenCalledOnce()
  expect(authApi.refreshToken).toHaveBeenCalledOnce()
  expect(await holder.coordinator.credentialsForRequest()).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' })
  expect(holder.store.getState().auth.isAuthenticated).toBe(true)
  expect(window.location.href).not.toBe('/login')
})

it.each([
  ['network error', Object.assign(new Error('network error'), { code: 'ERR_NETWORK' })],
  ['5xx response', Object.assign(new Error('server error'), { response: { status: 500 } })],
])('surfaces a refresh %s without ending the session', async (_label, failure) => {
  const { default: api } = await import('../api')
  const { authApi } = await import('../authApi')
  vi.mocked(authApi.refreshToken).mockRejectedValueOnce(failure)
  const adapter = vi.fn(async config => {
    throw new AxiosError('unauthorized', 'ERR_BAD_REQUEST', config, undefined, { data: {}, status: 401, statusText: 'Unauthorized', headers: new AxiosHeaders(), config })
  })
  await expect(api.get('/protected', { adapter })).rejects.toBe(failure)
  expect(adapter).toHaveBeenCalledOnce()
  expect(authApi.refreshToken).toHaveBeenCalledOnce()
  expect(await holder.coordinator.credentialsForRequest()).toMatchObject({ accessToken: 'access', refreshToken: 'refresh' })
  expect(holder.store.getState().auth.isAuthenticated).toBe(true)
  expect(window.location.href).not.toBe('/login')
})
