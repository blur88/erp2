import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { SessionCoordinator } from '../coordinator'
import { IndexedDbSessionStorage } from '../storage'
import type { AuthResponse } from '@/store/slices/authSlice'

const response = { accessToken: 'access', refreshToken: 'refresh', user: { id: 'alice' }, expiresIn: 900 } as AuthResponse

describe('shared session', () => {
  it('a tab with a dropped notification checks storage before using credentials; reload cannot resurrect it', async () => {
    const indexedDB = new IDBFactory()
    const tab = () => new SessionCoordinator({ storage: new IndexedDbSessionStorage(indexedDB), legacyStorage: { removeItem() {} } })
    const a = tab(), b = tab()
    await a.start()
    await a.signIn(response, true)
    await b.start()
    const session = await b.credentialsForRequest()
    expect(session?.accessToken).toBe('access')
    await b.signOut(session!.id)
    expect(await a.credentialsForRequest()).toBeNull()
    const restored = tab()
    expect(await restored.start()).toBeNull()
    a.dispose(); b.dispose(); restored.dispose()
  })
})

it('an old sign-out and late refresh never delete or recreate a newer session', async () => {
  const factory = new IDBFactory()
  const a = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory) })
  const b = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory) })
  await a.start(); await b.start()
  const old = (await a.signIn(response))!
  await b.signOut(old.id)
  expect(await a.saveRefresh(old.id, 'refresh', { ...response, accessToken: 'late' })).toBeNull()
  const newer = (await b.signIn({ ...response, accessToken: 'new' }))!
  expect(newer.id).not.toBe(old.id)
  await a.signOut(old.id)
  expect((await b.credentialsForRequest())?.accessToken).toBe('new')
  await a.signOut(newer.id, 'stale-token')
  expect((await b.credentialsForRequest())?.id).toBe(newer.id)
  a.dispose(); b.dispose()
})

it('interleaved single-field writers preserve tokens, remember-me and the latest activity', async () => {
  const factory = new IDBFactory()
  const a = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory), clock: () => 10 })
  const b = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory) })
  await a.start(); await b.start()
  const session = (await a.signIn(response))!
  await Promise.all([
    a.updateField(session.id, 'lastActivity', 30),
    b.updateField(session.id, 'rememberMe', true),
    a.saveRefresh(session.id, 'refresh', { ...response, accessToken: 'rotated', refreshToken: 'rotated-refresh' }),
    b.updateField(session.id, 'lastActivity', 20),
  ])
  expect(await a.credentialsForRequest()).toMatchObject({ accessToken: 'rotated', refreshToken: 'rotated-refresh', rememberMe: true, lastActivity: 30 })
  await b.signOut(session.id)
  expect(await a.updateField(session.id, 'accessToken', 'resurrected')).toBeNull()
  a.dispose(); b.dispose()
})

it('removes legacy storage without reading it', async () => {
  const removed: string[] = []
  const legacyStorage = { removeItem: (key: string) => { removed.push(key) }, getItem: () => { throw new Error('must never read legacy auth') } }
  const coordinator = new SessionCoordinator({ storage: new IndexedDbSessionStorage(new IDBFactory()), legacyStorage })
  expect(await coordinator.start()).toBeNull()
  expect(removed).toEqual(['persist:erp-app', 'persist:erp-notifications'])
  coordinator.dispose()
})

it('open failure prevents start and sign-in with the storage-unavailable message', async () => {
  const coordinator = new SessionCoordinator({ storage: new IndexedDbSessionStorage(undefined) })
  await expect(coordinator.start()).rejects.toThrow("This browser's storage is unavailable")
  await expect(coordinator.signIn(response)).rejects.toThrow("This browser's storage is unavailable")
  expect(coordinator.getSnapshot()).toBeNull()
  coordinator.dispose()
})

