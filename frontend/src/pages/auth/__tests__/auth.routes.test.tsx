import { beforeEach, describe, it, expect, vi } from 'vitest'
import type { RouteObject } from 'react-router-dom'

let releaseSession: () => void = () => undefined
const sessionReady = vi.fn(
  () =>
    new Promise<void>((resolve) => {
      releaseSession = resolve
    }),
)
vi.mock('@/session', () => ({ sessionReady: () => sessionReady() }))

// The loaders read the application's store. `storageUnavailable` is set by one
// reducer and cleared by none, `sessionEnded` included, so a store shared by the
// file carried it into whichever test ran next (#1387). Each test loads the
// routes, and the store they read, afresh.
let authRoutes: RouteObject[]
let store: (typeof import('@/store'))['store']
let sessionEstablished: (typeof import('@/store/slices/authSlice'))['sessionEstablished']
let sessionEnded: (typeof import('@/store/slices/authSlice'))['sessionEnded']
let storageUnavailable: (typeof import('@/store/slices/authSlice'))['storageUnavailable']

beforeEach(async () => {
  vi.resetModules()
  ;({ authRoutes } = await import('../auth.routes'))
  ;({ store } = await import('@/store'))
  ;({ sessionEstablished, sessionEnded, storageUnavailable } = await import('@/store/slices/authSlice'))
})

const session = {
  sessionId: 's1',
  generation: 1,
  accessToken: 'at',
  accessTokenExpiresAt: 0,
  refreshToken: 'rt',
  user: { id: 'u1' } as never,
  rememberMe: false,
}

const load = (path: string) => {
  const route = authRoutes.find((r) => r.path === path)
  expect(typeof route?.loader).toBe('function')
  return Promise.resolve((route!.loader as () => unknown)())
}

describe('auth routes', () => {
  // The session record decides what is shown at these paths (the form, or the
  // storage-unavailable screen in its place), so it is read before the first render.
  it.each(['/login', '/change-password-required'])('%s waits for the session before rendering', async (path) => {
    store.dispatch(sessionEstablished(session))
    sessionReady.mockClear()

    let settled = false
    const loading = load(path).then((value) => {
      settled = true
      return value
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(sessionReady).toHaveBeenCalledTimes(1)
    expect(settled).toBe(false)

    releaseSession()
    expect(await loading).toBeNull()
  })

  it('/login renders for a signed-out tab', async () => {
    store.dispatch(sessionEnded())
    const loading = load('/login')
    releaseSession()
    expect(await loading).toBeNull()
  })

  // RootLayout shows the storage-unavailable screen in place of the route.
  // Declared before the redirect below on purpose: on a shared store this
  // order fails the redirect without any shuffling (#1387).
  it('/change-password-required does not redirect when storage is unavailable', async () => {
    store.dispatch(storageUnavailable())
    const loading = load('/change-password-required')
    releaseSession()
    expect(await loading).toBeNull()
  })

  it('/change-password-required opened without a session redirects to /login', async () => {
    expect(store.getState().auth.storageUnavailable).toBe(false)
    store.dispatch(sessionEnded())
    const loading = load('/change-password-required')
    releaseSession()
    const response = (await loading) as Response
    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/login')
  })
})
