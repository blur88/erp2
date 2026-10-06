// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { store, RESET_FOR_SESSION_END } from '../index'
import { sessionEstablished, sessionEnded, storageUnavailable } from '../slices/authSlice'
import { addNotification } from '../slices/notificationSlice'
import { setSelectedCategory } from '../slices/inventorySlice'
import { setSelectedOrder } from '../slices/salesSlice'
import { setCurrentBackup } from '../slices/backupSlice'
import { setPage } from '../slices/auditLogSlice'
import { setPagination } from '../slices/priceListSlice'
import { PERSIST_KEY } from '../persistKey'
import { loadApp, persistedPayload, storedSession } from '@/session/__tests__/appHarness'

const apiReducerKeys = () =>
  Object.keys(store.getState()).filter((k) => k.endsWith('Api'))

const activeSession = {
  sessionId: 's2',
  generation: 2,
  accessToken: 'a2',
  accessTokenExpiresAt: 0,
  refreshToken: 'r2',
  user: { id: 'u2' } as never,
  rememberMe: false,
}

describe('session reset', () => {
  it('the reset keeps auth and clears the other plain slices', () => {
    store.dispatch(addNotification({ type: 'success', title: 'keep?', message: 'no' }))
    store.dispatch(sessionEstablished(activeSession))
    expect(store.getState().notifications.notifications).toHaveLength(1)

    store.dispatch({ type: RESET_FOR_SESSION_END })
    const state = store.getState()
    expect(state.auth.sessionId).toBe('s2')
    expect(state.notifications.notifications).toHaveLength(0)
  })

  it('storageUnavailable is reflected in state', () => {
    store.dispatch(storageUnavailable())
    expect(store.getState().auth.storageUnavailable).toBe(true)
    store.dispatch(sessionEnded())
  })

  it('exposes every API slice by reducer key', () => {
    expect(apiReducerKeys().length).toBeGreaterThanOrEqual(13)
  })
})

