import { describe, it, expect, afterEach, vi } from 'vitest'
import { loadApp, persistedPayload, storedSession } from '@/session/__tests__/appHarness'
import { addNotification } from '../slices/notificationSlice'

const notification = (title: string) => ({
  id: `n-${title}`,
  type: 'success',
  title,
  message: 'kept across a reload',
  timestamp: '2026-10-06T00:00:00.000Z',
  read: false,
})

const storedNotifications = (titles: string[]) =>
  persistedPayload({ notifications: { notifications: titles.map(notification), unreadCount: titles.length } })

const titles = (state: { notifications: { notifications: Array<{ title: string }> } }) =>
  state.notifications.notifications.map((n) => n.title)

describe('the application store on the session runtime', () => {
  afterEach(() => {
    vi.doUnmock('@/session/store/indexedDbSessionStore')
  })

  it('notifications stored for the signed-in session are in Redux after rehydration', async () => {
    const session = storedSession()
    const app = await loadApp({
      stored: {
        record: { revision: 3, session },
        slices: { sessionId: session.sessionId, json: storedNotifications(['first', 'second']) },
      },
    })

    await Promise.all([app.rehydrated(), app.sessionReady()])

    expect(app.store.getState().auth.sessionId).toBe(session.sessionId)
    expect(titles(app.store.getState())).toEqual(['first', 'second'])
    expect(app.store.getState().notifications.unreadCount).toBe(2)
  })

  it('slices tagged with another session are not read back', async () => {
    const app = await loadApp({
      stored: {
        record: { revision: 3, session: storedSession() },
        slices: { sessionId: 'sess-someone-else', json: storedNotifications(['not mine']) },
      },
    })

    await Promise.all([app.rehydrated(), app.sessionReady()])

    expect(app.store.getState().auth.isAuthenticated).toBe(true)
    expect(titles(app.store.getState())).toEqual([])
  })

  it('slices left behind for a signed-out record are not read back', async () => {
    const app = await loadApp({
      stored: {
        record: { revision: 3, session: null },
        slices: { sessionId: 'sess-stored', json: storedNotifications(['stale']) },
      },
    })

    await Promise.all([app.rehydrated(), app.sessionReady()])

    expect(app.store.getState().auth.isAuthenticated).toBe(false)
    expect(titles(app.store.getState())).toEqual([])
  })

  it('storage unavailable: rehydration completes empty and the app is in the storage-unavailable state', async () => {
    const app = await loadApp({ storage: 'unavailable' })

    await Promise.all([app.rehydrated(), app.sessionReady()])

    expect(app.persistor.getState().bootstrapped).toBe(true)
    expect(titles(app.store.getState())).toEqual([])
    expect(app.store.getState().auth.storageUnavailable).toBe(true)
    expect(app.store.getState().auth.isAuthenticated).toBe(false)
    expect(app.sessionRuntime.status()).toBe('storage-unavailable')
    expect(app.requests).toHaveLength(0)

    // Nothing is written from the signed-out state either: redux-persist reports
    // a failed write on console.error.
    const consoleError = vi.spyOn(console, 'error')
    const persistSlices = vi.spyOn(app.sessionRuntime, 'persistSlices')
    app.store.dispatch(addNotification({ type: 'success', title: 'unsaved', message: 'm' }))
    await app.persistor.flush()
    expect(persistSlices).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
    consoleError.mockRestore()
  })

  it('no login request is sent when storage is unavailable', async () => {
    const app = await loadApp({ storage: 'unavailable' })
    await Promise.all([app.rehydrated(), app.sessionReady()])
    const { login } = await import('@/store/slices/authSlice')

    const result = await app.store.dispatch(login({ usernameOrEmail: 'admin', password: 'Admin@123!' }))

    expect(result.type).toBe('auth/login/rejected')
    expect(result.payload).toBe(
      'Session storage is unavailable in this browser. Allow site data for this address, then reload.',
    )
    expect(app.requests).toHaveLength(0)
    expect(app.store.getState().auth.isAuthenticated).toBe(false)
    expect(app.store.getState().auth.storageUnavailable).toBe(true)
  })

  it('a sign-in through the application reaches the bare client once and is mirrored into Redux', async () => {
    const app = await loadApp()
    await Promise.all([app.rehydrated(), app.sessionReady()])
    const { login } = await import('@/store/slices/authSlice')

    const result = await app.store.dispatch(login({ usernameOrEmail: 'admin', password: 'Admin@123!' }))

    expect(result.type).toBe('auth/login/fulfilled')
    expect(app.requests.map((config) => config.url)).toEqual(['/auth/login'])
    expect(app.requests[0].headers.Authorization).toBeUndefined()
    expect(app.store.getState().auth.sessionId).toBe(app.shared.state.record.session?.sessionId)
    expect(app.store.getState().auth.isAuthenticated).toBe(true)
  })

  it('a notification added after rehydration is written under the session and survives a reload', async () => {
    const session = storedSession()
    const first = await loadApp({ stored: { record: { revision: 3, session } } })
    await Promise.all([first.rehydrated(), first.sessionReady()])

    first.store.dispatch(addNotification({ type: 'success', title: 'written', message: 'm' }))
    await first.persistor.flush()
    expect(first.shared.state.slices?.sessionId).toBe(session.sessionId)
    expect(first.shared.state.slices?.json).toContain('written')

    const second = await loadApp({ stored: first.shared.state })
    await Promise.all([second.rehydrated(), second.sessionReady()])
    expect(titles(second.store.getState())).toEqual(['written'])
  })

  it('the slices storage adapter stamps the payload with the session it was produced under', async () => {
    const session = storedSession()
    const app = await loadApp({ stored: { record: { revision: 3, session } } })
    await Promise.all([app.rehydrated(), app.sessionReady()])
    await app.persistor.flush()
    const persistSlices = vi.spyOn(app.sessionRuntime, 'persistSlices')

    app.store.dispatch(addNotification({ type: 'success', title: 'under-x', message: 'm' }))
    // redux-persist hands the payload over inside flush(); the tab gives up its
    // claim before the write can run.
    const flushed = app.persistor.flush()
    const signedOut = app.sessionRuntime.signOut()
    await Promise.all([flushed, signedOut])

    const underX = persistSlices.mock.calls.find(([, json]) => json?.includes('under-x'))
    expect(underX?.[0]).toBe(session.sessionId)
    // Stamped X, executed after the claim was dropped: skipped, not stored.
    expect(app.shared.state.record.session).toBeNull()
    expect(app.shared.state.slices).toBeNull()
  })

  it('removal removes the slices stored for the current session', async () => {
    const session = storedSession()
    const app = await loadApp({
      stored: {
        record: { revision: 3, session },
        slices: { sessionId: session.sessionId, json: storedNotifications(['first']) },
      },
    })
    await Promise.all([app.rehydrated(), app.sessionReady()])
    expect(app.shared.state.slices).not.toBeNull()

    await app.persistor.purge()

    expect(app.shared.state.slices).toBeNull()
    expect(app.shared.state.record.session?.sessionId).toBe(session.sessionId)
  })

  it('removal while signed out writes nothing', async () => {
    const app = await loadApp({
      stored: {
        record: { revision: 3, session: null },
        slices: { sessionId: 'sess-someone-else', json: storedNotifications(['theirs']) },
      },
    })
    await Promise.all([app.rehydrated(), app.sessionReady()])
    const before = app.shared.state
    const persistSlices = vi.spyOn(app.sessionRuntime, 'persistSlices')

    await app.persistor.purge()

    expect(persistSlices).not.toHaveBeenCalled()
    expect(app.shared.state).toBe(before)
  })
})
