import { describe, it, expect, vi } from 'vitest'
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

  it('cancelled sign-in cleanup arriving after a newer session committed writes nothing', async () => {
    const h = createHarness()
    const a = h.createTab('A')
    const b = h.createTab('B')
    await a.runtime.start()
    await b.runtime.start()

    // A's commit completes, then its attempt is cancelled; before A's cleanup
    // transaction runs, B signs in over A's unclaimed session.
    const transact = a.store.transact.bind(a.store)
    let calls = 0
    vi.spyOn(a.store, 'transact').mockImplementation(async (decide, opts) => {
      calls += 1
      if (calls === 1) {
        const result = await transact(decide, opts)
        a.runtime.cancelSignIn()
        return result
      }
      if (calls === 2) await b.runtime.signIn({ usernameOrEmail: 'b', password: 'p' })
      return transact(decide, opts)
    })

    await expect(a.runtime.signIn({ usernameOrEmail: 'a', password: 'p' })).rejects.toBeInstanceOf(
      SessionChangedElsewhereError,
    )
    expect(calls).toBe(2)

    const bSession = b.runtime.claim()
    expect(bSession).toBeTruthy()
    // A committed (revision 1), B committed over it (revision 2); A's cleanup wrote nothing.
    expect(h.shared.state.record.revision).toBe(2)
    expect(h.shared.state.record.session?.sessionId).toBe(bSession)
    expect(b.runtime.status()).toBe('signed-in')
    expect(b.events.established).toBe(1)
    expect(b.events.ended).toEqual([])
    expect(await b.runtime.canDeliver((await b.runtime.beginRequest()).ref)).toBe(true)
    expect(a.runtime.claim()).toBeNull()
    expect(a.events.established).toBe(0)
  })
})
