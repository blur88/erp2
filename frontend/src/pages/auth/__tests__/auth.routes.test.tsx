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

describe('auth routes', () => {
  // The session record decides what these pages show (the form, or the
  // storage-unavailable screen), so it is read before their first render.
  it.each(['/login', '/change-password-required'])('%s waits for the session before rendering', async (path) => {
    const route = authRoutes.find((r) => r.path === path)
    expect(typeof route?.loader).toBe('function')
    sessionReady.mockClear()

    let settled = false
    const loading = Promise.resolve((route!.loader as () => unknown)()).then((value) => {
      settled = true
      return value
    })
    await new Promise((r) => setTimeout(r, 0))
    expect(sessionReady).toHaveBeenCalledTimes(1)
    expect(settled).toBe(false)

    releaseSession()
    expect(await loading).toBeNull()
  })
})