// The application's own modules, freshly loaded: the store, the session runtime
// and the events that connect them (`session/index.ts`).
describe('session ending in the application', () => {
  afterEach(() => {
    vi.doUnmock('@/session/store/indexedDbSessionStore')
    sessionStorage.clear()
    delete (window as unknown as { __erpSessionTimings?: unknown }).__erpSessionTimings
  })

  const signedInApp = async (options: Parameters<typeof loadApp>[0] = {}) => {
    const app = await loadApp({ stored: { record: { revision: 1, session: storedSession() } }, ...options })
    await Promise.all([app.rehydrated(), app.sessionReady()])
    return app
  }

  type AnyState = Record<string, unknown>
  const isApiState = (value: unknown): value is { queries: Record<string, unknown> } =>
    typeof value === 'object' && value !== null && 'queries' in value && 'mutations' in value && 'provided' in value

  it('sessionEnded resets every plain slice and every RTK Query cache', async () => {
    const app = await signedInApp()
    const { store, storeModule } = app
    const state = () => store.getState() as unknown as AnyState

    // The API slices are whatever the store's reducer holds, not a list kept here.
    const apiKeys = Object.keys(state()).filter((key) => isApiState(state()[key]))
    const plainKeys = Object.keys(state()).filter((key) => !apiKeys.includes(key) && key !== 'auth' && key !== '_persist')
    expect(plainKeys.sort()).toEqual(['auditLogs', 'backup', 'inventory', 'notifications', 'priceLists', 'sales'])
    expect(apiKeys.length).toBeGreaterThanOrEqual(13)

    // The session ending resets the store's one list of API slices, so the
    // reducer and the reset cannot drift apart.
    expect(storeModule.apiSlices.map((slice) => slice.reducerPath).sort()).toEqual([...apiKeys].sort())

    const initial = Object.fromEntries(plainKeys.map((key) => [key, state()[key]]))

    store.dispatch(setSelectedCategory({ id: 'c1', name: 'Seeded' } as never))
    store.dispatch(setSelectedOrder({ id: 'o1' } as never))
    store.dispatch(setCurrentBackup({ id: 'b1' } as never))
    store.dispatch(setPage(7))
    store.dispatch(setPagination({ page: 9 }))
    store.dispatch(addNotification({ type: 'success', title: 'seeded', message: 'm' }))
    for (const key of plainKeys) expect(state()[key], key).not.toEqual(initial[key])

    for (const slice of storeModule.apiSlices) {
      const endpoints = slice.endpoints as Record<string, object>
      const queryEndpoint = Object.keys(endpoints).find((name) => 'useQuery' in endpoints[name])
      expect(queryEndpoint, `${slice.reducerPath} has a query endpoint to seed`).toBeDefined()
      const upsert = slice.util.upsertQueryData as unknown as (name: string, arg: unknown, value: unknown) => never
      await store.dispatch(upsert(queryEndpoint as string, { seeded: true }, null))
      expect(Object.keys((state()[slice.reducerPath] as { queries: object }).queries), slice.reducerPath).toHaveLength(1)
    }

    const dispatch = vi.spyOn(store, 'dispatch')
    await app.sessionRuntime.signOut()

    expect(store.getState().auth.isAuthenticated).toBe(false)
    for (const key of plainKeys) expect(state()[key], key).toEqual(initial[key])
    for (const key of apiKeys) expect((state()[key] as { queries: object }).queries, key).toEqual({})
    // The root reset alone empties the reducers' state; `resetApiState` is what
    // also stops each slice's subscriptions and timers, so every slice must get it.
    const dispatched = dispatch.mock.calls.map(([action]) => (action as { type?: string }).type)
    for (const key of apiKeys) expect(dispatched, key).toContain(`${key}/resetApiState`)
  })

  it('the redux-persist migration to version 7 drops auth', async () => {
    const session = storedSession()
    // What a version-6 build persisted: `auth` beside `notifications`.
    const legacy = persistedPayload(
      {
        auth: { isAuthenticated: true, accessToken: 'legacy-token', sessionId: 'legacy', user: { id: 'legacy-user' } },
        notifications: {
          notifications: [{ id: 'n1', type: 'info', title: 'kept', message: 'm', timestamp: 't', read: false }],
          unreadCount: 1,
        },
      },
      6,
    )
    const app = await signedInApp({
      stored: { record: { revision: 1, session }, slices: { sessionId: session.sessionId, json: legacy } },
    })

    const state = app.store.getState() as unknown as { _persist: { version: number } } & ReturnType<typeof app.store.getState>
    expect(state._persist.version).toBe(7)
    expect(state.notifications.notifications.map((n) => n.title)).toEqual(['kept'])
    // `auth` is the runtime's mirror of the stored session, untouched by the payload.
    expect(state.auth.accessToken).toBe(session.accessToken)
    expect(state.auth.sessionId).toBe(session.sessionId)
    expect(state.auth.user).toEqual(session.user)
  })

  it('the legacy localStorage key persist:erp-app is removed on first load', async () => {
    const legacyKey = `persist:${PERSIST_KEY}`
    expect(legacyKey).toBe('persist:erp-app')

    await signedInApp({
      beforeImport: () => {
        localStorage.setItem(legacyKey, '{"auth":"{}"}')
        localStorage.setItem('unrelated', 'kept')
      },
    })

    expect(localStorage.getItem(legacyKey)).toBeNull()
    expect(localStorage.getItem('unrelated')).toBe('kept')
    localStorage.removeItem('unrelated')
  })

  it('the application attaches the resume listeners', async () => {
    const app = await signedInApp()
    const reconcileNow = vi.spyOn(app.sessionRuntime, 'reconcileNow')

    window.dispatchEvent(new Event('pageshow'))
    expect(reconcileNow).toHaveBeenCalledTimes(1)

    document.dispatchEvent(new Event('visibilitychange'))
    expect(document.visibilityState).toBe('visible')
    expect(reconcileNow).toHaveBeenCalledTimes(2)
  })

  it('timing is off by default', async () => {
    const timings = () => (window as unknown as { __erpSessionTimings?: unknown[] }).__erpSessionTimings

    const off = await signedInApp()
    await off.sessionRuntime.reconcileNow()
    expect(timings()).toBeUndefined()

    // The same read is recorded once the flag is set before load.
    const on = await signedInApp({ beforeImport: () => sessionStorage.setItem('erp-session-timing', '1') })
    await on.sessionRuntime.reconcileNow()
    expect(timings()?.length).toBeGreaterThan(0)
  })
})
