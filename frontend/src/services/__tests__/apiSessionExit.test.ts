import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { configureStore } from '@reduxjs/toolkit'
import { AxiosError, AxiosHeaders } from 'axios'
import authReducer from '@/store/slices/authSlice'

const holder = vi.hoisted(() => ({ store: null as any }))
vi.mock('@/store', () => ({ get store() { return holder.store } }))
vi.mock('@/services/authApi', () => ({ authApi: { refreshToken: vi.fn(), logout: vi.fn() } }))

beforeEach(() => {
  vi.resetModules()
  const initial = authReducer(undefined, { type: 'init' })
  holder.store = configureStore({
    reducer: { auth: authReducer },
    preloadedState: { auth: { ...initial, isAuthenticated: true, accessToken: 'access', refreshToken: 'refresh' } },
  })
  vi.stubGlobal('window', { location: { origin: 'http://lan', pathname: '/dashboard', href: '/dashboard' } })
})
afterEach(() => vi.unstubAllGlobals())

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