it('runtime failure stops reads and writes without trusting the local view', async () => {
  const storage = new IndexedDbSessionStorage(new IDBFactory())
  const coordinator = new SessionCoordinator({ storage })
  await coordinator.start()
  const session = (await coordinator.signIn(response))!
  storage.close()
  await expect(coordinator.credentialsForRequest()).rejects.toThrow('not open')
  await expect(coordinator.updateField(session.id, 'lastActivity', 100)).rejects.toThrow('not open')
  await expect(coordinator.signOut(session.id)).rejects.toThrow('not open')
  coordinator.dispose()
})

it('dispose releases subscriptions and the injected channel and forbids further operations', async () => {
  let calls = 0, closed = 0
  const coordinator = new SessionCoordinator({ storage: new IndexedDbSessionStorage(new IDBFactory()), channel: { postMessage() {}, close() { closed++ } } })
  await coordinator.start()
  coordinator.subscribe(() => calls++)
  await coordinator.signIn(response)
  expect(calls).toBe(1)
  coordinator.dispose()
  expect(closed).toBe(1)
  await expect(coordinator.credentialsForRequest()).rejects.toThrow('disposed')
  expect(calls).toBe(1)
})

it('a pending login is invalidated by another tab signing out, even when it began signed out', async () => {
  const factory = new IDBFactory()
  const a = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory) })
  const b = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory) })
  await a.start(); await b.start()
  const attempt = await a.beginSignIn()
  const ended = (await b.signIn(response))!
  await b.signOut(ended.id)
  expect(await a.signIn(response, false, attempt)).toBeNull()
  expect(await b.credentialsForRequest()).toBeNull()
  // No sign-in ordering is imposed on two attempts with a valid context.
  const first = await a.beginSignIn(), second = await b.beginSignIn()
  await a.signIn({ ...response, accessToken: 'first' }, false, first)
  await b.signIn({ ...response, accessToken: 'second' }, false, second)
  expect((await a.credentialsForRequest())?.accessToken).toBe('second')
  a.dispose(); b.dispose()
})

it('storage denial when accessing indexedDB is reported at start rather than crashing construction', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB')
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get() { throw new Error('Storage access denied') } })
  try {
    const coordinator = new SessionCoordinator({ storage: new IndexedDbSessionStorage() })
    await expect(coordinator.start()).rejects.toThrow("This browser's storage is unavailable")
    coordinator.dispose()
  } finally {
    if (descriptor) Object.defineProperty(globalThis, 'indexedDB', descriptor)
    else delete (globalThis as any).indexedDB
  }
})

it('delivered hints mirror sign-in and sign-out without a request or observer writes', async () => {
  const factory = new IDBFactory()
  const receivers = new Set<() => void>()
  let broadcasts = 0
  const channel = () => {
    let listener: (() => void) | undefined
    return {
      postMessage() { broadcasts++; for (const receiver of receivers) if (receiver !== listener) receiver() },
      subscribe(callback: () => void) { listener = callback; receivers.add(callback); return () => { receivers.delete(callback) } },
      close() {},
    }
  }
  const a = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory), channel: channel() })
  const observerStorage = new IndexedDbSessionStorage(factory)
  const observerWrite = vi.spyOn(observerStorage, 'change')
  const b = new SessionCoordinator({ storage: observerStorage, channel: channel() })
  await a.start(); await b.start()
  const signedIn = new Promise<void>(resolve => b.subscribe(session => { if (session) resolve() }))
  const session = (await a.signIn(response))!
  await signedIn
  expect(b.getSnapshot()?.id).toBe(session.id)
  const signedOut = new Promise<void>(resolve => b.subscribe(value => { if (!value) resolve() }))
  await a.signOut(session.id)
  await signedOut
  expect(b.getSnapshot()).toBeNull()
  expect(broadcasts).toBe(2)
  expect(observerWrite).not.toHaveBeenCalled()
  a.dispose(); b.dispose()
}, 1000)

