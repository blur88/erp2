import { describe, it, expect } from 'vitest'
import { createHarness } from './twoTabs'
import { SessionChangedElsewhereError } from '../runtime'

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('session runtime — sign-in and startup', () => {
  it('start with a stored session claims it; start with none is signed-out', async () => {
    const h = createHarness()
    const a = h.createTab('A')
    await a.runtime.start()
    expect(a.runtime.status()).toBe('signed-out')

    const b = h.createTab('B')
    await b.runtime.start()
    await b.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })

    const c = h.createTab('C')
    await c.runtime.start()
    expect(c.runtime.status()).toBe('signed-in')
    expect(c.runtime.claim()).toBe(b.runtime.claim())
  })

  it('a signed-out running tab never adopts a session another tab stored', async () => {
    const h = createHarness()
    const a = h.createTab('A')
    const b = h.createTab('B')
    await a.runtime.start()
    await b.runtime.start()

    await b.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    a.deliverChannel()

    expect(a.runtime.status()).toBe('signed-out')
    expect(a.events.sessionEstablished).not.toHaveBeenCalled()
  })

  it('sign-in commits, claims and dispatches once', async () => {
    const h = createHarness()
    const a = h.createTab('A')
    await a.runtime.start()
    const result = await a.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })

    expect(result.requiresPasswordChange).toBe(false)
    expect(a.runtime.status()).toBe('signed-in')
    expect(a.runtime.claim()).toBeTruthy()
    expect(a.events.sessionEstablished).toHaveBeenCalledTimes(1)
    expect(a.channelPost).toHaveBeenCalledTimes(1)
  })

  it('a sign-in that loses the revision check revokes its own session and writes nothing', async () => {
    const h = createHarness()
    const a = h.createTab('A')
    await a.runtime.start()

    // A holds its login response.
    h.server.loginHold = true
    const promise = a.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    const guarded = promise.catch((e) => e)

    // B commits a sign-out, raising revision.
    const b = h.createTab('B')
    await b.runtime.start()
    await b.runtime.signOut()
    await flush()

    await expect(guarded).resolves.toBeInstanceOf(SessionChangedElsewhereError)
    expect(a.runtime.claim()).toBeNull()
    expect(a.events.sessionEstablished).not.toHaveBeenCalled()
    // A's newly created session was revoked best-effort.
    expect(h.server.logoutCalls.length).toBeGreaterThanOrEqual(1)
  })

  it('a failed best-effort logout changes nothing in the browser', async () => {
    const h = createHarness()
    const a = h.createTab('A')
    await a.runtime.start()
    h.server.loginHold = true
    const promise = a.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    const guarded = promise.catch((e) => e)
    const b = h.createTab('B')
    await b.runtime.start()
    await b.runtime.signOut()
    await flush()
    await expect(guarded).resolves.toBeInstanceOf(SessionChangedElsewhereError)
    expect(a.runtime.claim()).toBeNull()
  })

  it('a newer attempt in the same tab supersedes an older one', async () => {
    const h = createHarness()
    const a = h.createTab('A')
    await a.runtime.start()
    h.server.loginHold = true
    const first = a.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    const firstGuarded = first.catch((e) => e)
    const second = a.runtime.signIn({ usernameOrEmail: 'u2', password: 'p' })
    await flush()
    await expect(firstGuarded).resolves.toBeInstanceOf(SessionChangedElsewhereError)
    await expect(second).resolves.toBeDefined()
    expect(a.runtime.claim()).toBeTruthy()
  })

  it('cancelSignIn invalidates the pending attempt', async () => {
    const h = createHarness()
    const a = h.createTab('A')
    await a.runtime.start()
    h.server.loginHold = true
    const promise = a.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    const guarded = promise.catch((e) => e)
    a.runtime.cancelSignIn()
    await flush()
    await expect(guarded).resolves.toBeInstanceOf(SessionChangedElsewhereError)
  })

  it('cancelled sign-in whose commit already completed runs conditional cleanup', async () => {
    const h = createHarness()
    const a = h.createTab('A')
    await a.runtime.start()
    h.server.loginHold = true
    const promise = a.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    const guarded = promise.catch((e) => e)
    a.runtime.cancelSignIn()
    await flush()
    await expect(guarded).resolves.toBeInstanceOf(SessionChangedElsewhereError)
    expect(a.runtime.claim()).toBeNull()
    const record = await a.store.read()
    expect(record.record.session).toBeNull()
  })

  it('a sign-in over a live session sends that displaced session\u2019s logout', async () => {
    const h = createHarness()
    const a = h.createTab('A')
    await a.runtime.start()
    const first = await a.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })
    expect(first).toBeDefined()
    const before = h.server.logoutCalls.length
    await a.runtime.signIn({ usernameOrEmail: 'u2', password: 'p' })
    expect(h.server.logoutCalls.length).toBeGreaterThan(before)
  })
})
