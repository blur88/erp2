import { describe, it, expect, vi } from 'vitest'
import { createHarness, holdLoginResponses, type Tab } from './twoTabs'
import { SessionChangedElsewhereError } from '../runtime'
import { SessionEndedError, StorageTimeoutError, StorageUnavailableError } from '../types'

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

  // A's sign-in is pending (the server answered, the response is held) while B
  // signs out the existing session, which raises the revision A captured.
  async function signInLosingTheRevisionCheck(h: ReturnType<typeof createHarness>) {
    const a = h.createTab('A')
    await a.runtime.start()
    const b = h.createTab('B')
    await b.runtime.start()
    await b.runtime.signIn({ usernameOrEmail: 'b', password: 'p' })
    const existing = { ...h.shared.state.record.session! }
    expect(a.runtime.status()).toBe('signed-out')

    const login = holdLoginResponses(h.server)
    const outcome = a.runtime.signIn({ usernameOrEmail: 'a', password: 'p' }).then(
      (value) => ({ value }),
      (error: unknown) => ({ error }),
    )
    await vi.waitFor(() => expect(login.waiting()).toBe(1))
    const created = [...h.server.sessions.values()].find((x) => x.sessionId !== existing.sessionId)!

    await b.runtime.signOut()
    const published = h.shared.state
    expect(published.record).toEqual({ revision: 2, session: null })
    const sentBefore = [...h.server.logoutCalls]
    expect(sentBefore).toEqual([existing.refreshToken])

    login.release()
    return { a, b, created, published, outcome: await outcome }
  }

  it('a sign-in that loses the revision check revokes its own session and writes nothing', async () => {
    const h = createHarness()
    const { a, created, published, outcome } = await signInLosingTheRevisionCheck(h)

    expect(outcome).toEqual({ error: expect.any(SessionChangedElsewhereError) })
    // The stored record is unchanged by A.
    expect(h.shared.state).toBe(published)
    // The server received logout with A's new refresh token, after B's own.
    expect(h.server.logoutCalls).toHaveLength(2)
    expect(h.server.logoutCalls[1]).toBe(created.refreshToken)
    expect(created.revoked).toBe(true)
    expect(a.runtime.claim()).toBeNull()
    expect(a.events.sessionEstablished).not.toHaveBeenCalled()
    expect(a.channelPost).not.toHaveBeenCalled()
  })

  it('a failed best-effort logout changes nothing in the browser', async () => {
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    try {
      const h = createHarness()
      h.server.logoutFailure = new Error('logout failed')
      const { a, b, created, published, outcome } = await signInLosingTheRevisionCheck(h)

      // The sign-in fails as it would have: the logout's failure is not what it reports.
      expect(outcome).toEqual({ error: expect.any(SessionChangedElsewhereError) })
      // Both logouts were attempted and both failed; neither revoked anything.
      expect(h.server.logoutCalls).toHaveLength(2)
      expect(h.server.logoutCalls[1]).toBe(created.refreshToken)
      expect(created.revoked).toBe(false)

      // Nothing in the browser differs from the case where the logout succeeded.
      expect(h.shared.state).toBe(published)
      for (const tab of [a, b]) {
        expect(tab.runtime.status()).toBe('signed-out')
        expect(tab.runtime.claim()).toBeNull()
        expect(tab.events.ended).not.toContain('storage')
      }
      expect(a.events.sessionEstablished).not.toHaveBeenCalled()
      expect(a.events.sessionEnded).not.toHaveBeenCalled()
      expect(a.channelPost).not.toHaveBeenCalled()

      // And the tab can sign in afterwards.
      h.server.logoutFailure = null
      await expect(a.runtime.signIn({ usernameOrEmail: 'a', password: 'p' })).resolves.toBeDefined()

      // Nothing escaped: an unhandled rejection is reported after a full turn.
      await new Promise((r) => setTimeout(r, 10))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
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

  // Tabs B1 and B2 hold S; tab A has been open and signed-out since before S existed.
  async function tabsHoldingS() {
    const h = createHarness()
    const a = h.createTab('A')
    await a.runtime.start()
    const b1 = h.createTab('B1')
    await b1.runtime.start()
    await b1.runtime.signIn({ usernameOrEmail: 'b', password: 'p' })
    const b2 = h.createTab('B2')
    await b2.runtime.start()
    const s = { ...h.shared.state.record.session! }
    expect(b2.runtime.claim()).toBe(s.sessionId)
    expect(a.runtime.status()).toBe('signed-out')
    // The session A's sign-in makes the server create, once it has.
    const created = () => [...h.server.sessions.values()].find((x) => x.sessionId !== s.sessionId)!
    return { h, a, b1, b2, s, created, revision: h.shared.state.record.revision }
  }

  it('a sign-in cancelled while its commit is queued writes nothing and leaves the other tabs\u2019 session live', async () => {
    const { h, a, b1, b2, s, created, revision } = await tabsHoldingS()
    const before = h.shared.state

    // A's login response arrives and its commit is queued behind the hold.
    const hold = a.store.holdNextTransaction()
    const transact = vi.spyOn(a.store, 'transact')
    const guarded = a.runtime.signIn({ usernameOrEmail: 'a', password: 'p' }).catch((e) => e)
    await vi.waitFor(() => expect(transact).toHaveBeenCalledTimes(1))
    expect(h.server.sessions.size).toBe(2)

    a.runtime.cancelSignIn()
    hold.release()

    await expect(guarded).resolves.toBeInstanceOf(SessionChangedElsewhereError)
    // Nothing was written: the stored state is the same object.
    expect(h.shared.state).toBe(before)
    expect(h.shared.state.record).toEqual({ revision, session: s })

    // The session the sign-in created was logged out; S was not.
    expect(h.server.logoutCalls).toEqual([created().refreshToken])
    expect(h.server.sessions.get(s.sessionId)!.revoked).toBe(false)

    for (const b of [b1, b2]) {
      b.deliverChannel()
      await flush()
      expect(b.runtime.status()).toBe('signed-in')
      expect(b.events.ended).toEqual([])
      expect(await b.runtime.canDeliver((await b.runtime.beginRequest()).ref)).toBe(true)
    }

    expect(a.runtime.claim()).toBeNull()
    expect(a.runtime.status()).toBe('signed-out')
    expect(a.events.sessionEstablished).not.toHaveBeenCalled()
    expect(a.events.tokensUpdated).not.toHaveBeenCalled()
    expect(a.events.sessionEnded).not.toHaveBeenCalled()
    expect(a.channelPost).not.toHaveBeenCalled()
    // Only the commit was attempted: there was nothing to clean up.
    expect(transact).toHaveBeenCalledTimes(1)
  })

  it('a sign-in cancelled after its commit completed revokes its own session and the one it displaced, and posts', async () => {
    const { h, a, b1, s, created, revision } = await tabsHoldingS()

    // The cancellation lands between the transaction's decision and the code after it.
    const transact = a.store.transact.bind(a.store)
    let calls = 0
    let committed: unknown = null
    vi.spyOn(a.store, 'transact').mockImplementation(async (decide, opts) => {
      calls += 1
      const result = await transact(decide, opts)
      if (calls === 1) {
        committed = h.shared.state.record.session?.sessionId
        a.runtime.cancelSignIn()
      }
      return result
    })

    await expect(a.runtime.signIn({ usernameOrEmail: 'a', password: 'p' })).rejects.toBeInstanceOf(
      SessionChangedElsewhereError,
    )

    // The commit did displace S, and the cleanup then cleared its own session.
    expect(committed).toBe(created().sessionId)
    expect(calls).toBe(2)
    expect(h.shared.state.record).toEqual({ revision: revision + 2, session: null })
    expect(h.shared.state.slices).toBeNull()

    expect([...h.server.logoutCalls].sort()).toEqual([created().refreshToken, s.refreshToken].sort())
    expect(a.channelPost).toHaveBeenCalledTimes(1)
    expect(a.runtime.claim()).toBeNull()
    expect(a.runtime.status()).toBe('signed-out')
    expect(a.events.sessionEstablished).not.toHaveBeenCalled()
    expect(a.events.sessionEnded).not.toHaveBeenCalled()

    // The tabs that held S learn from the stored record that it is gone.
    b1.deliverChannel()
    await flush()
    expect(b1.events.ended).toEqual(['elsewhere'])
  })

  it('a sign-in whose commit times out logs out the session the server created', async () => {
    const { h, a, b1, s, created, revision } = await tabsHoldingS()
    const before = h.shared.state
    vi.spyOn(a.store, 'transact').mockRejectedValueOnce(new StorageTimeoutError('transaction timed out'))

    await expect(a.runtime.signIn({ usernameOrEmail: 'a', password: 'p' })).rejects.toBeInstanceOf(
      StorageTimeoutError,
    )

    expect(h.server.logoutCalls).toEqual([created().refreshToken])
    expect(h.shared.state).toBe(before)
    expect(h.shared.state.record).toEqual({ revision, session: s })
    // A timeout is not storage found broken, and it signs nobody out.
    expect(a.runtime.status()).toBe('signed-out')
    expect(a.events.sessionEnded).not.toHaveBeenCalled()
    expect(a.events.sessionEstablished).not.toHaveBeenCalled()
    expect(a.channelPost).not.toHaveBeenCalled()
    expect(b1.runtime.status()).toBe('signed-in')

    // The attempt is over: the tab can sign in again.
    await expect(a.runtime.signIn({ usernameOrEmail: 'a', password: 'p' })).resolves.toBeDefined()
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
    // Nothing was cleaned up, so there is nothing to announce.
    expect(a.channelPost).not.toHaveBeenCalled()
  })

  it('a failed storage read at sign-in puts the tab in the storage-unavailable state and sends no sign-in', async () => {
    const h = createHarness()
    const a = h.createTab('A')
    await a.runtime.start()
    a.store.failNextRead(new StorageUnavailableError('gone'))

    await expect(a.runtime.signIn({ usernameOrEmail: 'u', password: 'p' })).rejects.toBeInstanceOf(
      StorageUnavailableError,
    )
    expect(a.runtime.status()).toBe('storage-unavailable')
    expect(a.events.ended).toContain('storage')
    expect(h.server.sessions.size).toBe(0)
  })
})

// A start-up read that times out: storage did not answer. It has not been
// found broken, and nothing says the browser holds no session.
describe('session runtime — a start-up read that times out', () => {
  const timeout = () => new StorageTimeoutError('read timed out')

  // B holds a session (unless told otherwise); A starts while storage is busy.
  async function startedWhileBusy(opts: { stored?: boolean } = {}) {
    const h = createHarness()
    const b = h.createTab('B')
    await b.runtime.start()
    if (opts.stored !== false) await b.runtime.signIn({ usernameOrEmail: 'b', password: 'p' })
    const a = h.createTab('A')
    a.store.failNextRead(timeout())
    await a.runtime.start()
    return { h, a, b }
  }

  it('start with a read that times out is neither signed-out nor storage-unavailable', async () => {
    const { h, a, b } = await startedWhileBusy()

    expect(a.runtime.status()).toBe('storage-waiting')
    expect(a.runtime.status()).not.toBe('signed-out')
    expect(a.runtime.status()).not.toBe('storage-unavailable')
    expect(a.runtime.claim()).toBeNull()
    expect(a.events.waiting).toEqual([true])
    // Nobody was signed out and nothing was reported as broken.
    expect(a.events.sessionEnded).not.toHaveBeenCalled()
    expect(a.events.sessionEstablished).not.toHaveBeenCalled()
    expect(h.shared.state.record.session?.sessionId).toBe(b.runtime.claim())
    expect(b.runtime.status()).toBe('signed-in')
  })

  it('whenStarted settles in that state', async () => {
    const { a } = await startedWhileBusy()
    await expect(a.runtime.whenStarted()).resolves.toBeUndefined()
    expect(a.runtime.status()).toBe('storage-waiting')
  })

  it('retrying after the block clears claims the stored session', async () => {
    const { h, a, b } = await startedWhileBusy()

    await a.runtime.retryStart()

    expect(a.runtime.status()).toBe('signed-in')
    expect(a.runtime.claim()).toBe(b.runtime.claim())
    expect(a.events.sessionEstablished).toHaveBeenCalledTimes(1)
    expect(a.events.sessionEstablished).toHaveBeenCalledWith(h.shared.state.record.session)
    expect(a.events.waiting).toEqual([true, false])
    expect(a.events.sessionEnded).not.toHaveBeenCalled()
    expect(await a.runtime.canDeliver((await a.runtime.beginRequest()).ref)).toBe(true)
    // Claiming at start writes nothing and announces nothing.
    expect(a.channelPost).not.toHaveBeenCalled()
  })

  it('retrying with nothing stored is signed-out', async () => {
    const { a } = await startedWhileBusy({ stored: false })

    await a.runtime.retryStart()

    expect(a.runtime.status()).toBe('signed-out')
    expect(a.runtime.claim()).toBeNull()
    expect(a.events.waiting).toEqual([true, false])
    expect(a.events.sessionEstablished).not.toHaveBeenCalled()
    expect(a.events.sessionEnded).not.toHaveBeenCalled()
    // An ordinary signed-out tab: it can sign in.
    await expect(a.runtime.signIn({ usernameOrEmail: 'a', password: 'p' })).resolves.toBeDefined()
  })

  it('a retry that fails as unavailable becomes storage-unavailable', async () => {
    const { a } = await startedWhileBusy()
    a.store.failNextRead(new StorageUnavailableError('gone'))

    await expect(a.runtime.retryStart()).resolves.toBeUndefined()

    expect(a.runtime.status()).toBe('storage-unavailable')
    expect(a.events.ended).toEqual(['storage'])
    expect(a.events.sessionEstablished).not.toHaveBeenCalled()
  })

  it('a retry that times out again stays where it is', async () => {
    const { a } = await startedWhileBusy()
    a.store.failNextRead(timeout())

    await expect(a.runtime.retryStart()).resolves.toBeUndefined()

    expect(a.runtime.status()).toBe('storage-waiting')
    expect(a.events.waiting).toEqual([true])
    expect(a.events.sessionEnded).not.toHaveBeenCalled()

    await a.runtime.retryStart()
    expect(a.runtime.status()).toBe('signed-in')
  })

  it('signIn is refused in that state', async () => {
    const { h, a } = await startedWhileBusy()
    const sessions = h.server.sessions.size
    const read = vi.spyOn(a.store, 'read')
    const before = h.shared.state

    await expect(a.runtime.signIn({ usernameOrEmail: 'a', password: 'p' })).rejects.toBeInstanceOf(
      StorageTimeoutError,
    )

    // No login request was sent: the server created nothing.
    expect(h.server.sessions.size).toBe(sessions)
    expect(read).not.toHaveBeenCalled()
    expect(h.shared.state).toBe(before)
    expect(a.runtime.status()).toBe('storage-waiting')
  })

  it('no request begins and no slices are read in that state', async () => {
    const { a } = await startedWhileBusy()
    const read = vi.spyOn(a.store, 'read')

    await expect(a.runtime.beginRequest()).rejects.toBeInstanceOf(SessionEndedError)
    expect(await a.runtime.readSlices()).toBeNull()
    expect(read).not.toHaveBeenCalled()
    expect(a.runtime.status()).toBe('storage-waiting')
  })

  it('a channel message or a resume repeats the start-up read', async () => {
    const { a, b } = await startedWhileBusy()

    a.deliverChannel()
    await flush()
    expect(a.runtime.status()).toBe('signed-in')
    expect(a.runtime.claim()).toBe(b.runtime.claim())

    const { a: resumed } = await startedWhileBusy({ stored: false })
    await resumed.runtime.reconcileNow()
    expect(resumed.runtime.status()).toBe('signed-out')
  })

  it('retryStart does nothing in any other state', async () => {
    const h = createHarness()
    const a = h.createTab('A')
    const b = h.createTab('B')
    await a.runtime.start()
    await b.runtime.start()
    await b.runtime.signIn({ usernameOrEmail: 'b', password: 'p' })
    const read = vi.spyOn(a.store, 'read')

    // A signed-out running tab never adopts, by this path either.
    await a.runtime.retryStart()
    expect(read).not.toHaveBeenCalled()
    expect(a.runtime.status()).toBe('signed-out')
    expect(a.events.waiting).toEqual([])
  })

  it('storage closing while it waits makes it storage-unavailable', async () => {
    const { a } = await startedWhileBusy()
    a.store.close()
    expect(a.runtime.status()).toBe('storage-unavailable')
    expect(a.events.ended).toEqual(['storage'])
  })
})

// The sign-in commit completed, the attempt was cancelled, and the transaction
// that clears the record did not complete: the record holds a session no tab
// claims. A timeout means that transaction did not commit, so the same
// conditional transaction is what is tried again, a fixed number of times.
describe('session runtime \u2014 a cancelled sign-in whose cleanup does not complete', () => {
  const timeout = () => new StorageTimeoutError('transaction timed out')

  // A's first transaction (the sign-in commit) completes and the attempt is
  // cancelled before the code after it; each of A's next transactions fails
  // with what `failures` gives for it, uncommitted, and the rest run normally.
  function cancelAfterCommit(h: ReturnType<typeof createHarness>, a: Tab, failures: (n: number) => Error | null) {
    const inner = a.store.transact.bind(a.store)
    const counter = { transactions: 0 }
    vi.spyOn(a.store, 'transact').mockImplementation(async (decide, opts) => {
      counter.transactions += 1
      if (counter.transactions === 1) {
        const result = await inner(decide, opts)
        a.runtime.cancelSignIn()
        return result
      }
      const failure = failures(counter.transactions - 1)
      if (failure) throw failure
      return inner(decide, opts)
    })
    return counter
  }

  // B holds S; A, signed-out, signs in over it and cancels after the commit.
  async function cancelledSignIn(failures: (n: number) => Error | null) {
    const h = createHarness()
    const a = h.createTab('A')
    await a.runtime.start()
    const b = h.createTab('B')
    await b.runtime.start()
    await b.runtime.signIn({ usernameOrEmail: 'b', password: 'p' })
    const s = { ...h.shared.state.record.session! }
    const revision = h.shared.state.record.revision
    const counter = cancelAfterCommit(h, a, failures)

    const error: unknown = await a.runtime.signIn({ usernameOrEmail: 'a', password: 'p' }).then(
      () => null,
      (e: unknown) => e,
    )
    const created = [...h.server.sessions.values()].find((x) => x.sessionId !== s.sessionId)!
    return { h, a, b, s, revision, counter, error, created }
  }

  const firstFail = (count: number) => (n: number) => (n <= count ? timeout() : null)

  const expectNeverClaimed = (a: Tab) => {
    expect(a.runtime.claim()).toBeNull()
    expect(a.runtime.status()).toBe('signed-out')
    expect(a.events.sessionEstablished).not.toHaveBeenCalled()
    expect(a.events.tokensUpdated).not.toHaveBeenCalled()
    expect(a.events.sessionEnded).not.toHaveBeenCalled()
  }

  it('the caller is told the sign-in was cancelled, and the cleanup is tried once more at once', async () => {
    const { h, a, s, revision, counter, error, created } = await cancelledSignIn(firstFail(1))

    expect(error).toBeInstanceOf(SessionChangedElsewhereError)
    expect((error as Error).message).toBe('sign-in cancelled')
    // The commit, the cleanup that timed out, and the one that completed.
    expect(counter.transactions).toBe(3)
    expect(h.shared.state.record).toEqual({ revision: revision + 2, session: null })
    expect(a.channelPost).toHaveBeenCalledTimes(1)
    expect([...h.server.logoutCalls].sort()).toEqual([created.refreshToken, s.refreshToken].sort())
    expectNeverClaimed(a)

    // Nothing is left to do: a later reconcile opens no transaction.
    await a.runtime.reconcileNow()
    expect(counter.transactions).toBe(3)
    expect(a.channelPost).toHaveBeenCalledTimes(1)
  })

  it('when both attempts time out the record is cleared the next time the tab reconciles', async () => {
    const { h, a, b, s, revision, counter, error, created } = await cancelledSignIn(firstFail(2))

    expect(error).toBeInstanceOf(SessionChangedElsewhereError)
    expect(counter.transactions).toBe(3)
    // Nothing was committed by either attempt: the record still holds the session.
    expect(h.shared.state.record).toEqual({ revision: revision + 1, session: expect.objectContaining({ sessionId: created.sessionId }) })
    expect(a.channelPost).not.toHaveBeenCalled()
    expect([...h.server.logoutCalls].sort()).toEqual([created.refreshToken, s.refreshToken].sort())
    expectNeverClaimed(a)

    // A channel message (or a resume) is the tab's next reconcile.
    a.deliverChannel()
    await vi.waitFor(() => expect(h.shared.state.record.session).toBeNull())
    await flush()

    expect(counter.transactions).toBe(4)
    // Incremented once by the cleanup.
    expect(h.shared.state.record).toEqual({ revision: revision + 2, session: null })
    expect(h.shared.state.slices).toBeNull()
    expect(a.channelPost).toHaveBeenCalledTimes(1)
    expectNeverClaimed(a)
    // No logout is sent again.
    expect(h.server.logoutCalls).toHaveLength(2)

    // The pending cleanup is dropped once an attempt completed.
    await a.runtime.reconcileNow()
    a.deliverChannel()
    await flush()
    expect(counter.transactions).toBe(4)
    expect(a.channelPost).toHaveBeenCalledTimes(1)

    b.deliverChannel()
    await flush()
    expect(b.events.ended).toEqual(['elsewhere'])
  })

  it('a newer session committed before the retry is not cleared', async () => {
    const { h, a, b, revision, counter, created } = await cancelledSignIn(firstFail(2))
    expect(h.shared.state.record.session?.sessionId).toBe(created.sessionId)

    // Another tab signs in over the unclaimed session before A reconciles.
    await b.runtime.signIn({ usernameOrEmail: 'b2', password: 'p' })
    const newer = b.runtime.claim()
    expect(newer).toBeTruthy()
    expect(newer).not.toBe(created.sessionId)
    const committed = h.shared.state
    expect(committed.record.revision).toBe(revision + 2)
    const bEstablished = b.events.established

    await a.runtime.reconcileNow()

    // The attempt ran and wrote nothing: the stored state is the same object.
    expect(counter.transactions).toBe(4)
    expect(h.shared.state).toBe(committed)
    expect(h.shared.state.record.session?.sessionId).toBe(newer)
    expect(a.channelPost).not.toHaveBeenCalled()
    expectNeverClaimed(a)
    expect(b.runtime.claim()).toBe(newer)
    expect(b.runtime.status()).toBe('signed-in')
    expect(b.events.established).toBe(bEstablished)
    expect(await b.runtime.canDeliver((await b.runtime.beginRequest()).ref)).toBe(true)

    // It found nothing to clear, which settles it: no further attempt.
    await a.runtime.reconcileNow()
    expect(counter.transactions).toBe(4)
    expect(h.shared.state).toBe(committed)
  })

  it('the attempts are bounded: two at the cancellation and three later, then none', async () => {
    const { h, a, revision, counter, error, created } = await cancelledSignIn(() => timeout())
    expect(error).toBeInstanceOf(SessionChangedElsewhereError)
    expect(counter.transactions).toBe(1 + 2)

    for (let i = 0; i < 10; i += 1) await a.runtime.reconcileNow()

    expect(counter.transactions).toBe(1 + 2 + 3)
    // Never committed, so never announced; and the tab never took the session.
    expect(h.shared.state.record).toEqual({ revision: revision + 1, session: expect.objectContaining({ sessionId: created.sessionId }) })
    expect(a.channelPost).not.toHaveBeenCalled()
    expectNeverClaimed(a)
  })

  it('reconciles that overlap share one attempt', async () => {
    const { h, a, revision, counter } = await cancelledSignIn(firstFail(2))

    await Promise.all([a.runtime.reconcileNow(), a.runtime.reconcileNow(), a.runtime.reconcileNow()])

    expect(counter.transactions).toBe(4)
    expect(h.shared.state.record).toEqual({ revision: revision + 2, session: null })
    expect(a.channelPost).toHaveBeenCalledTimes(1)
  })

  it('a new sign-in in the same tab drops the pending cleanup', async () => {
    const { h, a, counter, created } = await cancelledSignIn(firstFail(2))
    expect(counter.transactions).toBe(3)

    // It commits over the unclaimed session, which is what the cleanup was for.
    await expect(a.runtime.signIn({ usernameOrEmail: 'a', password: 'p' })).resolves.toBeDefined()
    expect(counter.transactions).toBe(4)
    const claimed = a.runtime.claim()
    expect(claimed).toBeTruthy()
    expect(claimed).not.toBe(created.sessionId)
    const committed = h.shared.state

    await a.runtime.reconcileNow()
    a.deliverChannel()
    await flush()

    expect(counter.transactions).toBe(4)
    expect(h.shared.state).toBe(committed)
    expect(a.runtime.claim()).toBe(claimed)
    expect(a.runtime.status()).toBe('signed-in')
    expect(a.events.ended).toEqual([])
  })

  it('a cleanup that finds storage unusable makes the tab storage-unavailable and is not tried again', async () => {
    const { h, a, revision, counter, error, created } = await cancelledSignIn(() => new StorageUnavailableError('gone'))

    expect(error).toBeInstanceOf(StorageUnavailableError)
    expect(counter.transactions).toBe(2)
    expect(a.runtime.status()).toBe('storage-unavailable')
    expect(a.events.ended).toEqual(['storage'])
    expect(a.runtime.claim()).toBeNull()
    expect(a.events.sessionEstablished).not.toHaveBeenCalled()
    expect(a.channelPost).not.toHaveBeenCalled()

    // The tab writes nothing in that state.
    await a.runtime.reconcileNow().catch(() => undefined)
    expect(counter.transactions).toBe(2)
    expect(h.shared.state.record).toEqual({ revision: revision + 1, session: expect.objectContaining({ sessionId: created.sessionId }) })
  })

  it('the same when it is the second attempt that finds storage unusable', async () => {
    const { a, counter, error } = await cancelledSignIn((n) => (n === 1 ? timeout() : new StorageUnavailableError('gone')))

    expect(error).toBeInstanceOf(StorageUnavailableError)
    expect(counter.transactions).toBe(3)
    expect(a.runtime.status()).toBe('storage-unavailable')

    await a.runtime.reconcileNow().catch(() => undefined)
    expect(counter.transactions).toBe(3)
  })

  it('storage closing while a cleanup is pending drops it', async () => {
    const { a, counter } = await cancelledSignIn(firstFail(2))
    a.store.close()
    expect(a.runtime.status()).toBe('storage-unavailable')

    await a.runtime.reconcileNow().catch(() => undefined)
    expect(counter.transactions).toBe(3)
  })
})