it.each(['focus', 'pageshow', 'visibilitychange'])('a dropped hint is reconciled on %s and cleanup precedes adoption', async event => {
  const factory = new IDBFactory()
  const target = new EventTarget()
  let delivered: (() => void) | undefined
  const drop = true
  const a = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory), channel: {
    postMessage() { if (!drop) delivered?.() }, close() {},
  } })
  const cleanup: Array<string | null | undefined> = []
  const b = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory),
    resumeTargets: { window: target, document: target },
    channel: { postMessage() { throw new Error('observer must never rebroadcast') }, close() {}, subscribe(listener) { delivered = listener; return () => { delivered = undefined } } },
    cleanup() { cleanup.push(b.getSnapshot()?.id ?? null) },
  })
  await a.start()
  const old = (await a.signIn(response))!
  await b.start()
  const newer = (await a.signIn({ ...response, accessToken: 'new' }))!
  expect(b.getSnapshot()?.id).toBe(old.id)
  const mirrored = new Promise<void>(resolve => b.subscribe(session => { if (session?.id === newer.id) resolve() }))
  target.dispatchEvent(new Event(event))
  await mirrored
  expect(cleanup).toEqual([null])
  expect((await a.credentialsForRequest())?.id).toBe(newer.id)
  const ended = new Promise<void>(resolve => b.subscribe(session => { if (!session) resolve() }))
  await a.signOut(newer.id)
  expect(b.getSnapshot()?.id).toBe(newer.id)
  target.dispatchEvent(new Event(event))
  await ended
  expect(b.getSnapshot()).toBeNull()
  expect(cleanup).toEqual([null, null])
  b.dispose(); a.dispose()
  expect(delivered).toBeUndefined()
})

it('two tabs share one refresh and both reuse the rotated credentials', async () => {
  const factory = new IDBFactory()
  const a = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory) })
  const b = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory) })
  await a.start(); await b.start()
  const session = (await a.signIn(response))!
  let finish!: (value: AuthResponse) => void
  const refresh = vi.fn(() => new Promise<AuthResponse>(resolve => { finish = resolve }))
  const first = a.refreshAfter401(session.id, 'access', refresh)
  const second = b.refreshAfter401(session.id, 'access', refresh)
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
  finish({ ...response, accessToken: 'new-access', refreshToken: 'new-refresh' })
  expect((await Promise.all([first, second])).map(value => value.accessToken)).toEqual(['new-access', 'new-access'])
  expect(refresh).toHaveBeenCalledTimes(1)
  a.dispose(); b.dispose()
})

it('reuses a newer token before acquiring the lock', async () => {
  const factory = new IDBFactory()
  const a = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory) })
  const b = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory) })
  await a.start(); await b.start()
  const session = (await a.signIn(response))!
  await b.saveRefresh(session.id, 'refresh', { ...response, accessToken: 'new', refreshToken: 'new-refresh' })
  const refresh = vi.fn()
  expect((await a.refreshAfter401(session.id, 'access', refresh)).accessToken).toBe('new')
  expect(refresh).not.toHaveBeenCalled()
  a.dispose(); b.dispose()
})

it('reuses a newer token found inside the acquisition transaction', async () => {
  const factory = new IDBFactory()
  const storage = new IndexedDbSessionStorage(factory)
  const a = new SessionCoordinator({ storage })
  const b = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory) })
  await a.start(); await b.start()
  const session = (await a.signIn(response))!
  const acquire = storage.acquireRefreshLock.bind(storage)
  vi.spyOn(storage, 'acquireRefreshLock').mockImplementationOnce(async (...args) => {
    await b.saveRefresh(session.id, 'refresh', { ...response, accessToken: 'new', refreshToken: 'new-refresh' })
    return acquire(...args)
  })
  const refresh = vi.fn()
  expect((await a.refreshAfter401(session.id, 'access', refresh)).accessToken).toBe('new')
  expect(refresh).not.toHaveBeenCalled()
  a.dispose(); b.dispose()
})

