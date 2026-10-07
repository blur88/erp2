import { describe, it, expect, vi } from 'vitest'

let releaseSession: () => void = () => undefined
const sessionReady = vi.fn(
  () =>
    new Promise<void>((resolve) => {
      releaseSession = resolve
    }),
)
vi.mock('@/session', () => ({ sessionReady: () => sessionReady() }))

import { authRoutes } from '../auth.routes'
import { store } from '@/store'
import { sessionEstablished, sessionEnded, storageUnavailable } from '@/store/slices/authSlice'

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

  it('/change-password-required opened without a session redirects to /login', async () => {
    store.dispatch(sessionEnded())
    const loading = load('/change-password-required')
    releaseSession()
    const response = (await loading) as Response
    expect(response).toBeInstanceOf(Response)
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe('/login')
  })

  // RootLayout shows the storage-unavailable screen in place of the route.
  it('/change-password-required does not redirect when storage is unavailable', async () => {
    store.dispatch(storageUnavailable())
    const loading = load('/change-password-required')
    releaseSession()
    expect(await loading).toBeNull()
  })
})
