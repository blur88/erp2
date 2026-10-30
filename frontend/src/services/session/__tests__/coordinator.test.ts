import { IDBFactory } from 'fake-indexeddb'
import { describe, expect, it } from 'vitest'
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
  expect(removed).toEqual(['persist:erp-app'])
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