it('429 preserves the session, releases the lock and never retries automatically', async () => {
  const factory = new IDBFactory()
  const a = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory) })
  const b = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory) })
  await a.start(); await b.start()
  const session = (await a.signIn(response))!
  const error = Object.assign(new Error('rate limited'), { response: { status: 429 } })
  const rejected = vi.fn().mockRejectedValue(error)
  await expect(a.refreshAfter401(session.id, 'access', rejected)).rejects.toBe(error)
  expect(rejected).toHaveBeenCalledTimes(1)
  expect((await a.credentialsForRequest())?.id).toBe(session.id)
  const refresh = vi.fn().mockResolvedValue({ ...response, accessToken: 'new', refreshToken: 'new-refresh' })
  expect((await b.refreshAfter401(session.id, 'access', refresh)).accessToken).toBe('new')
  expect(refresh).toHaveBeenCalledOnce()
  a.dispose(); b.dispose()
})

it('a normal refresh 401 ends only the matching session', async () => {
  const a = new SessionCoordinator({ storage: new IndexedDbSessionStorage(new IDBFactory()) })
  await a.start()
  const session = (await a.signIn(response))!
  const error = Object.assign(new Error('unauthorized'), { response: { status: 401 } })
  await expect(a.refreshAfter401(session.id, 'access', vi.fn().mockRejectedValue(error))).rejects.toBe(error)
  expect(await a.credentialsForRequest()).toBeNull()
  a.dispose()
})

it('timeout and takeover 401 both leave the lock until expiry and preserve the session', async () => {
  let now = 1000
  const factory = new IDBFactory()
  const storage = new IndexedDbSessionStorage(factory)
  const a = new SessionCoordinator({ storage, clock: () => now })
  await a.start()
  const session = (await a.signIn(response))!
  const timeout = Object.assign(new Error('timeout'), { code: 'ECONNABORTED' })
  await expect(a.refreshAfter401(session.id, 'access', vi.fn().mockRejectedValue(timeout))).rejects.toBe(timeout)
  let attempt = await storage.acquireRefreshLock(session.id, 'access', 'probe', now)
  expect(attempt.acquired).toBe(false)
  now += 15000
  const unauthorized = Object.assign(new Error('unauthorized'), { response: { status: 401 } })
  await expect(a.refreshAfter401(session.id, 'access', vi.fn().mockRejectedValue(unauthorized))).rejects.toBe(unauthorized)
  expect((await a.credentialsForRequest())?.id).toBe(session.id)
  attempt = await storage.acquireRefreshLock(session.id, 'access', 'probe', now)
  expect(attempt.acquired).toBe(false)
  now += 15000
  expect((await storage.acquireRefreshLock(session.id, 'access', 'probe', now)).acquired).toBe(true)
  a.dispose()
})

it('a successful refresh that cannot be saved leaves the lock to expire', async () => {
  const storage = new IndexedDbSessionStorage(new IDBFactory())
  const a = new SessionCoordinator({ storage })
  await a.start()
  const session = (await a.signIn(response))!
  vi.spyOn(storage, 'change').mockRejectedValueOnce(new Error('write failed'))
  await expect(a.refreshAfter401(session.id, 'access', vi.fn().mockResolvedValue({ ...response, accessToken: 'new' }))).rejects.toThrow('write failed')
  expect((await storage.acquireRefreshLock(session.id, 'access', 'probe', Date.now())).acquired).toBe(false)
  a.dispose()
})

it('rejects a refresh result when the refresh token changes while it is in flight', async () => {
  const factory = new IDBFactory()
  const a = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory) })
  const b = new SessionCoordinator({ storage: new IndexedDbSessionStorage(factory) })
  await a.start(); await b.start()
  const session = (await a.signIn(response))!
  let finish!: (value: AuthResponse) => void
  const refresh = vi.fn(() => new Promise<AuthResponse>(resolve => { finish = resolve }))
  const result = a.refreshAfter401(session.id, 'access', refresh)
  const rejected = expect(result).rejects.toThrow('Session ended during refresh')
  await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce())
  await b.saveRefresh(session.id, 'refresh', { ...response, accessToken: 'other', refreshToken: 'other-refresh' })
  finish({ ...response, accessToken: 'late', refreshToken: 'late-refresh' })
  await rejected
  expect(await b.credentialsForRequest()).toMatchObject({ accessToken: 'other', refreshToken: 'other-refresh' })
  a.dispose(); b.dispose()
})
